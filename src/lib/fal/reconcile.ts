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
  GenerationJobTerminalTransitionError,
  type GenerationJob,
} from '@/lib/generation-jobs'
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
      // 중복 finalize 경쟁(폴링 ↔ webhook) — 이미 종결된 잡은 성공으로 간주(no-op).
      console.warn('[fal/reconcile] duplicate finalize ignored (already terminal):', job.id)
      return { ...job, status: 'completed' }
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
