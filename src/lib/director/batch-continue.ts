// 일괄 이어가기 — 서버가 다음 영상을 낸다.
//
// #batch-resume(2026-09-09) 슬라이스 B. 예전에는 브라우저가 3개씩 내고 완료를 기다리며 8~10분
//   붙잡혀 있었고, 그 사이 새로고침하면 아직 안 낸 것이 통째로 사라졌다.
//
//   두 다리가 이 함수를 부른다:
//     완료 알림(webhook)  — 정상 경로. 하나 끝날 때마다 빠르게 이어간다
//     주기 점검(cron 2분) — 안전망. 알림이 유실돼 멈춘 묶음을 잇는다
//
//   두 경로가 겹쳐 돌 수 있으므로 "무엇을 낼까" 는 반드시 decideNextBatchSubmissions 하나로
//   판정한다 — 각자 세면 둘 다 "아직 한도 미만이네" 하고 각자 내서 총량을 넘긴다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { decideNextBatchSubmissions, type BatchStopReason } from '@/lib/director/batch-next'
import type { BatchJobRow } from '@/lib/director/batch-progress'
import { eligibleShotIdsFromRows, type ShotVideoRow } from '@/lib/director/batch-eligible'
import { MAX_QUEUED_VIDEO_JOBS_PER_USER } from '@/lib/generation-quota'
import { takeBalance } from '@/lib/billing/take-ledger'
import { TAKE_COST_BY_MODEL } from '@/lib/billing/take-cost'

/**
 * 영상 하나에 드는 Take 의 최대치 — 카탈로그에서 파생시킨다.
 *   숫자를 따로 적으면 모델 단가가 바뀔 때 조용히 어긋나고, 적게 잡으면 잔액이 모자란 채
 *   제출해서 402 만 쌓인다(브라우저가 없으므로 그 거절을 볼 사람도 없다).
 */
const MAX_TAKE_COST_PER_VIDEO = Math.max(...Object.values(TAKE_COST_BY_MODEL))

export interface ContinueBatchInput {
  batchId: string
  projectId: string
}

export interface ContinueBatchResult {
  submitted: number
  stopReason: BatchStopReason | null
}

/**
 * 이 묶음의 잡을 전부 읽는다. 남은 개수·도는 개수 판정의 근거다.
 *
 * 목록을 저장하지 않기 때문에 매번 다시 읽는다 — 그래야 다른 경로로 채워진 영상도 반영된다.
 */
async function loadBatchJobs(batchId: string): Promise<BatchJobRow[]> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, batch_id, batch_total, status, kind')
    .eq('batch_id', batchId)
  if (error) throw error
  return (data ?? []) as BatchJobRow[]
}

/**
 * 다음 영상을 낸다.
 *
 * 호출자(webhook·cron)는 이 함수가 던져도 성공으로 답해야 한다 — 실패를 알리면 생성 서비스가
 * 같은 알림을 다시 보내고, 그러면 방금 저장한 영상을 또 저장하려 든다.
 */
export async function continueVideoBatch(
  input: ContinueBatchInput,
): Promise<ContinueBatchResult> {
  const jobs = await loadBatchJobs(input.batchId)
  if (jobs.length === 0) return { submitted: 0, stopReason: 'complete' }

  const total = jobs.find((job) => job.batch_total != null)?.batch_total ?? 0

  // 판정 재료를 모은다. 남은 "목록" 은 저장하지 않으므로 매번 DB 에서 다시 센다 —
  //   그래야 다른 경로로 채워진 영상도 반영된다.
  const [eligibleShotIds, takesAvailable] = await Promise.all([
    loadEligibleShotIds(input.projectId),
    loadTakeBalance(input.projectId),
  ])

  const decision = decideNextBatchSubmissions({
    jobs,
    total,
    eligibleShotIds,
    concurrencyLimit: MAX_QUEUED_VIDEO_JOBS_PER_USER,
    takesAvailable,
    // 모델별로 다르지만 여기서는 가장 비싼 값을 쓴다 — 적게 잡으면 잔액이 모자란 채 제출한다.
    takeCostPerVideo: MAX_TAKE_COST_PER_VIDEO,
    // 중단은 브라우저 상태다. 서버가 이어갈 때의 중단 표시는 다음 슬라이스에서 DB 로 옮긴다.
    cancelled: false,
  })

  if (decision.shotIds.length === 0) {
    return { submitted: 0, stopReason: decision.stopReason }
  }

  // 실제 제출 배선은 다음 커밋이다. 지금은 "무엇을 몇 개 낼지" 까지 확정하고 기록만 남긴다 —
  //   판정이 실제 재료로 맞게 도는지 먼저 확인하고 제출을 붙인다.
  console.info(
    '[batch-continue] ready to submit:',
    input.batchId,
    decision.shotIds.length,
    decision.shotIds.join(','),
  )
  return { submitted: 0, stopReason: null }
}

/** 이 프로젝트에서 아직 완성 영상이 없는 샷 — 화면 기준과 같은 두 조건을 DB 행으로 본다. */
async function loadEligibleShotIds(projectId: string): Promise<string[]> {
  const { data: shots, error: shotsError } = await supabaseAdmin
    .from('shots')
    .select('shot_id')
    .eq('project_id', projectId)
    .order('shot_id')
  if (shotsError) throw shotsError

  const { data: clips, error: clipsError } = await supabaseAdmin
    .from('video_clips')
    .select('shot_id, status, url, last_attempt_status, deleted_at')
    .eq('project_id', projectId)
  if (clipsError) throw clipsError

  return eligibleShotIdsFromRows(
    (shots ?? []).map((row) => row.shot_id as string),
    (clips ?? []) as ShotVideoRow[],
  )
}

/** 이 프로젝트가 속한 작업 공간의 잔액. 도는 잡의 몫은 이미 hold 로 빠져 있다. */
async function loadTakeBalance(projectId: string): Promise<number> {
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('workspace_id')
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error
  if (!project?.workspace_id) return 0
  return takeBalance(project.workspace_id as string)
}
