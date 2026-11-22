// 관리자는 30일·1계정 기본 바우처의 기간·등록 한도와 사용 중 권한, 등록 고객의 남은 Take 수를 조정할 수 있다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redemptionSaveSteps, voucherTakeGrant, voucherCanBeUsed } from '@/lib/billing/voucher'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), getUserById: vi.fn(), takeBalance: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from, auth: { admin: { getUserById: mocks.getUserById } } } }))
vi.mock('@/lib/billing/take-ledger', () => ({ takeBalance: mocks.takeBalance }))

import { PATCH } from '@/app/api/admin/vouchers/redemptions/[id]/route'
import { POST as setTakes } from '@/app/api/admin/vouchers/redemptions/[id]/takes/route'
import { GET as listVouchers } from '@/app/api/admin/vouchers/route'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin', email: 'admin@tale.studio' } } })
})

function saveRequest(expiresAt: string) {
  return PATCH(new Request('http://localhost/api/admin/vouchers/redemptions/r1', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: 's2', expiresAt }),
  }), { params: Promise.resolve({ id: 'r1' }) })
}

function takesRequest(takes: unknown) {
  return setTakes(new Request('http://localhost/api/admin/vouchers/redemptions/r1/takes', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ takes }),
  }), { params: Promise.resolve({ id: 'r1' }) })
}

function rows(data: unknown) {
  const chain = { select: () => chain, order: async () => ({ data, error: null }) }
  return chain
}

describe('바우처 관리자 설정', () => {
  it('기본 기간은 등록일로부터 30일이고 관리자가 늘린 기간도 등록일 기준으로 계산한다', () => {
    expect(voucherTakeGrant('s1', new Date('2026-11-01T12:00:00.000Z')).expiresAt).toBe('2026-12-01T12:00:00.000Z')
    expect(voucherTakeGrant('s1', new Date('2026-11-01T12:00:00.000Z'), 45).expiresAt).toBe('2026-12-16T12:00:00.000Z')
  })

  it('기본 1계정 한도가 차면 새 등록을 막고 관리자가 늘리면 다시 허용한다', () => {
    expect(voucherCanBeUsed({ active: true, deletedAt: null, used: 0, maxUses: 1 })).toBe(true)
    expect(voucherCanBeUsed({ active: true, deletedAt: null, used: 1, maxUses: 1 })).toBe(false)
    expect(voucherCanBeUsed({ active: true, deletedAt: null, used: 1, maxUses: 2 })).toBe(true)
    expect(voucherCanBeUsed({ active: false, deletedAt: null, used: 0, maxUses: 1 })).toBe(false)
    expect(voucherCanBeUsed({ active: false, deletedAt: '2026-11-01T00:00:00Z', used: 0, maxUses: 1 })).toBe(false)
  })
})

