// 국내 카드 결제 — PortOne V2 · KG이니시스 (2026-11-19 오너: "PG가 월요일에는 되었으면").
//   Paddle(해외 카드·달러)은 그대로 두고, 원화 Take 팩 1회 결제를 이 통로로 더한다. 약속: tests/billing/portone.test.ts.
//
//   흐름: 서버가 결제 번호를 만들고 "누구의 어떤 팩, 얼마"를 billing_events 에 주문으로 남긴다(prepare) →
//   브라우저가 그 번호로 PortOne 결제창을 연다 → 끝나면 완료 주소(complete)와 결제 알림(webhook)이 각자
//   processPortOnePayment 를 부른다. 이 함수는 브라우저 말을 믿지 않고 PortOne API 에 결제를 다시 물어
//   "결제 완료 + 원화 + 주문 금액과 같음"일 때만 Take 를 준다. 두 경로가 같은 함수라 적립 규칙은 한 벌이다.
//
//   키(환경마다 다르다 — 개발 사이트 = 테스트 채널, 실제 사이트 = 실연동 채널):
//     NEXT_PUBLIC_PORTONE_STORE_ID · NEXT_PUBLIC_PORTONE_CHANNEL_KEY (브라우저 결제창)
//     PORTONE_API_SECRET (서버의 결제 조회) · PORTONE_WEBHOOK_SECRET (알림 서명 검증)
import { randomUUID } from 'node:crypto'
import { Webhook } from '@portone/server-sdk'
import { PADDLE_PLANS, PADDLE_TAKE_PACKS, type PaddlePlanId, type PaddleTakePackId } from '@/lib/billing/catalog'
import { canBuyTakePack, type SubscriptionStatus } from '@/lib/billing/account-summary'
import type { OpsAlert } from '@/lib/ops-alert'

export {
  PORTONE_PACK_PRICES_KRW,
  PORTONE_PLAN_PRICES_KRW,
  readPortOneBillingChannelKey,
  readPortOnePublicConfig,
} from '@/lib/billing/portone-public'
import {
  PORTONE_PACK_PRICES_KRW,
  PORTONE_PLAN_PRICES_KRW,
  readPortOneBillingChannelKey,
  readPortOnePublicConfig,
} from '@/lib/billing/portone-public'

export function isPortOneBillingConfigured(): boolean {
  return isPortOneConfigured() && readPortOneBillingChannelKey() !== null
}

/** 서버에서만 의미 있다: 결제창 키와 결제 조회 시크릿이 다 있어야 결제를 끝까지 확인할 수 있다. */
export function isPortOneConfigured(): boolean {
  return readPortOnePublicConfig() !== null && !!process.env.PORTONE_API_SECRET?.trim()
}

// ── 결제창 열기 판정 ───────────────────────────────────────────────────────────

export type PaddlePlanIdForPortOne = PaddlePlanId

export type PortOneDenyReason = 'portone_not_configured' | 'unknown_item' | 'no_krw_price' | 'free_pack_limit'

export type PortOnePackDecision =
  | { ok: true; packId: PaddleTakePackId; amountKrw: number; orderName: string }
  | { ok: false; reason: PortOneDenyReason }

export function decidePortOnePack(input: {
  packId: string
  workspacePlan: string
  packPurchasedBefore: boolean
  configured: boolean
  prices?: Record<PaddleTakePackId, number | null>
}): PortOnePackDecision {
  if (!input.configured) return { ok: false, reason: 'portone_not_configured' }
  const pack = PADDLE_TAKE_PACKS.find((p) => p.id === input.packId)
  if (!pack) return { ok: false, reason: 'unknown_item' }
  const amountKrw = (input.prices ?? PORTONE_PACK_PRICES_KRW)[pack.id]
  if (typeof amountKrw !== 'number' || !Number.isInteger(amountKrw) || amountKrw <= 0) return { ok: false, reason: 'no_krw_price' }
  if (!canBuyTakePack({ plan: input.workspacePlan, packPurchasedBefore: input.packPurchasedBefore })) {
    return { ok: false, reason: 'free_pack_limit' }
  }
  return { ok: true, packId: pack.id, amountKrw, orderName: `Tale Studio Take ${pack.takes}` }
}

