// 일괄 생성의 남은 개수·완료 판정 — 순수 함수만 둔다(클라·서버 공용, DB 없음).
//
// #batch-resume(2026-09-09): 예전에는 "10개 만들어줘" 의 순번이 브라우저 메모리에만 있었다.
//   새로고침하면 아직 안 낸 것이 통째로 사라지고 아무 안내도 없었다. 이제 묶음을
//   generation_jobs 의 batch_id · batch_total 두 칸으로 남기고, 서버가 이어서 낸다.
//
//   남은 목록 자체는 저장하지 않는다 — "영상 없는 샷" 을 다시 세면 되기 때문이다
//   (eligibleVideoBatchShotIds 가 지금도 그렇게 고른다). 저장하는 것은 "몇 개 만들기로 했나" 뿐이다.
//
//   순수 함수로 두는 이유는 generation-batches.ts 와 같다: 완료 알림 경로와 주기 점검 경로가
//   같은 계산을 써야 하고, 그 계산이 결정론적이어야 두 경로가 어긋나지 않는다.
import type { GenerationJobKind, GenerationJobStatus } from '@/lib/generation-jobs'

export interface BatchJobRow {
  id: string
  batch_id: string | null
  batch_total: number | null
  status: GenerationJobStatus
  kind: GenerationJobKind
}

/**
 * 이 묶음에서 아직 만들지 않은 개수.
 *
 * 실패한 잡도 "이미 시도한 것" 으로 센다 — 다시 내면 같은 이유로 또 실패하고 Take 만 나간다.
 * 총량을 넘겨 제출된 경우(알림·점검이 동시에 낸 경우)에도 음수가 아니라 0 을 돌려준다.
 */
export function batchRemaining(jobs: readonly BatchJobRow[], total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, total - jobs.length)
}

/**
 * 이 묶음이 끝났는지.
 *
 * 둘 다 참이어야 끝이다: ① 요청한 만큼 다 냈다 ② 도는 것이 없다.
 * ②를 안 보면 마지막 잡의 완료 알림이 오기 전에 끝으로 표시돼, 그 알림이 다음 것을 못 낸다.
 * 끝을 표시하지 않으면 반대로 주기 점검이 이 묶음을 영원히 들여다본다.
 */
export function isBatchSettled(jobs: readonly BatchJobRow[], total: number): boolean {
  if (batchRemaining(jobs, total) > 0) return false
  return !jobs.some((job) => job.status === 'queued')
}
