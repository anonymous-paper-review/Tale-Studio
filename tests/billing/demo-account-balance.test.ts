// 시연 계정은 Take 잔액 · 계정 화면이 "무제한"으로 보이고 관리자로 표시되지 않는다 (2026-10-27 오너 시연 계정 · 검토)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), takeBalance: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/billing/take-ledger', () => ({ takeBalance: mocks.takeBalance }))
vi.mock('@/lib/supabase/admin', () => {
  const rows: Record<string, unknown> = {
    workspaces: { id: 'ws-1', owner_id: 'u-1', plan: 'free' },
    subscriptions: [],
    take_ledger: [],
    billing_customers: null,
  }
  const builder = (table: string) => {
    const q: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'order', 'limit', 'in']) q[name] = () => q
    q.maybeSingle = async () => ({ data: rows[table] ?? null, error: null })
    q.single = q.maybeSingle
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve)
    return q
  }
  return { supabaseAdmin: { from: builder } }
})

import { GET as takeBalanceGET } from '@/app/api/billing/take-balance/route'
import { GET as accountGET } from '@/app/api/billing/account/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.takeBalance.mockResolvedValue(12)
})

describe('시연 계정의 Take 잔액 표시', () => {
  it('시연 계정은 Take 잔액이 무제한으로 보이고 관리자로 표시되지 않는다', async () => {
    // 왜: 시연 중 잔액 0 으로 보이면 생성이 막힐 것처럼 읽힌다. 관리자 표시는 관리자 화면 · 기능의 근거라 시연 계정에 켜지면 안 된다.
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'promotion@talestudio.art' } } })

    await expect((await takeBalanceGET()).json()).resolves.toMatchObject({ balance: null })
    await expect((await accountGET()).json()).resolves.toMatchObject({ unlimited: true, isAdmin: false, balance: null })
  })

  it('보통 계정은 지금처럼 Take 잔액이 숫자로 보인다', async () => {
    // 왜: 정상 경로 고정 — 시연 계정 면제를 넣어도 보통 계정의 잔액 표시는 그대로다.
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'someone@example.com' } } })

    await expect((await takeBalanceGET()).json()).resolves.toMatchObject({ balance: 12 })
    const account = await (await accountGET()).json()
    expect(account).toMatchObject({ unlimited: false, isAdmin: false })
    expect(account.balance).not.toBeNull()
  })
})
