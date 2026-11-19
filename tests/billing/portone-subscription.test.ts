// 국내 카드 정기결제(PortOne · KG이니시스)로 월 구독을 시작·갱신·해지할 때 언제 청구하고 언제 무료로 돌리는지.
import { describe, expect, it, vi } from 'vitest'
import {
  decidePortOneCancel,
  decidePortOnePlan,
  decidePortOneRenewal,
  processPortOneCancel,
  processPortOnePayment,
  type PortOneDeps,
  type PortOneOrder,
} from '@/lib/billing/portone'
import { PADDLE_PLANS } from '@/lib/billing/catalog'

const PLAN_PRICES = { s1: 22000, s2: null, s5: null, s10: null, p10: null, p15: null, p20: null, p25: null, p30: null }
const S1_TAKES = PADDLE_PLANS.find((p) => p.id === 's1')!.entitlements.includedTakesPerMonth

describe('구독 결제창을 열기 전', () => {
  // 왜: KG이니시스 정기결제는 일반 결제와 다른 채널이다. 채널 키 없이 열면 카드 등록 단계에서 실패한다.
  it('정기결제 채널 키가 없으면 구독 결제창을 열지 않는다', () => {
    const d = decidePortOnePlan({ planId: 's1', configured: false, prices: PLAN_PRICES, subscriptionStatus: 'none' })
    expect(d).toEqual({ ok: false, reason: 'portone_not_configured' })
  })

  // 왜: 원화 월 가격은 오너가 정한다. 정하지 않은 플랜을 임의 금액으로 매달 청구하면 안 된다.
  it('원화 월 가격이 정해지지 않은 플랜은 구독 결제창을 열지 않는다', () => {
    const d = decidePortOnePlan({ planId: 's2', configured: true, prices: PLAN_PRICES, subscriptionStatus: 'none' })
    expect(d).toEqual({ ok: false, reason: 'no_krw_price' })
  })

  // 왜: 첫 버전은 플랜 바꾸기가 없다. 구독 중에 또 구독하면 매달 두 번 청구된다.
  it('이미 구독 중이면 새 구독을 열지 않는다', () => {
    for (const status of ['active', 'cancel_scheduled'] as const) {
      expect(decidePortOnePlan({ planId: 's1', configured: true, prices: PLAN_PRICES, subscriptionStatus: status })).toEqual({
        ok: false,
        reason: 'already_subscribed',
      })
    }
  })

  // 왜: 정상 경로 고정. 첫 달 금액과 이름은 서버 가격표에서만 나온다.
  it('원화 월 가격이 있는 플랜은 그 금액으로 구독 결제창을 연다', () => {
    const d = decidePortOnePlan({ planId: 's1', configured: true, prices: PLAN_PRICES, subscriptionStatus: 'none' })
    expect(d).toEqual({ ok: true, planId: 's1', amountKrw: 22000, orderName: 'Tale Studio Starter1 (1 month)' })
  })
})

function makeDeps(order: PortOneOrder, paymentStatus = 'PAID') {
  const grants: { amount: number; expiresAt: string | null; kind: string }[] = []
  const subs: unknown[] = []
  const plans: string[] = []
  const ended: unknown[] = []
  const revokes: { amount: number }[] = []
  const deps: PortOneDeps = {
    now: () => new Date('2026-11-21T03:00:00Z'),
    findOrder: async () => order,
    fetchPayment: async () => ({ status: paymentStatus, amountTotal: order.amountKrw, amountCancelled: paymentStatus === 'CANCELLED' ? order.amountKrw : 0, currency: 'KRW', paidAt: '2026-11-21T02:59:00Z' }),
    recordEvent: async () => 'new',
    markProcessed: async () => {},
    findWorkspace: async (id) => ({ id, plan: 'free' }),
    hasGrant: async () => false,
    grant: async (g) => {
      grants.push(g)
    },
    alert: vi.fn(async () => {}),
    setPlan: async (_ws, plan) => {
      plans.push(plan)
    },
    upsertSubscription: async (row) => {
      subs.push(row)
    },
    findGrantsForPayment: async () => [{ id: 'grant-plan', workspaceId: 'ws-1', delta: S1_TAKES }],
    revokedTotalForPayment: async () => 0,
    revoke: async (r) => {
      revokes.push(r)
    },
    endSubscription: async (e) => {
      ended.push(e)
    },
  }
  return { deps, grants, subs, plans, ended, revokes }
}

