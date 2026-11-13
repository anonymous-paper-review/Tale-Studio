// 영상 묶음의 차례(11/5 시안 DG, 2026-11-09): 지금 만드는 작업과 아직 안 낸 샷 — 서버 묶음 기록에서 고른다. 순수 함수.
//   멈췄거나 쉬는 묶음의 남은 샷은 만들지 않으므로 차례에 두지 않는다(계속 기다리는 것처럼 보이면 안 된다).
//   묶음 조회(video-batch-client)와 [먼저 하기](video-batch-order)가 같이 쓴다.
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

export function videoBatchQueueOf(summary: VideoBatchSummary): { jobIds: string[]; pendingShotIds: string[] } {
  return {
    jobIds: summary.jobs.flatMap((job) => (job.jobId && job.status === 'queued' ? [job.jobId] : [])),
    pendingShotIds: summary.status === 'running' ? summary.pendingShotIds ?? [] : [],
  }
}
