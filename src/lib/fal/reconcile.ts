// FAL 큐 상태를 진실로 삼아 generation_job 을 reconcile — webhook 누락/조기-에러 공통 안전망.
//
// 두 호출처가 공유한다(중복 finalize 디스패치 제거):
//   1) GET /api/generation-jobs/[id] — queued 잡 폴링 시 webhook 미도착 대비.
//   2) POST /api/fal/webhook — 사유 없는 generic 'ERROR' webhook(느린 i2i 의 fal 조기/타임아웃)을
//      터미널로 믿지 않고 FAL 큐 진실로 재확인(완료면 회수). shot 이미지가 영영 실패로 굳던 버그(2026-06-30).
//
// 멱등: 호출 전 job.status==='queued' 전제(각 finalize 가 다시 가드). COMPLETED→finalize, FAILED→fail,
//   그 외(IN_QUEUE/IN_PROGRESS/일시오류)→그대로 두어 다음 폴링/webhook 이 마저 처리.
import {
  failGenerationJob,
  getGenerationJobById,
  GenerationJobTerminalTransitionError,
  GENERATION_JOB_COLUMNS,
  STALE_QUEUED_MS,
  type GenerationJob,
} from '@/lib/generation-jobs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { markDirectorVideoAttemptFailed } from '@/lib/director-video-takes'
import { falImageFetch, falVideoFetch } from '@/lib/writer/llm/fal'
import {
  DirectorVideoCompletionPersistenceError,
  finalizeGenerationJob,
} from '@/lib/fal/finalize'

async function terminalizeJob(job: GenerationJob, message: string): Promise<GenerationJob> {
  if (job.kind === 'shot_video' && job.video_clip_id) {
    await markDirectorVideoAttemptFailed(job.project_id, job.id, message)
  } else {
    await failGenerationJob(job.id, message)
  }
  return { ...job, status: 'failed', error: message }
}

