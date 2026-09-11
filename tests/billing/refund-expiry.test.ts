// 환불로 회수한 Take는 만료 때 다시 차감하지 않고, 이미 사용한 Take의 부족분은 유지한다.
import { describe, expect, it } from 'vitest'
import { takeBreakdown, type LedgerRow } from '@/lib/billing/account-summary'

const BEFORE = new Date('2026-09-09T00:00:00Z')
const AFTER = new Date('2027-10-10T00:00:00Z')
const TXN = 'txn_01m22n0brb6h60e2gxrp0e1jrn'
const row = (input: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'kind' | 'delta'>): LedgerRow => ({
  grant_id: null, expires_at: null, ref_kind: null, ref_id: null, reason: null,
  created_at: BEFORE.toISOString(), ...input,
})
const grant = () => row({ id: 'g', kind: 'grant_plan', delta: 16,
  expires_at: '2026-10-09T00:00:00Z', ref_kind: 'paddle_transaction', ref_id: TXN })
const refund = (linked: boolean, amount = 16) => row({ id: 'r', kind: 'refund_revoke', delta: -amount,
  grant_id: linked ? 'g' : null, ref_kind: 'paddle_adjustment', ref_id: 'adj_test',
  reason: `paddle refund of ${TXN} (${Math.round(amount / 16 * 100)}%)` })
const use = (amount: number) => row({ id: 'h', kind: 'hold', delta: -amount, grant_id: 'g' })

describe.each([true, false])('신규 연결과 기존 환불 기록 모두 같은 잔액을 만든다 (연결: %s)', (linked) => {
  // 왜: 실제 Sandbox 전액 환불 장부가 만료 후 0에서 -16으로 변했다.
  it('환불로 이미 회수한 Take는 원래 만료일에 다시 차감하지 않는다', () => {
    const rows = [grant(), refund(linked)]
    const original = structuredClone(rows)
    expect(takeBreakdown(rows, BEFORE).total).toBe(0)
    expect(takeBreakdown(rows, AFTER).total).toBe(0)
    expect(rows).toEqual(original)
  })
  // 왜: 미사용 환불 결함을 고치면서 이미 사용한 분량의 부족액까지 없애면 안 된다.
  it('환불 전에 이미 사용한 Take의 부족분은 기존 방침대로 음수로 남긴다', () => {
    const rows = [grant(), use(6), refund(linked)]
    expect(takeBreakdown(rows, BEFORE).total).toBe(-6)
    expect(takeBreakdown(rows, AFTER).total).toBe(-6)
  })
  // 왜: 만료 잡이 먼저 돈 뒤 환불 알림이 도착하면 두 회수 행이 겹친다.
  it('만료 정산 후 환불해도 사용하지 않은 Take를 다시 차감하지 않는다', () => {
    const rows = [grant(), row({ id: 'e', kind: 'expire', delta: -16, grant_id: 'g' }), refund(linked)]
    expect(takeBreakdown(rows, AFTER).total).toBe(0)
  })
  // 왜: 만료 정산이 이미 기록돼도 실제 사용분 6개의 부족액만 남아야 한다.
  it('만료 정산 후 환불해도 이미 사용한 Take의 부족분만 남긴다', () => {
    const rows = [grant(), use(6), row({ id: 'e', kind: 'expire', delta: -10, grant_id: 'g' }), refund(linked)]
    expect(takeBreakdown(rows, AFTER).total).toBe(-6)
  })
  // 왜: 부분 환불이 남아 있는 수량보다 작으면 만료 때 부족액이 생기면 안 된다.
  it('부분 환불 후 남은 Take만 만료되고 회수한 분량은 다시 차감하지 않는다', () => {
    const rows = [grant(), use(6), refund(linked, 8)]
    expect(takeBreakdown(rows, BEFORE).total).toBe(2)
    expect(takeBreakdown(rows, AFTER).total).toBe(0)
  })
  // 왜: 부분 환불이 남아 있는 수량을 넘으면 초과한 사용분 부족액은 만료 후에도 유지한다.
  it('부분 환불의 사용분 부족액은 만료 후에도 유지한다', () => {
    const rows = [grant(), use(12), refund(linked, 8)]
    expect(takeBreakdown(rows, BEFORE).total).toBe(-4)
    expect(takeBreakdown(rows, AFTER).total).toBe(-4)
  })
  // 왜: 생성 실패로 예약분을 돌려받으면 실제로 사용한 분량이 아니므로 그 부족액도 해소돼야 한다.
  it('환불 후 생성 실패로 돌려받은 Take는 만료 뒤에도 부족액으로 남지 않는다', () => {
    const rows = [grant(), use(6), refund(linked), row({ id: 'release', kind: 'hold_release', delta: 6, grant_id: 'g' })]
    expect(takeBreakdown(rows, AFTER).total).toBe(0)
  })
  // 왜: 이미 환불한 옛 결제가 새로 구매한 Take까지 잠식하는 사고를 막는다.
  it('미사용 환불이 끝난 뒤 새로 산 Take는 옛 만료일에 줄어들지 않는다', () => {
    const rows = [grant(), refund(linked), row({ id: 'new', kind: 'grant_purchase', delta: 100 })]
    expect(takeBreakdown(rows, AFTER).total).toBe(100)
  })
})

// 왜: 출처가 없거나 여러 지급분과 겹치는 기록을 임의로 연결하면 남의 지급분이나 채무가 사라질 수 있다.
it('출처를 유일하게 확인하지 못한 기존 회수 기록은 임의로 연결하지 않는다', () => {
  const unverified = { ...refund(false), reason: null }
  expect(takeBreakdown([grant(), unverified], AFTER).total).toBe(-16)
  const duplicate = { ...grant(), id: 'g2' }
  expect(takeBreakdown([grant(), duplicate, refund(false)], AFTER).total).toBe(-16)
})

// 왜: 차지백도 환불과 같은 회수 경로를 사용한다.
it('기존 차지백으로 회수한 Take도 만료 때 다시 차감하지 않는다', () => {
  const chargeback = { ...refund(false), reason: `paddle chargeback of ${TXN} (100%)` }
  expect(takeBreakdown([grant(), chargeback], AFTER).total).toBe(0)
})
