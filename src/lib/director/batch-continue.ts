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

  // 실제 제출은 다음 커밋에서 붙인다. 지금은 판정까지만 — 판정이 무엇을 시키는지 먼저 고정한다.
  const decision = decideNextBatchSubmissions({
    jobs,
    total,
    eligibleShotIds: [],
    concurrencyLimit: 3,
    takesAvailable: 0,
    takeCostPerVideo: 0,
    cancelled: false,
  })

  return { submitted: 0, stopReason: decision.stopReason }
}
