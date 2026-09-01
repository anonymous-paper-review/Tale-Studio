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

describe('take-ledger', () => {
  beforeEach(() => vi.resetAllMocks())

  describe('takeBalance', () => {
    it('원장 delta 를 합산한다', async () => {
      mocks.from.mockReturnValueOnce(
        query({ data: [{ delta: 100 }, { delta: -30 }, { delta: -5 }], error: null }),
      )
      await expect(takeBalance('ws-1')).resolves.toBe(65)
    })

    it('빈 원장은 0을 반환한다', async () => {
      mocks.from.mockReturnValueOnce(query({ data: [], error: null }))
      await expect(takeBalance('ws-1')).resolves.toBe(0)
    })

    it('쿼리 에러를 전파한다', async () => {
      const error = { message: 'db unavailable' }
      mocks.from.mockReturnValueOnce(query({ data: null, error }))
      await expect(takeBalance('ws-1')).rejects.toBe(error)
    })
  })

  describe('grantTakes', () => {
    it('양수 delta 로 grant 행을 삽입한다', async () => {
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

    it('amount<=0 은 삽입 전 throw 한다 (grant 계열 check 위반 방어)', async () => {
      await expect(grantTakes({ workspaceId: 'ws-1', amount: 0, kind: 'grant_plan' })).rejects.toThrow()
      await expect(grantTakes({ workspaceId: 'ws-1', amount: -5, kind: 'grant_plan' })).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })

    it('정수가 아닌 amount 는 삽입 전 throw 한다', async () => {
      await expect(grantTakes({ workspaceId: 'ws-1', amount: 1.5, kind: 'grant_plan' })).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })

    it('grant_* 가 아닌 kind 는 거부한다', async () => {
      // @ts-expect-error — 잘못된 kind 를 의도적으로 넣어 런타임 가드를 검증
      await expect(grantTakes({ workspaceId: 'ws-1', amount: 10, kind: 'consume' })).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })
  })

  describe('manualAdjustTakes', () => {
    it('reason 이 있으면 manual_adjust 행을 삽입한다(음수 delta 허용)', async () => {
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

    it('reason 없으면 삽입 전 throw 한다', async () => {
      await expect(
        manualAdjustTakes({ workspaceId: 'ws-1', delta: 10, reason: '', adminUserId: 'admin-1' }),
      ).rejects.toThrow()
      await expect(
        manualAdjustTakes({ workspaceId: 'ws-1', delta: 10, reason: '   ', adminUserId: 'admin-1' }),
      ).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })

    it('adminUserId 없으면 삽입 전 throw 한다', async () => {
      await expect(
        manualAdjustTakes({ workspaceId: 'ws-1', delta: 10, reason: 'ok', adminUserId: '' }),
      ).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })

    it('delta=0 은 삽입 전 throw 한다', async () => {
      await expect(
        manualAdjustTakes({ workspaceId: 'ws-1', delta: 0, reason: 'ok', adminUserId: 'admin-1' }),
      ).rejects.toThrow()
      expect(mocks.from).not.toHaveBeenCalled()
    })
  })
})