describe('등록 고객의 남은 Take', () => {
  // 왜: 관리자가 고객이 보는 수와 다른 수를 보고 고치면 엉뚱한 수로 맞춘다.
  it('등록 고객 목록은 계정마다 고객 계정 화면과 같은 남은 Take 수를 함께 보여준다', async () => {
    mocks.from.mockImplementation((table: string) => table === 'vouchers' ? rows([]) : rows([
      { id: 'r1', code: 'TALE1', redeemed_at: '2026-11-01T00:00:00Z', redeemed_by: 'u1', redeemed_workspace_id: 'ws-1', plan: 's2', plan_ends_at: '2026-12-01T00:00:00Z', plan_ended_at: null },
      { id: 'r2', code: 'TALE2', redeemed_at: '2026-11-02T00:00:00Z', redeemed_by: null, redeemed_workspace_id: null, plan: 's2', plan_ends_at: '2026-12-02T00:00:00Z', plan_ended_at: '2026-11-03T00:00:00Z' },
    ]))
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'customer@example.test', user_metadata: {} } } })
    mocks.takeBalance.mockResolvedValue(42)
    const response = await listVouchers()
    if (!response) throw new Error('목록 응답이 없다')
    const body = await response.json()
    expect(body.redemptions.map((row: { id: string; takes: number | null }) => [row.id, row.takes])).toEqual([['r1', 42], ['r2', null]])
    expect(mocks.takeBalance).toHaveBeenCalledTimes(1)
    expect(mocks.takeBalance).toHaveBeenCalledWith('ws-1')
  })
  // 왜: 오타·음수·소수가 그대로 장부에 들어가면 고객 잔액이 엉뚱하게 바뀐다.
  it('남은 Take 수는 0에서 1,000,000 사이의 정수로만 바꿀 수 있고 그 밖의 값은 DB에 보내지 않는다', async () => {
    for (const takes of [-1, 1.5, '12', null, 1_000_001]) expect((await takesRequest(takes)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  // 왜: 고객 Take는 돈과 같다. 관리자 밖의 계정이 바꾸면 안 된다.
  it('관리자가 아닌 계정은 남은 Take 수를 바꿀 수 없다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'customer@example.test' } } })
    expect((await takesRequest(10)).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  // 왜: 정상 경로 고정. 화면은 바꾼 뒤의 수를 보고 관리자에게 알린다.
  it('남은 Take 수를 바꾸면 바꾸기 전과 뒤의 수를 돌려준다', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'updated', before: 30, after: 100 }, error: null })
    const response = await takesRequest(100)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, before: 30, after: 100 })
    expect(mocks.rpc).toHaveBeenCalledWith('admin_set_account_takes', { p_redemption: 'r1', p_target: 100 })
  })
  // 왜: 지워진 등록이나 계정이 없는 등록을 고친 것처럼 보이면 관리자가 다른 고객을 고쳤다고 착각한다.
  it('없는 등록이나 계정이 지워진 등록의 Take를 바꾸려 하면 찾을 수 없다고 알린다', async () => {
    for (const status of ['not_found', 'no_account']) {
      mocks.rpc.mockResolvedValue({ data: { status }, error: null })
      expect((await takesRequest(10)).status).toBe(404)
    }
  })
  // 왜: Take 수만 고칠 때 같은 종료일이 다시 저장되면 고객 내역에 회수·지급 줄이 괜히 쌓인다.
  it('티어와 종료일은 그대로 두고 Take 수만 바꿔 저장하면 이용 기간은 건드리지 않고 Take 수만 바꾼다', () => {
    const original = { plan: 's2', endDate: '2026-12-01', takes: 30 }
    expect(redemptionSaveSteps(original, { plan: 's2', endDate: '2026-12-01', takes: 100 })).toEqual({ access: false, takes: 100 })
    expect(redemptionSaveSteps(original, { plan: 'p10', endDate: '2026-12-01', takes: 30 })).toEqual({ access: true, takes: null })
    expect(redemptionSaveSteps(original, { plan: 's2', endDate: '2026-12-15', takes: 0 })).toEqual({ access: true, takes: 0 })
    expect(redemptionSaveSteps(original, { plan: 's2', endDate: '2026-12-01', takes: 30 })).toEqual({ access: false, takes: null })
  })
})

describe('관리자 [저장] 응답', () => {
  // 왜: 지난 날짜로 저장하면 DB는 해지했는데 화면은 "저장하지 못했다"고 알려 관리자가 실패로 오해했다.
  it('종료일을 지난 날짜로 저장해 이용이 끝나도 화면에는 실패가 아니라 저장됐다고 알린다', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'ended', revoked_takes: 20 }, error: null })
    const response = await saveRequest('2026-11-01T23:59:59.999Z')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
  // 왜: 이미 지워진 등록을 고친다고 성공으로 보이면 관리자가 다른 고객을 고쳤다고 착각한다.
  it('없는 등록을 저장하면 찾을 수 없다고 알린다', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null })
    const response = await saveRequest('2026-12-31T23:59:59.999Z')
    expect(response.status).toBe(404)
  })
})