describe('구독 결제가 확인되면', () => {
  // 왜: 정상 경로 고정. 첫 결제 날짜로부터 한 달이 한 기간이고, 그 달 Take 는 기간 끝에 사라진다(Paddle 구독과 같다).
  it('첫 구독 결제가 확인되면 플랜을 바꾸고 한 달 뒤까지 구독을 기록하고 그 달 Take 를 준다', async () => {
    const { deps, grants, subs, plans } = makeDeps({
      kind: 'plan',
      paymentId: 'tale-first',
      workspaceId: 'ws-1',
      planId: 's1',
      amountKrw: 22000,
      subscriptionId: 'portone-sub-1',
      periodEnd: null,
    })
    expect(await processPortOnePayment('tale-first', deps)).toBe('plan_granted')
    expect(plans).toEqual(['s1'])
    expect(subs).toEqual([
      { workspaceId: 'ws-1', morSubscriptionId: 'portone-sub-1', plan: 's1', status: 'active', currentPeriodEnd: '2026-12-21T02:59:00.000Z' },
    ])
    expect(grants).toEqual([expect.objectContaining({ kind: 'grant_plan', amount: S1_TAKES, expiresAt: '2026-12-21T02:59:00.000Z' })])
  })

  // 왜: 정상 경로 고정. 갱신은 결제 시각이 아니라 앞 기간 끝에서 한 달을 더한다. 늦게 청구돼도 날짜가 밀리지 않는다.
  it('갱신 결제가 확인되면 구독을 앞 기간 끝에서 한 달 더 늘리고 그 달 Take 를 준다', async () => {
    const { deps, grants, subs } = makeDeps({
      kind: 'plan',
      paymentId: 'tale-renew',
      workspaceId: 'ws-1',
      planId: 's1',
      amountKrw: 22000,
      subscriptionId: 'portone-sub-1',
      periodEnd: '2027-01-21T02:59:00.000Z',
    })
    expect(await processPortOnePayment('tale-renew', deps)).toBe('plan_granted')
    expect(subs).toEqual([expect.objectContaining({ status: 'active', currentPeriodEnd: '2027-01-21T02:59:00.000Z' })])
    expect(grants).toEqual([expect.objectContaining({ expiresAt: '2027-01-21T02:59:00.000Z' })])
  })
})

describe('구독 결제가 취소되면', () => {
  // 왜: 그 달 돈을 돌려줬으면 그 달 Take 와 플랜도 돌려받는다. 남겨 두면 다음 달에 또 청구된다.
  it('구독 결제가 전액 취소되면 그 달 Take 를 회수하고 구독을 끝낸다', async () => {
    const order: PortOneOrder = {
      kind: 'plan',
      paymentId: 'tale-first',
      workspaceId: 'ws-1',
      planId: 's1',
      amountKrw: 22000,
      subscriptionId: 'portone-sub-1',
      periodEnd: null,
    }
    const { deps, revokes, ended } = makeDeps(order, 'CANCELLED')
    expect(await processPortOneCancel('tale-first', deps)).toBe('revoked')
    expect(revokes).toEqual([expect.objectContaining({ amount: S1_TAKES })])
    expect(ended).toEqual([{ workspaceId: 'ws-1', subscriptionId: 'portone-sub-1', plan: 's1' }])
  })
})

