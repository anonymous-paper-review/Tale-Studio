// 관리자는 30일·1계정 기본 바우처의 기간·등록 한도와 사용 중 권한을 조정할 수 있다.
import { describe, expect, it } from 'vitest'
import { voucherTakeGrant, voucherCanBeUsed } from '@/lib/billing/voucher'

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
