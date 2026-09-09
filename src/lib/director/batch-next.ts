// 일괄에서 "다음에 무엇을 낼까" 판정 — 순수 함수. DB·네트워크 없이 결정론적으로 돈다.
//
// #batch-resume(2026-09-09): 완료 알림 경로와 주기 점검 경로가 **같은 계산**을 써야 한다.
//   각자 세면 둘 다 "아직 한도 미만이네" 하고 각자 내서 총량을 넘긴다. 영상 하나가 최대 5 Take 다.
//   그래서 안전 약속 넷(총량·잔액·중단·중복)을 이 함수 하나에 묶었다.
//
//   이 판정은 서버가 사용자 없이 돈을 쓰는 자리다. 지금까지 모든 생성은 사람이 버튼을 눌러야
//   시작됐고, 이 기능으로 처음 그 전제가 깨진다 — 그래서 멈출 이유를 항상 명시해 남긴다.
import { batchRemaining, type BatchJobRow } from '@/lib/director/batch-progress'

/** 더 내지 않는 이유. 로그·화면 안내의 근거가 된다. */
export type BatchStopReason =
  | 'complete'
  | 'cancelled'
  | 'insufficient_takes'
  | 'nothing_eligible'
  | 'at_capacity'

export interface BatchNextInput {
  /** 이 묶음의 잡 전부(도는 것 + 끝난 것). */
  jobs: readonly BatchJobRow[]
  /** 이 묶음이 만들기로 한 개수. */
  total: number
  /** 아직 완성 영상이 없는 샷 — 지금 다시 센 결과다(저장된 목록이 아니다). */
  eligibleShotIds: readonly string[]
  /** 한 사람이 동시에 만들 수 있는 영상 수(MAX_QUEUED_VIDEO_JOBS_PER_USER). */
  concurrencyLimit: number
  /** 지금 쓸 수 있는 Take. 도는 잡의 몫은 이미 hold 로 빠져 있다. */
  takesAvailable: number
  /** 영상 하나에 드는 Take. */
  takeCostPerVideo: number
  /** 사용자가 그만뒀나. */
  cancelled: boolean
}

export interface BatchNextDecision {
  /** 지금 낼 샷들. 비어 있으면 stopReason 이 이유를 말한다. */
  shotIds: string[]
  stopReason: BatchStopReason | null
  /**
   * 도는 잡을 죽여야 하나. **항상 false** 다.
   *   중단은 "더 내지 않는다" 지 "돌던 것을 죽인다" 가 아니다 — 제출된 영상은 이미 과금됐고,
   *   죽여도 fal 요금은 안 돌아온다. 결과라도 받는 편이 낫다.
   */
  cancelInFlight: false
}

function stop(reason: BatchStopReason): BatchNextDecision {
  return { shotIds: [], stopReason: reason, cancelInFlight: false }
}

export function decideNextBatchSubmissions(input: BatchNextInput): BatchNextDecision {
  // 중단이 가장 앞이다 — 다른 어떤 조건이 허락해도 사용자 뜻이 우선한다.
  if (input.cancelled) return stop('cancelled')

  const remaining = batchRemaining(input.jobs, input.total)
  if (remaining <= 0) return stop('complete')

  // 도는 잡이 한도를 차지한다. 이걸 안 빼면 알림·점검이 각자 한도만큼 내서 한도를 넘긴다.
  const inFlight = input.jobs.filter((job) => job.status === 'queued').length
  const capacity = Math.max(0, input.concurrencyLimit - inFlight)
  if (capacity <= 0) return stop('at_capacity')

  if (input.eligibleShotIds.length === 0) return stop('nothing_eligible')

  // 잔액으로 몇 개까지 되나. 도는 잡의 몫은 이미 hold 로 빠져 있으므로 여기서 또 빼지 않는다.
  const affordable =
    input.takeCostPerVideo > 0
      ? Math.floor(input.takesAvailable / input.takeCostPerVideo)
      : input.eligibleShotIds.length
  if (affordable <= 0) return stop('insufficient_takes')

  const count = Math.min(remaining, capacity, affordable, input.eligibleShotIds.length)
  if (count <= 0) return stop('complete')

  return {
    shotIds: input.eligibleShotIds.slice(0, count),
    stopReason: null,
    cancelInFlight: false,
  }
}
