// 자리 예약 한 번에 DB 를 여러 번 오가지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteEq: vi.fn(),
  isUnlimited: vi.fn(),
  isExempt: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'generation_capacity_exempt_users') throw new Error(`unexpected table: ${table}`)
      return { upsert: mocks.upsert, delete: () => ({ eq: mocks.deleteEq }) }
    },
  },
}))
vi.mock('@/lib/quota-exempt-server', () => ({
  isUnlimitedCapacityUserId: mocks.isUnlimited,
  isQuotaExemptUserId: mocks.isExempt,
}))

import {
  _resetPersonalCapacitySyncForTests,
  syncGenerationCapacityExemption,
} from '@/lib/generation-quota'

beforeEach(() => {
  vi.clearAllMocks()
  _resetPersonalCapacitySyncForTests()
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.deleteEq.mockResolvedValue({ error: null })
  mocks.isUnlimited.mockResolvedValue(false)
  mocks.isExempt.mockResolvedValue(false)
})

describe('자리 예약 왕복 줄이기', () => {
  it('같은 사용자의 면제 동기화는 값이 같으면 10분 안에 다시 쓰지 않는다', async () => {
    vi.useFakeTimers()
    try {
      await syncGenerationCapacityExemption('user-a')
      await syncGenerationCapacityExemption('user-a')
      expect(mocks.deleteEq).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(10 * 60 * 1000 + 1)
      await syncGenerationCapacityExemption('user-a')
      expect(mocks.deleteEq).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('면제 값이 바뀌면 바로 다시 쓴다', async () => {
    await syncGenerationCapacityExemption('user-b')
    expect(mocks.deleteEq).toHaveBeenCalledTimes(1)

    mocks.isUnlimited.mockResolvedValue(true)
    await expect(syncGenerationCapacityExemption('user-b')).resolves.toBe(true)

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-b', per_user_limit: null }))
  })
})
