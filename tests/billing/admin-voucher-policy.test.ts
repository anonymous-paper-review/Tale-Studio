// 관리자는 30일·1계정 기본 바우처의 기간·등록 한도와 사용 중 권한을 조정할 수 있다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { voucherTakeGrant, voucherCanBeUsed } from '@/lib/billing/voucher'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc: mocks.rpc } }))

import { PATCH } from '@/app/api/admin/vouchers/redemptions/[id]/route'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin', email: 'admin@tale.studio' } } })
})

function saveRequest(expiresAt: string) {
  return PATCH(new Request('http://localhost/api/admin/vouchers/redemptions/r1', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: 's2', expiresAt }),
  }), { params: Promise.resolve({ id: 'r1' }) })
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
