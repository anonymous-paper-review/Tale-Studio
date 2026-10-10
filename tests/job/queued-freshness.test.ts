// 30분 넘게 대기 상태로 멈춘 작업은 지금 진행 중인 작업으로 세지 않는다
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { countQueuedJobsByUser } from '@/lib/generation-jobs'

function countQuery(count: number) {
  const value = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    in: vi.fn(),
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve({ count, error: null }).then(onFulfilled),
  }
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.gte.mockReturnValue(value)
  value.in.mockReturnValue(value)
  return value
}

describe('대기 작업 세기', () => {
  afterEach(() => vi.useRealTimers())

  it('30분 넘게 대기 상태로 멈춘 러프 스토리보드는 만들어지는 중으로 치지 않는다', async () => {
    // 왜: webhook 을 잃고 대기에 남은 작업(예: writer_test_00 의 10/1 러프 2건) 때문에 Artist 가 계속 한 장씩에 묶이지 않게.
    //   이미 있던 쿼터 집계 기준(#quota-staleness 2026-08-05)을 Artist 자리 판단도 그대로 쓴다 — 그 기준을 고정한다.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T06:00:00.000Z'))
    const q = countQuery(2)
    mocks.from.mockReturnValueOnce(q)
    await expect(countQueuedJobsByUser('user-1', ['shot_rough_storyboard'])).resolves.toBe(2)
    expect(mocks.from).toHaveBeenCalledWith('generation_jobs')
    expect(q.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(q.eq).toHaveBeenCalledWith('status', 'queued')
    expect(q.gte).toHaveBeenCalledWith('created_at', '2026-10-09T05:30:00.000Z')
    expect(q.in).toHaveBeenCalledWith('kind', ['shot_rough_storyboard'])
  })
})