describe('매시간 갱신 점검', () => {
  // 한국 시간 = UTC+9. 청구 시각은 한국 시간 9시(00 UTC) · 12시(03 UTC) · 18시(09 UTC).
  const at = (iso: string) => new Date(iso)
  const ENDED = '2026-12-20T20:00:00Z' // 한국 시간 12/21 05:00 에 기간이 끝났다

  // 왜: 정상 경로 고정. 오너 11/19 "하루에 아침 점심 저녁" — 기간이 끝난 구독은 다음 청구 시각에 다음 달 요금을 청구한다.
  it('구독 기간이 끝났으면 다음 청구 시각(한국 시간 9시·12시·18시)에 다음 달 요금을 청구한다', () => {
    expect(decidePortOneRenewal({ status: 'active', currentPeriodEnd: ENDED, now: at('2026-12-21T00:15:00Z'), failedAttempts: 0, lastFailedAt: null })).toBe('charge')
  })

  // 왜: 청구는 정해진 세 시각에만 한다. 새벽에 긁지 않는다.
  it('청구 시각이 아니면 기간이 끝났어도 기다린다', () => {
    expect(decidePortOneRenewal({ status: 'active', currentPeriodEnd: ENDED, now: at('2026-12-20T21:15:00Z'), failedAttempts: 0, lastFailedAt: null })).toBe('wait')
  })

  // 왜: 기간 중간에 청구하면 같은 달을 두 번 받는다.
  it('구독 기간이 남아 있으면 청구하지 않는다', () => {
    expect(decidePortOneRenewal({ status: 'active', currentPeriodEnd: '2026-12-22T00:00:00Z', now: at('2026-12-21T00:15:00Z'), failedAttempts: 0, lastFailedAt: null })).toBe('wait')
  })

  // 왜: 환불정책 2절 — 해지는 다음 갱신만 멈춘다. 기간이 끝나면 청구하지 않고 무료로 돌린다.
  it('해지 예약된 구독은 기간이 끝나면 청구하지 않고 무료로 돌린다', () => {
    expect(decidePortOneRenewal({ status: 'cancel_scheduled', currentPeriodEnd: ENDED, now: at('2026-12-20T21:15:00Z'), failedAttempts: 0, lastFailedAt: null })).toBe('end')
    expect(decidePortOneRenewal({ status: 'cancel_scheduled', currentPeriodEnd: '2026-12-22T00:00:00Z', now: at('2026-12-21T00:15:00Z'), failedAttempts: 0, lastFailedAt: null })).toBe('wait')
  })

  // 왜: 오너 11/19 — 아침에 실패하면 점심에, 점심에 실패하면 저녁에 다시 청구한다.
  it('갱신 결제가 실패하면 같은 날 다음 청구 시각에 다시 청구한다', () => {
    const morningFail = '2026-12-21T00:15:00Z'
    expect(decidePortOneRenewal({ status: 'past_due', currentPeriodEnd: ENDED, now: at('2026-12-21T01:15:00Z'), failedAttempts: 1, lastFailedAt: morningFail })).toBe('wait')
    expect(decidePortOneRenewal({ status: 'past_due', currentPeriodEnd: ENDED, now: at('2026-12-21T03:15:00Z'), failedAttempts: 1, lastFailedAt: morningFail })).toBe('charge')
  })

  // 왜: 같은 시각에 두 번 긁지 않는다(점검이 그 시각 안에 다시 돌아도).
  it('같은 청구 시각에 이미 실패했으면 그 시각에는 다시 청구하지 않는다', () => {
    expect(decidePortOneRenewal({ status: 'past_due', currentPeriodEnd: ENDED, now: at('2026-12-21T00:45:00Z'), failedAttempts: 1, lastFailedAt: '2026-12-21T00:15:00Z' })).toBe('wait')
  })

  // 왜: 오너 11/19 "무료로 바로 다음날" — 세 번 실패한 그날은 그대로 두고 다음 날 무료로 돌린다.
  it('갱신 결제가 세 번 실패하면 다음 날 무료로 돌린다', () => {
    const eveningFail = '2026-12-21T09:15:00Z' // 한국 시간 12/21 18:15
    expect(decidePortOneRenewal({ status: 'past_due', currentPeriodEnd: ENDED, now: at('2026-12-21T12:15:00Z'), failedAttempts: 3, lastFailedAt: eveningFail })).toBe('wait')
    expect(decidePortOneRenewal({ status: 'past_due', currentPeriodEnd: ENDED, now: at('2026-12-21T15:15:00Z'), failedAttempts: 3, lastFailedAt: eveningFail })).toBe('end')
  })
})

describe('해지', () => {
  // 왜: 이미 낸 달은 끝까지 쓴다. 다음 청구만 막는다.
  it('구독 중에 해지하면 지금 기간이 끝날 때까지 쓰고 그 뒤로 청구하지 않는다', () => {
    expect(decidePortOneCancel('active')).toEqual({ ok: true, status: 'cancel_scheduled' })
  })

  // 왜: 결제 실패 중인 기간은 돈을 받지 못한 기간이다. 해지하면 바로 끝낸다.
  it('갱신 결제가 실패한 상태에서 해지하면 바로 끝내고 무료로 돌린다', () => {
    expect(decidePortOneCancel('past_due')).toEqual({ ok: true, status: 'canceled' })
  })

  // 왜: 구독이 없거나 이미 해지 예약이면 할 일이 없다.
  it('구독이 없거나 이미 해지했으면 해지하지 않는다', () => {
    expect(decidePortOneCancel('none')).toEqual({ ok: false, reason: 'no_subscription' })
    expect(decidePortOneCancel('cancel_scheduled')).toEqual({ ok: false, reason: 'already_canceled' })
  })
})