export type PortOnePlanDenyReason = 'portone_not_configured' | 'unknown_item' | 'no_krw_price' | 'already_subscribed'

export type PortOnePlanDecision =
  | { ok: true; planId: PaddlePlanId; amountKrw: number; orderName: string }
  | { ok: false; reason: PortOnePlanDenyReason }

export function decidePortOnePlan(input: {
  planId: string
  configured: boolean
  subscriptionStatus: SubscriptionStatus
  prices?: Record<PaddlePlanId, number | null>
}): PortOnePlanDecision {
  if (!input.configured) return { ok: false, reason: 'portone_not_configured' }
  const plan = PADDLE_PLANS.find((p) => p.id === input.planId)
  if (!plan) return { ok: false, reason: 'unknown_item' }
  const amountKrw = (input.prices ?? PORTONE_PLAN_PRICES_KRW)[plan.id]
  if (typeof amountKrw !== 'number' || !Number.isInteger(amountKrw) || amountKrw <= 0) return { ok: false, reason: 'no_krw_price' }
  // 첫 버전엔 플랜 바꾸기가 없다. 결제 실패 중(past_due)도 살아 있는 구독이라 새로 열지 않는다.
  if (['active', 'cancel_scheduled', 'past_due'].includes(input.subscriptionStatus)) return { ok: false, reason: 'already_subscribed' }
  return { ok: true, planId: plan.id, amountKrw, orderName: `Tale Studio ${plan.name} (1 month)` }
}

export { PORTONE_SUBSCRIPTION_PREFIX, isPortOneSubscriptionId } from '@/lib/billing/portone-public'
import { PORTONE_SUBSCRIPTION_PREFIX } from '@/lib/billing/portone-public'
export function newPortOneSubscriptionId(): string {
  return `${PORTONE_SUBSCRIPTION_PREFIX}${randomUUID()}`
}

export function newPortOnePaymentId(): string {
  return `tale-${randomUUID()}`
}

// ── 결제 확인 → Take 적립 ──────────────────────────────────────────────────────

export type PortOneOrder =
  | { kind: 'pack'; paymentId: string; workspaceId: string; packId: PaddleTakePackId; amountKrw: number }
  | {
      kind: 'plan'
      paymentId: string
      workspaceId: string
      planId: PaddlePlanId
      amountKrw: number
      subscriptionId: string
      /** 갱신 결제면 새 기간의 끝(앞 기간 끝 + 1달). 첫 결제면 null — 결제 시각 + 1달. */
      periodEnd: string | null
    }

/** PortOne 결제 조회 응답에서 쓰는 칸만. */
export interface PortOnePayment {
  status: string
  amountTotal: number | null
  /** 지금까지 취소(환불)된 금액 합. */
  amountCancelled?: number | null
  currency: string | null
  paidAt: string | null
}

export type RecordEventResult = 'new' | 'duplicate_processed' | 'duplicate_unprocessed'

export interface PortOneDeps {
  now: () => Date
  /** prepare 가 남긴 주문. 없으면 우리가 연 결제가 아니다. */
  findOrder(paymentId: string): Promise<PortOneOrder | null>
  /** PortOne API 결제 단건 조회. 결제가 없으면 null. */
  fetchPayment(paymentId: string): Promise<PortOnePayment | null>
  recordEvent(input: { id: string; type: string; payload: unknown }): Promise<RecordEventResult>
  markProcessed(eventId: string): Promise<void>
  findWorkspace(workspaceId: string): Promise<{ id: string; plan: string } | null>
  hasGrant(refKind: string, refId: string): Promise<boolean>
  grant(input: {
    workspaceId: string
    kind: 'grant_purchase' | 'grant_plan'
    amount: number
    expiresAt: string | null
    refKind: string
    refId: string
    reason: string
  }): Promise<void>
  alert(alert: OpsAlert): Promise<void>
  setPlan(workspaceId: string, plan: string): Promise<void>
  upsertSubscription(row: {
    workspaceId: string
    morSubscriptionId: string
    plan: string
    status: string
    currentPeriodEnd: string | null
  }): Promise<void>
  /** 이 결제(paymentId)로 준 적립 행들. */
  findGrantsForPayment(paymentId: string): Promise<{ id: string; workspaceId: string; delta: number }[]>
  /** 이 결제에 대해 이미 회수한 Take 합(양수). */
  revokedTotalForPayment(paymentId: string): Promise<number>
  revoke(input: { workspaceId: string; grantId: string; amount: number; refId: string; reason: string }): Promise<void>
  /** 구독을 끝내고(상태 canceled · 카드 삭제) 다른 구독이 없으면 무료로 돌린다. */
  endSubscription(input: { workspaceId: string; subscriptionId: string; plan: string }): Promise<void>
}

