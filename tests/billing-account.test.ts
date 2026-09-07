// 내 플랜과 Take를 한 화면에서 본다 — 계정·결제 페이지가 읽는 요약(종류별 잔액·구독 상태·최근 내역)의 약속.
//   .claude/docs/2026-09-07/paddle-promises.md §P9a. 화면 생김새는 스크린샷이 검수하고, 여기는 숫자와 상태 판정만.
import { describe, expect, it } from 'vitest'

import {
  canBuyTakePack,
  groupRecentActivity,
  summarizeSubscription,
  takeBreakdown,
  type LedgerRow,
} from '@/lib/billing/account-summary'

const T0 = '2026-09-01T00:00:00.000Z'
const row = (partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'kind' | 'delta'>): LedgerRow => ({
  grant_id: null,
  expires_at: null,
  ref_kind: null,
  ref_id: null,
  reason: null,
  created_at: T0,
  ...partial,
})

describe('종류별 잔액', () => {
  it('잔액은 무료·플랜·충전으로 나뉘고 합계는 장부 전체 합과 같다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g-plan', kind: 'grant_plan', delta: 60, expires_at: '2026-10-01T00:00:00.000Z' }),
      row({ id: 'g-pack', kind: 'grant_purchase', delta: 50, expires_at: '2027-08-20T00:00:00.000Z' }),
      row({ id: 'g-free', kind: 'grant_free', delta: 5 }),
      row({ id: 'h1', kind: 'hold', delta: -5, grant_id: 'g-free', ref_kind: 'generation_job', ref_id: 'job-1' }),
      row({ id: 'h2', kind: 'hold', delta: -3, grant_id: 'g-plan', ref_kind: 'generation_job', ref_id: 'job-1' }),
    ]
    const b = takeBreakdown(rows)
    expect(b.free).toBe(0)
    expect(b.plan).toBe(57)
    expect(b.purchase).toBe(50)
    expect(b.total).toBe(107)
    expect(b.total).toBe(rows.reduce((s, r) => s + r.delta, 0))
  })

  it('플랜 Take의 만료일은 남은 플랜 lot 중 가장 이른 날이다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g-old', kind: 'grant_plan', delta: 10, expires_at: '2026-09-01T00:00:00.000Z' }),
      row({ id: 'h-old', kind: 'hold', delta: -10, grant_id: 'g-old', ref_id: 'job-0', ref_kind: 'generation_job' }),
      row({ id: 'g-new', kind: 'grant_plan', delta: 60, expires_at: '2026-10-01T00:00:00.000Z' }),
    ]
    // g-old 는 다 써서 남은 게 없으니 만료일 후보에서 빠진다.
    expect(takeBreakdown(rows).planExpiresAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('잔액이 음수면 회수분(환불·기타)이 얼마인지 같이 나온다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g-pack', kind: 'grant_purchase', delta: 50 }),
      row({ id: 'h1', kind: 'hold', delta: -12, grant_id: 'g-pack', ref_kind: 'generation_job', ref_id: 'job-1' }),
      row({ id: 'r1', kind: 'refund_revoke', delta: -50, ref_kind: 'paddle_adjustment', ref_id: 'adj_1' }),
    ]
    const b = takeBreakdown(rows)
    expect(b.total).toBe(-12)
    expect(b.purchase).toBe(38)
    expect(b.other).toBe(-50)
  })

  it('관리자 수동 조정은 기타로 잡히고 합계에 들어간다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g-plan', kind: 'grant_plan', delta: 30 }),
      row({ id: 'm1', kind: 'manual_adjust', delta: 7, reason: 'beta comp' }),
    ]
    const b = takeBreakdown(rows)
    expect(b.plan).toBe(30)
    expect(b.other).toBe(7)
    expect(b.total).toBe(37)
  })
})

