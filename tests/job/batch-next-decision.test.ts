// 사용자가 요청한 개수보다 많이 만들지 않는다
// 잔액이 모자라면 다음 것을 내지 않고 멈춘다
// 사용자가 그만두면 남은 것을 내지 않는다
// 점검이 여러 번 겹쳐 돌아도 같은 것을 두 번 내지 않는다
//
// #batch-resume(2026-09-09) 안전 약속 넷을 한 판정 함수로 묶는다. 완료 알림 경로와 주기 점검
// 경로가 같은 계산을 써야 두 경로가 어긋나지 않는다 — 각자 세면 둘 다 "아직 3개 미만이네" 하고
// 각자 내서 총량을 넘긴다. 영상 하나가 최대 5 Take 다.
//
// 이 판정은 서버가 사용자 없이 돈을 쓰는 자리다. 지금까지 모든 생성은 사람이 버튼을 눌러야
// 시작됐고, 이 기능으로 처음 그 전제가 깨진다.
import { describe, expect, it } from 'vitest'
import { decideNextBatchSubmissions } from '@/lib/director/batch-next'
import type { BatchJobRow } from '@/lib/director/batch-progress'

function job(overrides: Partial<BatchJobRow> = {}): BatchJobRow {
  return {
    id: 'job-1',
    batch_id: 'batch-1',
    batch_total: 10,
    status: 'completed',
    kind: 'shot_video',
    ...overrides,
  }
}

function input(overrides: Partial<Parameters<typeof decideNextBatchSubmissions>[0]> = {}) {
  return {
    jobs: [] as BatchJobRow[],
    total: 10,
    eligibleShotIds: ['sh_01', 'sh_02', 'sh_03', 'sh_04', 'sh_05'],
    concurrencyLimit: 3,
    takesAvailable: 100,
    takeCostPerVideo: 5,
    cancelled: false,
    ...overrides,
  }
}

describe('다음에 낼 것 판정', () => {
  it('동시 한도만큼만 낸다', () => {
    // 남은 게 많아도 한 번에 3개까지다 — Take 소진 속도를 통제하는 값이다.
    const decision = decideNextBatchSubmissions(input())

    expect(decision.shotIds).toEqual(['sh_01', 'sh_02', 'sh_03'])
  })

  it('이미 도는 것이 있으면 그만큼 덜 낸다', () => {
    // 한도 3개에 이미 2개가 돌고 있으면 1개만 더 낸다.
    const decision = decideNextBatchSubmissions(
      input({ jobs: [job({ id: 'a', status: 'queued' }), job({ id: 'b', status: 'queued' })] }),
    )

    expect(decision.shotIds).toHaveLength(1)
  })

  it('한도가 이미 찼으면 내지 않는다', () => {
    const jobs = Array.from({ length: 3 }, (_, i) => job({ id: `j${i}`, status: 'queued' }))

    const decision = decideNextBatchSubmissions(input({ jobs }))

    expect(decision.shotIds).toEqual([])
  })

  it('요청한 개수를 넘겨 내지 않는다', () => {
    // 9개를 이미 냈고 총량이 10이면 한도가 비어 있어도 1개만 낸다.
    const jobs = Array.from({ length: 9 }, (_, i) => job({ id: `j${i}` }))

    const decision = decideNextBatchSubmissions(input({ jobs }))

    expect(decision.shotIds).toHaveLength(1)
  })

  it('총량을 이미 채웠으면 내지 않는다', () => {
    const jobs = Array.from({ length: 10 }, (_, i) => job({ id: `j${i}` }))

    const decision = decideNextBatchSubmissions(input({ jobs }))

    expect(decision.shotIds).toEqual([])
    expect(decision.stopReason).toBe('complete')
  })
})

describe('Take 가 모자랄 때', () => {
  it('낼 수 있는 만큼만 낸다', () => {
    // 잔액 12, 영상 하나가 5 Take → 2개까지만.
    const decision = decideNextBatchSubmissions(input({ takesAvailable: 12 }))

    expect(decision.shotIds).toHaveLength(2)
  })

  it('한 개도 못 내면 멈추고 이유를 남긴다', () => {
    // 브라우저가 없으므로 거절을 볼 사람이 없다 — 조용히 계속 시도하면 실패 기록만 쌓인다.
    const decision = decideNextBatchSubmissions(input({ takesAvailable: 4 }))

    expect(decision.shotIds).toEqual([])
    expect(decision.stopReason).toBe('insufficient_takes')
  })

  it('이미 잡아둔 몫은 잔액에서 다시 빼지 않는다', () => {
    // 도는 잡의 Take 는 이미 hold 로 빠져 있다. 여기서 또 빼면 이중 계산이다.
    const decision = decideNextBatchSubmissions(
      input({ jobs: [job({ id: 'a', status: 'queued' })], takesAvailable: 10 }),
    )

    expect(decision.shotIds).toHaveLength(2)
  })
})

describe('사용자가 그만두면', () => {
  it('남은 것을 내지 않는다', () => {
    // 서버가 이어가면 창을 닫는 것으로는 멈출 수 없다 — 명시적인 중단이 필요하다.
    const decision = decideNextBatchSubmissions(input({ cancelled: true }))

    expect(decision.shotIds).toEqual([])
    expect(decision.stopReason).toBe('cancelled')
  })

  it('이미 도는 것은 건드리지 않는다', () => {
    // 제출된 영상은 이미 과금됐다. 중단은 "더 내지 않는다" 지 "돌던 것을 죽인다" 가 아니다.
    const decision = decideNextBatchSubmissions(
      input({ cancelled: true, jobs: [job({ id: 'a', status: 'queued' })] }),
    )

    expect(decision.shotIds).toEqual([])
    expect(decision.cancelInFlight).toBe(false)
  })
})

describe('만들 샷이 없을 때', () => {
  it('총량이 남아도 만들 샷이 없으면 멈춘다', () => {
    // 다른 경로로 영상이 채워졌을 수 있다. 없는 샷을 억지로 만들지 않는다.
    const decision = decideNextBatchSubmissions(input({ eligibleShotIds: [] }))

    expect(decision.shotIds).toEqual([])
    expect(decision.stopReason).toBe('nothing_eligible')
  })
})