export const PORTONE_REF_KIND = 'portone_payment'
export const portoneOrderEventId = (paymentId: string) => `portone_order_${paymentId}`
const paidEventId = (paymentId: string) => `portone_paid_${paymentId}`

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === '23505'
}

export type PortOneProcessResult =
  | 'unknown_order'
  | 'payment_not_found'
  | 'not_paid'
  | 'amount_mismatch'
  | 'workspace_not_found'
  | 'already_granted'
  | 'duplicate'
  | 'pack_granted'
  | 'plan_granted'

export async function processPortOnePayment(paymentId: string, deps: PortOneDeps): Promise<PortOneProcessResult> {
  const order = await deps.findOrder(paymentId)
  if (!order) return 'unknown_order'

  const payment = await deps.fetchPayment(paymentId)
  if (!payment) return 'payment_not_found'
  // 결제 전·실패·가상계좌 입금 대기 등. 기록하지 않는다 — 나중에 완료 알림이 오면 다시 처리해야 한다.
  if (payment.status !== 'PAID') return 'not_paid'

  const eventId = paidEventId(paymentId)
  const recorded = await deps.recordEvent({ id: eventId, type: 'portone.payment_paid', payload: { order, payment } })
  if (recorded === 'duplicate_processed') return 'duplicate'

  const result = await settle(order, payment, deps)
  await deps.markProcessed(eventId)
  return result
}

