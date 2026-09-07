// 사용자가 얻거나 쓰는 Take 내역을 기록하고 남은 Take를 정확히 계산한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { grantTakes, manualAdjustTakes, takeBalance } from '@/lib/billing/take-ledger'

function query(result: unknown) {
  const value = {
    insert: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  value.insert.mockReturnValue(value)
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.single.mockResolvedValue(result)
  return value
}

describe('Take 사용 내역', () => {
  beforeEach(() => vi.resetAllMocks())

  describe('takeBalance', () => {
    it('기록된 Take 변화를 합산해 잔액을 계산한다', async () => {
      mocks.from.mockReturnValueOnce(
        query({ data: [{ delta: 100 }, { delta: -30 }, { delta: -5 }], error: null }),
      )
      await expect(takeBalance('ws-1')).resolves.toBe(65)
    })

    it('내역이 없으면 잔액을 0으로 알려준다', async () => {
      mocks.from.mockReturnValueOnce(query({ data: [], error: null }))
      await expect(takeBalance('ws-1')).resolves.toBe(0)
    })

    it('내역을 읽지 못하면 오류를 알린다', async () => {
      const error = { message: 'db unavailable' }
      mocks.from.mockReturnValueOnce(query({ data: null, error }))
      await expect(takeBalance('ws-1')).rejects.toBe(error)
    })
  })

  describe('grantTakes', () => {
    it('양수 Take를 지급하면 지급 내역을 기록한다', async () => {
      const insertion = query({ data: { id: 'grant-1' }, error: null })
      mocks.from.mockReturnValueOnce(insertion)

      await expect(
        grantTakes({ workspaceId: 'ws-1', amount: 100, kind: 'grant_plan', expiresAt: '2026-10-01T00:00:00.000Z' }),
      ).resolves.toEqual({ id: 'grant-1' })

      expect(insertion.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          delta: 100,
          kind: 'grant_plan',
          expires_at: '2026-10-01T00:00:00.000Z',
        }),
      )
    })

    it('지급량이 0 이하이면 내역을 기록하지 않고 거부한다', async () => {
      await expect(grantTakes({ workspaceId: 'ws-1', amount: 0, kind: 'grant_plan' })).rejects.toThrow()
      await expect(grantTakes({ workspaceId: 'ws-1', amount: -5, kind: 'grant_plan' })).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })

    it('지급량이 정수가 아니면 내역을 기록하지 않고 거부한다', async () => {
      await expect(grantTakes({ workspaceId: 'ws-1', amount: 1.5, kind: 'grant_plan' })).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })

    it('지급 종류가 허용된 범위가 아니면 거부한다', async () => {
      // @ts-expect-error — 잘못된 kind 를 의도적으로 넣어 런타임 가드를 검증
      await expect(grantTakes({ workspaceId: 'ws-1', amount: 10, kind: 'consume' })).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })
  })

  describe('manualAdjustTakes', () => {
    it('조정 사유가 있으면 Take 변경 내역을 기록한다(차감 허용)', async () => {
      const insertion = query({ data: { id: 'adj-1' }, error: null })
      mocks.from.mockReturnValueOnce(insertion)

      await expect(
        manualAdjustTakes({ workspaceId: 'ws-1', delta: -20, reason: '환불 회수', adminUserId: 'admin-1' }),
      ).resolves.toEqual({ id: 'adj-1' })

      expect(insertion.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          delta: -20,
          kind: 'manual_adjust',
          ref_kind: 'admin',
          ref_id: 'admin-1',
          reason: '환불 회수',
        }),
      )
    })

    it('조정 사유가 없으면 내역을 기록하지 않고 거부한다', async () => {
      await expect(
        manualAdjustTakes({ workspaceId: 'ws-1', delta: 10, reason: '', adminUserId: 'admin-1' }),
      ).rejects.toThrow()
      await expect(
        manualAdjustTakes({ workspaceId: 'ws-1', delta: 10, reason: '   ', adminUserId: 'admin-1' }),
      ).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })

    it('관리자 정보가 없으면 내역을 기록하지 않고 거부한다', async () => {
      await expect(
        manualAdjustTakes({ workspaceId: 'ws-1', delta: 10, reason: 'ok', adminUserId: '' }),
      ).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })

    it('변경량이 0이면 내역을 기록하지 않고 거부한다', async () => {
      await expect(
        manualAdjustTakes({ workspaceId: 'ws-1', delta: 0, reason: 'ok', adminUserId: 'admin-1' }),
      ).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })
  })
})