describe('최근 내역', () => {
  it('같은 영상에 걸린 여러 줄은 한 줄로 합쳐지고 최신순이다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g', kind: 'grant_plan', delta: 60, created_at: '2026-09-01T00:00:00.000Z' }),
      row({ id: 'h1', kind: 'hold', delta: -3, grant_id: 'g', ref_kind: 'generation_job', ref_id: 'job-1', created_at: '2026-09-02T10:00:00.000Z' }),
      row({ id: 'h2', kind: 'hold', delta: -2, grant_id: null, ref_kind: 'generation_job', ref_id: 'job-1', created_at: '2026-09-02T10:00:00.000Z' }),
      row({ id: 'p', kind: 'grant_purchase', delta: 50, created_at: '2026-09-03T00:00:00.000Z' }),
    ]
    const items = groupRecentActivity(rows)
    expect(items.map((i) => i.kind)).toEqual(['grant_purchase', 'hold', 'grant_plan'])
    expect(items[1].delta).toBe(-5)
    expect(items[1].refId).toBe('job-1')
  })

  it('실패로 돌려받은 줄은 돌려받음으로 보이고 양수다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g', kind: 'grant_plan', delta: 10 }),
      row({ id: 'h', kind: 'hold', delta: -4, grant_id: 'g', ref_kind: 'generation_job', ref_id: 'job-9', created_at: '2026-09-02T00:00:00.000Z' }),
      row({ id: 'r', kind: 'hold_release', delta: 4, grant_id: 'g', ref_kind: 'generation_job', ref_id: 'job-9', created_at: '2026-09-02T00:05:00.000Z' }),
    ]
    const items = groupRecentActivity(rows)
    expect(items[0]).toMatchObject({ kind: 'hold_release', delta: 4, refId: 'job-9' })
    expect(items[1]).toMatchObject({ kind: 'hold', delta: -4, refId: 'job-9' })
  })
})

describe('구독 상태', () => {
  it('구독이 없으면 무료이고 결제일이 없다', () => {
    const s = summarizeSubscription('free', null)
    expect(s).toEqual({ plan: 'free', status: 'none', nextBillingAt: null, accessEndsAt: null, paymentFailed: false })
  })

  it('갱신 결제가 실패한 상태면 실패 배너 신호가 켜진다', () => {
    const s = summarizeSubscription('s5', { plan: 's5', status: 'past_due', current_period_end: '2026-10-01T00:00:00.000Z' })
    expect(s.paymentFailed).toBe(true)
    expect(s.status).toBe('past_due')
  })

  it('구독 취소가 예약된 상태면 이용 가능 종료일이 나오고 다음 결제일은 없다', () => {
    const s = summarizeSubscription('p10', {
      plan: 'p10',
      status: 'cancel_scheduled',
      current_period_end: '2026-09-30T00:00:00.000Z',
    })
    expect(s.accessEndsAt).toBe('2026-09-30T00:00:00.000Z')
    expect(s.nextBillingAt).toBeNull()
  })

  it('정상 구독이면 다음 결제일이 나온다', () => {
    const s = summarizeSubscription('s5', { plan: 's5', status: 'active', current_period_end: '2026-10-01T00:00:00.000Z' })
    expect(s.nextBillingAt).toBe('2026-10-01T00:00:00.000Z')
    expect(s.paymentFailed).toBe(false)
  })
})

describe('팩 구매 가능 여부', () => {
  it('무료 플랜이고 팩을 산 적 있으면 다시 살 수 없다', () => {
    expect(canBuyTakePack({ plan: 'free', packPurchasedBefore: true })).toBe(false)
  })
  it('무료 플랜이라도 처음이면 살 수 있다', () => {
    expect(canBuyTakePack({ plan: 'free', packPurchasedBefore: false })).toBe(true)
  })
  it('구독 중이면 몇 번이든 살 수 있다', () => {
    expect(canBuyTakePack({ plan: 's2', packPurchasedBefore: true })).toBe(true)
  })
})