async function settle(order: PortOneOrder, payment: PortOnePayment, deps: PortOneDeps): Promise<PortOneProcessResult> {
  if (payment.currency !== 'KRW' || payment.amountTotal !== order.amountKrw) {
    await deps.alert({
      level: 'error',
      title: 'PortOne 결제 금액이 주문과 다르다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `payment ${order.paymentId}: 주문 ${order.amountKrw} KRW, 결제 ${payment.amountTotal ?? '?'} ${payment.currency ?? '?'}. Take 를 주지 않았다. PortOne 콘솔에서 확인 후 취소 또는 관리자 적립.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return 'amount_mismatch'
  }

  const workspace = await deps.findWorkspace(order.workspaceId)
  if (!workspace) {
    await deps.alert({
      level: 'error',
      title: 'PortOne 결제의 워크스페이스를 찾을 수 없다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `payment ${order.paymentId} → workspace ${order.workspaceId}. 원문만 남겼다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return 'workspace_not_found'
  }

  if (order.kind === 'plan') return settlePlan(order, payment, workspace.id, deps)

  if (await deps.hasGrant(PORTONE_REF_KIND, order.paymentId)) return 'already_granted'
  const pack = PADDLE_TAKE_PACKS.find((p) => p.id === order.packId)
  if (!pack) throw new Error(`unknown pack ${order.packId}`)
  const paidAt = payment.paidAt ?? deps.now().toISOString()
  try {
    await deps.grant({
      workspaceId: workspace.id,
      kind: 'grant_purchase',
      amount: pack.takes,
      expiresAt: addMonths(paidAt, 12),
      refKind: PORTONE_REF_KIND,
      refId: order.paymentId,
      reason: `portone pack ${pack.id} (${order.amountKrw} KRW)`,
    })
  } catch (err) {
    if (isUniqueViolation(err)) return 'already_granted'
    throw err
  }
  return 'pack_granted'
}

async function settlePlan(
  order: Extract<PortOneOrder, { kind: 'plan' }>,
  payment: PortOnePayment,
  workspaceId: string,
  deps: PortOneDeps,
): Promise<PortOneProcessResult> {
  const plan = PADDLE_PLANS.find((p) => p.id === order.planId)
  if (!plan) throw new Error(`unknown plan ${order.planId}`)
  const paidAt = payment.paidAt ?? deps.now().toISOString()
  const ends = order.periodEnd ?? addMonths(paidAt, 1)
  await deps.setPlan(workspaceId, plan.id)
  await deps.upsertSubscription({
    workspaceId,
    morSubscriptionId: order.subscriptionId,
    plan: plan.id,
    status: 'active',
    currentPeriodEnd: ends,
  })
  if (await deps.hasGrant(PORTONE_REF_KIND, order.paymentId)) return 'already_granted'
  try {
    await deps.grant({
      workspaceId,
      kind: 'grant_plan',
      amount: plan.entitlements.includedTakesPerMonth,
      expiresAt: ends,
      refKind: PORTONE_REF_KIND,
      refId: order.paymentId,
      reason: `portone plan ${plan.id} (${order.amountKrw} KRW) until ${ends}`,
    })
  } catch (err) {
    if (isUniqueViolation(err)) return 'already_granted'
    throw err
  }
  return 'plan_granted'
}

// ── 결제 취소(환불) → Take 회수 ─────────────────────────────────────────────────
// 오너 2026-11-19 "결제 취소인데 왜 회수가 안돼?" — 취소된 금액 비율만큼 그 결제로 준 Take 를 회수한다.
//   이미 써 버린 Take 도 줄이지 않고 회수한다: 잔액이 0 아래로 가면 새 생성이 멈춘다(Paddle 환불과 같은 규칙).
//   구독 결제가 전액 취소되면 그 구독도 끝낸다(다음 달 청구가 나가지 않게).

export type PortOneCancelResult = 'unknown_order' | 'payment_not_found' | 'not_cancelled' | 'nothing_to_revoke' | 'already_revoked' | 'revoked'

export async function processPortOneCancel(paymentId: string, deps: PortOneDeps): Promise<PortOneCancelResult> {
  const order = await deps.findOrder(paymentId)
  if (!order) return 'unknown_order'
  const payment = await deps.fetchPayment(paymentId)
  if (!payment) return 'payment_not_found'
  const cancelled = payment.amountCancelled ?? 0
  const total = payment.amountTotal ?? order.amountKrw
  if (cancelled <= 0 || total <= 0) return 'not_cancelled'
  const ratio = Math.min(1, cancelled / total)

  const grants = await deps.findGrantsForPayment(paymentId)
  if (grants.length === 0) {
    await deps.alert({
      level: 'warn',
      title: 'PortOne 결제 취소인데 회수할 적립이 없다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `payment ${paymentId}: ${cancelled}/${total} KRW 취소. 적립 기록이 없어 회수하지 않았다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    if (order.kind === 'plan' && ratio >= 1) await deps.endSubscription({ workspaceId: order.workspaceId, subscriptionId: order.subscriptionId, plan: order.planId })
    return 'nothing_to_revoke'
  }
  if (grants.length !== 1) throw new Error(`Ambiguous grants for PortOne payment ${paymentId}`)
  const grant = grants[0]
  const target = Math.round(grant.delta * ratio)
  const already = await deps.revokedTotalForPayment(paymentId)
  const amount = Math.min(target, grant.delta) - already

  if (order.kind === 'plan' && ratio >= 1) {
    await deps.endSubscription({ workspaceId: grant.workspaceId, subscriptionId: order.subscriptionId, plan: order.planId })
  }
  if (amount <= 0) return 'already_revoked'
  try {
    await deps.revoke({
      workspaceId: grant.workspaceId,
      grantId: grant.id,
      amount,
      refId: `${paymentId}:${cancelled}`,
      reason: `portone cancel of ${paymentId} (${Math.round(ratio * 100)}%)`,
    })
  } catch (err) {
    if (isUniqueViolation(err)) return 'already_revoked'
    throw err
  }
  await deps.alert({
    level: 'info',
    title: 'PortOne 결제 취소 회수', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    body: `workspace ${grant.workspaceId}: ${amount} Take 회수 (payment ${paymentId}, ${Math.round(ratio * 100)}%).`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
  })
  return 'revoked'
}

// ── 구독 갱신·해지 판정 ────────────────────────────────────────────────────────

export const PORTONE_RENEWAL_MAX_FAILURES = 3
/** 갱신 청구 시각(한국 시간). 오너 2026-11-19 "하루에 아침 점심 저녁에 하고 무료로 바로 다음날". */
export const PORTONE_RENEWAL_HOURS_KST = [9, 12, 18] as const
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function kst(date: Date): { day: string; hour: number } {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() }
}

/** 지금이 청구 시각이면 그 시각의 이름(날짜·시), 아니면 null. */
function renewalSlot(date: Date): string | null {
  const { day, hour } = kst(date)
  return (PORTONE_RENEWAL_HOURS_KST as readonly number[]).includes(hour) ? `${day}T${hour}` : null
}

/** 매시간 점검이 구독 하나에 대해 할 일. charge = 다음 달 청구, end = 구독을 끝내고 무료로, wait = 아무것도 안 함. */
export function decidePortOneRenewal(input: {
  status: string
  currentPeriodEnd: string | null
  now: Date
  failedAttempts: number
  lastFailedAt: string | null
}): 'charge' | 'end' | 'wait' {
  const ends = input.currentPeriodEnd ? Date.parse(input.currentPeriodEnd) : NaN
  if (!Number.isFinite(ends) || ends > input.now.getTime()) return 'wait'
  const slot = renewalSlot(input.now)
  switch (input.status) {
    case 'active':
      return slot ? 'charge' : 'wait'
    case 'cancel_scheduled':
      return 'end'
    case 'past_due': {
      const last = input.lastFailedAt ? new Date(input.lastFailedAt) : null
      if (input.failedAttempts >= PORTONE_RENEWAL_MAX_FAILURES) {
        // 세 번 실패한 그날은 두고, 한국 날짜가 바뀐 뒤 첫 점검에서 끝낸다.
        return !last || kst(input.now).day > kst(last).day ? 'end' : 'wait'
      }
      if (!slot) return 'wait'
      if (last && renewalSlot(last) === slot) return 'wait'
      return 'charge'
    }
    default:
      return 'wait'
  }
}

export function decidePortOneCancel(
  status: string,
): { ok: true; status: 'cancel_scheduled' | 'canceled' } | { ok: false; reason: 'no_subscription' | 'already_canceled' } {
  if (status === 'active') return { ok: true, status: 'cancel_scheduled' }
  if (status === 'past_due') return { ok: true, status: 'canceled' }
  if (status === 'cancel_scheduled') return { ok: false, reason: 'already_canceled' }
  return { ok: false, reason: 'no_subscription' }
}

// ── 결제 알림(웹훅) ────────────────────────────────────────────────────────────

export interface PortOneWebhookOutcome {
  status: 200 | 401 | 500
  body: { ok: boolean; result?: string; error?: string }
}

interface PortOneWebhookBody {
  type?: string
  data?: { paymentId?: string }
}

export async function handlePortOneWebhook(input: {
  rawBody: string
  headers: Record<string, string | null | undefined>
  secret: string
  deps: PortOneDeps
}): Promise<PortOneWebhookOutcome> {
  let event: PortOneWebhookBody
  try {
    event = (await Webhook.verify(input.secret, input.rawBody, input.headers as Record<string, string>)) as PortOneWebhookBody
  } catch {
    return { status: 401, body: { ok: false, error: 'invalid_signature' } }
  }

  const paymentId = typeof event.data?.paymentId === 'string' ? event.data.paymentId : null
  try {
    switch (event.type) {
      case 'Transaction.Paid': {
        if (!paymentId) return { status: 200, body: { ok: true, result: 'ignored' } }
        const result = await processPortOnePayment(paymentId, input.deps)
        return { status: 200, body: { ok: true, result } }
      }
      case 'Transaction.Cancelled':
      case 'Transaction.PartialCancelled': {
        if (!paymentId) return { status: 200, body: { ok: true, result: 'ignored' } }
        const result = await processPortOneCancel(paymentId, input.deps)
        return { status: 200, body: { ok: true, result } }
      }
      default:
        return { status: 200, body: { ok: true, result: 'ignored' } }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await input.deps.alert({
      level: 'error',
      title: `PortOne 웹훅 처리 실패 (${event.type ?? '?'})`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `payment ${paymentId ?? '?'}: ${message}. PortOne 이 재전송하면 다시 처리한다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return { status: 500, body: { ok: false, error: 'processing_failed' } }
  }
}
