// 일괄을 시작하면 무엇을 몇 개 만들지 서버에 남는다
//
// 지금은 "10개 만들어줘" 의 순번이 브라우저 메모리에만 있다. 새로고침하면 아직 안 낸 것이
// 통째로 사라지고 아무 안내도 없다(#batch-resume 2026-09-09).
//
// 묶음을 generation_jobs 의 두 칸으로 남긴다 — 새 표를 만들지 않는다:
//   batch_id    같은 일괄에서 나온 잡끼리 묶는 값
//   batch_total 그 일괄이 만들기로 한 개수
// 남은 목록은 저장하지 않는다. "영상 없는 샷" 을 다시 세면 되기 때문이다(eligibleVideoBatchShotIds
// 가 지금도 그렇게 고른다). 저장하는 것은 "무엇을 몇 개 만들기로 했나" 뿐이다.
//
// 이 파일은 순수 계산만 검증한다 — DB 접근 없이 결정론적으로 돈다.
import { describe, expect, it } from 'vitest'
import {
  batchRemaining,
  isBatchSettled,
  type BatchJobRow,
} from '@/lib/director/batch-progress'

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

describe('일괄 묶음 세기', () => {
  it('아직 만들지 않은 개수를 센다', () => {
    // 10개 중 3개를 냈다 — 7개가 남았다.
    const jobs = [job({ id: 'a' }), job({ id: 'b' }), job({ id: 'c', status: 'queued' })]

    expect(batchRemaining(jobs, 10)).toBe(7)
  })

  it('실패한 것은 다시 만들지 않는다', () => {
    // 실패는 이미 시도한 것이다. 다시 내면 같은 이유로 또 실패하고 Take 만 나간다.
    const jobs = [job({ id: 'a' }), job({ id: 'b', status: 'failed' })]

    expect(batchRemaining(jobs, 10)).toBe(8)
  })

  it('요청한 개수를 넘겨 세지 않는다', () => {
    // 완료 알림과 주기 점검이 동시에 내면 총량을 넘길 수 있다 — 음수가 아니라 0 이다.
    const jobs = Array.from({ length: 12 }, (_, i) => job({ id: `j${i}` }))

    expect(batchRemaining(jobs, 10)).toBe(0)
  })

  it('다른 묶음의 잡은 세지 않는다', () => {
    // 같은 프로젝트에서 일괄을 두 번 걸 수 있다.
    const jobs = [job({ id: 'a' }), job({ id: 'b', batch_id: 'batch-2' })]

    expect(batchRemaining(jobs.filter((j) => j.batch_id === 'batch-1'), 10)).toBe(9)
  })
})

describe('일괄이 끝났는지 판정', () => {
  it('요청한 만큼 다 냈으면 끝난 것으로 본다', () => {
    // 끝을 표시하지 않으면 주기 점검이 이 묶음을 영원히 들여다본다.
    const jobs = Array.from({ length: 10 }, (_, i) => job({ id: `j${i}` }))

    expect(isBatchSettled(jobs, 10)).toBe(true)
  })

  it('아직 낼 것이 남았으면 끝나지 않은 것으로 본다', () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' })]

    expect(isBatchSettled(jobs, 10)).toBe(false)
  })

  it('만드는 중인 것이 있으면 끝나지 않은 것으로 본다', () => {
    // 다 냈어도 아직 도는 게 있으면 완료 알림이 더 온다.
    const jobs = [
      ...Array.from({ length: 9 }, (_, i) => job({ id: `j${i}` })),
      job({ id: 'last', status: 'queued' }),
    ]

    expect(isBatchSettled(jobs, 10)).toBe(false)
  })
})
