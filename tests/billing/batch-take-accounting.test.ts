// 서버가 이어서 만든 영상도 Take 가 정확히 한 번씩만 나간다
//
// #batch-resume(2026-09-09) 오너 결정 ④. 이 기능은 서버가 사용자 없이 돈을 쓰는 첫 자리다.
// 지금까지 모든 생성은 사람이 버튼을 눌러야 시작됐다 — 잘못되면 안 시킨 영상이 만들어지고
// Take 가 나가는데 그걸 볼 사람이 없다.
//
// 장부는 단조롭게 늘어야 한다: 낸 영상 수 == hold 횟수. 이어가기가 그 관계를 깨지 않는지 본다.
import { describe, expect, it } from 'vitest'
import { decideNextBatchSubmissions } from '@/lib/director/batch-next'
import { batchRemaining } from '@/lib/director/batch-progress'
import type { BatchJobRow } from '@/lib/director/batch-progress'

const COST = 5 // takeCostForDirectorVideo 최대치

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

/**
 * 일괄 하나를 끝까지 돌려본다 — 완료 알림과 주기 점검이 번갈아 판정을 부르는 상황을 흉내낸다.
 * 실제 제출·과금은 하지 않고, 판정이 시킨 횟수만 센다.
 */
function runBatch(options: {
  total: number
  eligible: number
  takesAvailable: number
  extraCallsPerRound?: number
}): { submitted: number; takesSpent: number; rounds: number } {
  const jobs: BatchJobRow[] = []
  let takes = options.takesAvailable
  let submitted = 0
  let rounds = 0

  for (let guard = 0; guard < 100; guard += 1) {
    rounds += 1
    // 같은 판정을 여러 번 불러도 결과가 누적되면 안 된다(약속 11) — 겹쳐 도는 점검을 흉내낸다.
    const calls = 1 + (options.extraCallsPerRound ?? 0)
    let picked: string[] = []
    for (let i = 0; i < calls; i += 1) {
      const decision = decideNextBatchSubmissions({
        jobs,
        total: options.total,
        eligibleShotIds: Array.from(
          { length: Math.max(0, options.eligible - submitted) },
          (_, k) => `sh_${submitted + k}`,
        ),
        concurrencyLimit: 3,
        takesAvailable: takes,
        takeCostPerVideo: COST,
        cancelled: false,
      })
      // 실제로는 제출이 원자적이므로 한 라운드에 한 번만 반영된다.
      if (i === 0) picked = decision.shotIds
    }
    if (picked.length === 0) break

    for (const shotId of picked) {
      jobs.push(job({ id: `job-${shotId}`, status: 'queued' }))
      takes -= COST
      submitted += 1
    }
    // 다음 라운드 전에 도는 것들이 끝난다.
    for (const row of jobs) if (row.status === 'queued') row.status = 'completed'
  }

  return { submitted, takesSpent: options.takesAvailable - takes, rounds }
}

describe('일괄 전체를 돌렸을 때 장부', () => {
  it('요청한 개수만큼만 Take 가 나간다', () => {
    const result = runBatch({ total: 10, eligible: 20, takesAvailable: 1000 })

    expect(result.submitted).toBe(10)
    expect(result.takesSpent).toBe(10 * COST)
  })

  it('점검이 겹쳐 돌아도 더 나가지 않는다', () => {
    // 주기 2분이면 앞 점검이 끝나기 전에 다음이 시작될 수 있다.
    const result = runBatch({ total: 10, eligible: 20, takesAvailable: 1000, extraCallsPerRound: 3 })

    expect(result.submitted).toBe(10)
    expect(result.takesSpent).toBe(10 * COST)
  })

  it('만들 샷이 요청보다 적으면 있는 만큼만 나간다', () => {
    const result = runBatch({ total: 10, eligible: 4, takesAvailable: 1000 })

    expect(result.submitted).toBe(4)
    expect(result.takesSpent).toBe(4 * COST)
  })

  it('잔액이 바닥나면 거기서 멈춘다', () => {
    // 17 Take → 3개까지(15), 나머지 2는 한 개 값이 안 된다.
    const result = runBatch({ total: 10, eligible: 20, takesAvailable: 17 })

    expect(result.submitted).toBe(3)
    expect(result.takesSpent).toBe(15)
  })

  it('잔액이 0 이면 한 개도 나가지 않는다', () => {
    const result = runBatch({ total: 10, eligible: 20, takesAvailable: 0 })

    expect(result.submitted).toBe(0)
    expect(result.takesSpent).toBe(0)
  })
})

describe('중단했을 때 장부', () => {
  it('중단 뒤에는 Take 가 더 나가지 않는다', () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' })]

    const decision = decideNextBatchSubmissions({
      jobs,
      total: 10,
      eligibleShotIds: ['sh_03', 'sh_04'],
      concurrencyLimit: 3,
      takesAvailable: 1000,
      takeCostPerVideo: COST,
      cancelled: true,
    })

    expect(decision.shotIds).toEqual([])
  })

  it('중단해도 이미 낸 것의 장부는 그대로다', () => {
    // 제출된 영상은 이미 과금됐다 — 되돌리지 않는다. 결과라도 받는 편이 낫다.
    const jobs = [job({ id: 'a' }), job({ id: 'b', status: 'queued' })]

    expect(batchRemaining(jobs, 10)).toBe(8)
  })
})