async function completeOrTerminalizeJob(
  job: GenerationJob,
  result: Parameters<typeof finalizeGenerationJob>[1] | (() => Parameters<typeof finalizeGenerationJob>[1]),
): Promise<GenerationJob> {
  try {
    const url = await finalizeGenerationJob(job, typeof result === 'function' ? result() : result)
    return { ...job, status: 'completed', result_url: url }
  } catch (error) {
    if (error instanceof GenerationJobTerminalTransitionError) {
      // 중복 finalize 경쟁(폴링 ↔ webhook) — 이미 종결됐으니 진실은 DB 에 있다. 반드시 다시 읽는다.
      //   여기서 job 은 요청 시작 시점의 *queued* 스냅샷이라 result_url 이 null 이다. 그대로
      //   completed 로 돌려주면 폴링 클라(pollGenerationJob)가 "완료됐지만 결과 URL이 없음"으로
      //   던져, 서버에선 멀쩡히 끝난 생성이 화면에선 실패로 굳었다(#dup-finalize-null-url 2026-07-31).
      //   경쟁의 승자가 실패로 종결했을 수도 있으므로 status 까지 DB 값을 그대로 채택한다.
      console.warn('[fal/reconcile] duplicate finalize ignored (already terminal):', job.id)
      return (await getGenerationJobById(job.id)) ?? { ...job, status: 'completed' }
    }
    if (error instanceof DirectorVideoCompletionPersistenceError) {
      console.error('[fal/reconcile] video persistence failed; retaining queued attempt:', error.message)
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    return terminalizeJob(job, message)
  }
}

function resolveLocalVideoResultUrl(job: GenerationJob): string {
  try {
    const result = new URL(job.request_id)
    const configured = new URL(process.env.TAILSCALE_VIDEO_API_URL ?? '')
    if (
      result.username
      || result.password
      || configured.username
      || configured.password
      || (result.protocol !== 'http:' && result.protocol !== 'https:')
      || (configured.protocol !== 'http:' && configured.protocol !== 'https:')
      || result.origin !== configured.origin
    ) throw new Error('untrusted local video result URL')
    return result.toString()
  } catch {
    throw new Error('local video job has no valid result URL')
  }
}

function isPermanentProviderLookupFailure(error: unknown): boolean {
  const statusValue = typeof error === 'object' && error !== null
    ? (error as { status?: unknown; statusCode?: unknown }).status
      ?? (error as { statusCode?: unknown }).statusCode
    : undefined
  const status = typeof statusValue === 'number'
    ? statusValue
    : typeof statusValue === 'string' ? Number(statusValue) : undefined
  return typeof status === 'number' && Number.isFinite(status) && status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429
}

/** queued job을 persisted provider의 진실로 reconcile한다. Provider 조회 오류만 queued로 남긴다. */
export async function reconcileJobFromFal(job: GenerationJob): Promise<GenerationJob> {
  if (job.request_id.startsWith('reserved:')) return job

  if (job.provider === 'local') {
    if (job.kind !== 'shot_video') return job
    return completeOrTerminalizeJob(job, () => ({
      media: 'video',
      url: resolveLocalVideoResultUrl(job),
    }))
  }

  let result: Awaited<ReturnType<typeof falImageFetch | typeof falVideoFetch>>
  try {
    result = job.kind === 'shot_video' || job.kind === 'shot_previz_video'
      ? await falVideoFetch(job.model, job.request_id)
      : await falImageFetch(job.model, job.request_id)
  } catch (error) {
    if (isPermanentProviderLookupFailure(error)) {
      const message = error instanceof Error ? error.message : String(error)
      return terminalizeJob(job, message)
    }
    console.error('[fal/reconcile] transient provider fetch failed:', error instanceof Error ? error.message : error)
    return job
  }

  if (result.status === 'IN_QUEUE' || result.status === 'IN_PROGRESS') return job

  if (result.status === 'FAILED') {
    return terminalizeJob(job, result.error)
  }
  if (result.status !== 'COMPLETED') return job

  return completeOrTerminalizeJob(
    job,
    job.kind === 'shot_video' || job.kind === 'shot_previz_video'
      ? { media: 'video', url: result.url, payload: result.raw }
      : { media: 'image', url: result.url, payload: result.raw },
  )
}

// ── 유령 queued 잡 회수 (#ghost-reconcile 2026-08-17) ──
//
// STALE_QUEUED_MS 를 넘긴 queued 잡은 active 목록에서 숨겨지는데(listActiveGenerationJobs),
// 숨기기만 하면 제출 탭의 폴링이 죽은 잡은 아무도 fal 진실을 회수하지 않는다 — 과금은 끝났고
// 결과가 fal 큐에 있는데 화면은 영영 무반응(실측: rough 잡 5시간 queued 방치). webhook 없는
// 로컬(resolveWebhookUrl()=undefined)에선 폴링이 유일한 완결 경로라 특히 잘 갇힌다.
// active 라우트가 목록 조회 전에 이 스윕을 호출해, 유령을 fal 진실로 종결시킨다
// (완료→finalize 회수, 실패→failed 배지, 진행 중→그대로). 자동 재생성이 아니라 이미 지불한
// 결과의 회수이므로 과금 원칙(빈칸 자율 채움 금지 대상 아님)과 충돌하지 않는다.

const GHOST_SWEEP_THROTTLE_MS = 60_000
const GHOST_SWEEP_MAX_JOBS = 5
const ghostSweepLastRun = new Map<string, number>()

export function _resetGhostSweepThrottleForTest(): void {
  ghostSweepLastRun.clear()
}

/** 프로젝트의 유령 queued 잡을 fal 진실로 종결 시도. 실패는 삼키고 목록 조회를 막지 않는다. */
export async function reconcileGhostQueuedJobs(projectId: string): Promise<number> {
  const last = ghostSweepLastRun.get(projectId) ?? 0
  const now = Date.now()
  if (now - last < GHOST_SWEEP_THROTTLE_MS) return 0
  ghostSweepLastRun.set(projectId, now)

  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select(GENERATION_JOB_COLUMNS)
    .eq('project_id', projectId)
    .eq('status', 'queued')
    .lt('created_at', new Date(now - STALE_QUEUED_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(GHOST_SWEEP_MAX_JOBS)
  if (error) {
    console.error('[fal/reconcile] ghost sweep query failed:', error.message)
    return 0
  }

  let settled = 0
  for (const row of (data ?? []) as unknown as GenerationJob[]) {
    try {
      const after = await reconcileJobFromFal(row)
      if (after.status !== 'queued') settled += 1
    } catch (e) {
      // 잡 하나의 회수 실패가 스윕 전체·목록 조회를 죽이면 안 된다. 다음 스윕이 재시도한다.
      console.error('[fal/reconcile] ghost sweep job failed:', row.id, e instanceof Error ? e.message : e)
    }
  }
  if (settled > 0) console.log(`[fal/reconcile] ghost sweep settled ${settled} job(s) (project ${projectId})`)
  return settled
}
