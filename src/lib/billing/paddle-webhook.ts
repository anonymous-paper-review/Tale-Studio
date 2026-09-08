// Paddle 웹훅 핸들러 — 결제 알림이 Take 와 플랜의 유일한 진실이다 (#payments-phase-3 P1, 약속: tests/paddle-webhook.test.ts).
//
//   4원칙(specs/payments-readiness.md 2장): ① 서명 검증 ② 멱등성 ③ 순서 뒤집힘 허용 ④ 원본 저장.
//   - 서명: Paddle-Signature `ts=…;h1=…`, HMAC-SHA256(secret, `${ts}:${rawBody}`), 5분 허용.
//   - 멱등성 두 겹: 알림 번호(billing_events.mor_event_id UNIQUE)로 재전송을 거르고, 적립·회수는 참조(txn/adjustment id)로
//     또 한 번 거른다 — 처리 도중 실패해 5xx 를 돌려준 뒤 재전송이 오면 절반만 다시 하는 일이 없게.
//   - 원본: 서명이 맞으면 처리 전에 저장한다. 처리 성공 시 processed_at 을 찍고, 실패면 안 찍어 재전송 때 다시 처리한다.
//   - DB 는 deps 로 주입(route.ts 가 Supabase 구현을 붙인다). 이 파일은 순수 로직만.
//
//   정책(paddle-scenarios.md, 오너 09-07 확정):
//   - 팩: grant_purchase, 결제일+12개월. 무료 워크스페이스 두 번째 팩은 적립하되 경보(결제창 앞 서버 판정을 우회한 신호).
//   - 구독 결제(첫 결제·갱신·플랜 변경 모두): 플랜 세팅 + grant_plan(포함량, 결제 주기 끝까지). 결제일 리셋형이라 만료 = 주기 끝.
//   - 갱신 실패: subscription.past_due → 즉시 무료 + 경보. 재시도 성공 → transaction.completed 가 다시 올려준다.
//   - 취소 예약: 플랜 유지, 상태만 cancel_scheduled. 실제 취소·일시정지 → 무료.
//   - 환불·차지백: adjustment(approved) → 그 결제로 들어간 Take × (환불액/결제액) 회수. 잔액 음수 허용(생성 차단은 take_hold 가).

import { createHmac, timingSafeEqual } from 'node:crypto'
import { resolvePaddlePrice } from '@/lib/billing/catalog'
import type { OpsAlert } from '@/lib/ops-alert'

export const PADDLE_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000

/**
 * DB 유일 제약 위반(Postgres 23505)인가 (#payments-phase-3 P14).
 *   웹훅 재전송이 우리 서버 두 대에 동시에 떨어지면 조회(hasGrant/hasRevoke)는 둘 다 "없다" 를 받는다.
 *   그때 두 번째 삽입을 DB 가 거부하는데, 그 거부는 사고가 아니라 "이미 적립됨" 이다 — 200 으로 답해야
 *   Paddle 이 재전송을 멈춘다. 5xx 로 답하면 사흘간 계속 온다.
 */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  if (code === '23505') return true
  const message = (err as { message?: unknown }).message
  return typeof message === 'string' && message.includes('duplicate key value violates unique constraint')
}

export function verifyPaddleSignature(input: {
  rawBody: string
  header: string | null | undefined
  secret: string
  nowMs: number
  toleranceMs?: number
}): boolean {
  if (!input.header || !input.secret) return false
  const parts = new Map<string, string[]>()
  for (const segment of input.header.split(';')) {
    const i = segment.indexOf('=')
    if (i <= 0) continue
    const key = segment.slice(0, i).trim()
    const value = segment.slice(i + 1).trim()
    parts.set(key, [...(parts.get(key) ?? []), value])
  }
  const ts = parts.get('ts')?.[0]
  const signatures = parts.get('h1') ?? []
  if (!ts || signatures.length === 0) return false
  const tsMs = Number.parseInt(ts, 10) * 1000
  if (!Number.isFinite(tsMs)) return false
  if (Math.abs(input.nowMs - tsMs) > (input.toleranceMs ?? PADDLE_SIGNATURE_TOLERANCE_MS)) return false
  const expected = createHmac('sha256', input.secret).update(`${ts}:${input.rawBody}`).digest()
  return signatures.some((h1) => {
    const given = Buffer.from(h1, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

// ── deps ───────────────────────────────────────────────────────────────────────

export type RecordEventResult = 'new' | 'duplicate_processed' | 'duplicate_unprocessed'

export interface PaddleWebhookDeps {
  now: () => Date
  recordEvent(input: { id: string; type: string; payload: unknown }): Promise<RecordEventResult>
  markProcessed(eventId: string): Promise<void>
  findWorkspace(workspaceId: string): Promise<{ id: string; plan: string } | null>
  findWorkspaceBySubscription(morSubscriptionId: string): Promise<{ id: string; plan: string } | null>
  setPlan(workspaceId: string, plan: string): Promise<void>
  upsertSubscription(row: {
    workspaceId: string
    morSubscriptionId: string
    plan: string
    status: string
    currentPeriodEnd: string | null
  }): Promise<void>
  hasGrant(refKind: string, refId: string): Promise<boolean>
  grant(input: {
    workspaceId: string
    kind: 'grant_plan' | 'grant_purchase'
    amount: number
    expiresAt: string | null
    refKind: string
    refId: string
    reason: string
  }): Promise<void>
  hasPackPurchase(workspaceId: string): Promise<boolean>
  findGrantsForTransaction(transactionId: string): Promise<{ id: string; workspaceId: string; kind: string; delta: number }[]>
  /** 원 결제 총액(최소 단위, 예: 2900 = $29.00). 우리가 저장한 transaction.completed 원문에서 읽는다. */
  findTransactionTotal(transactionId: string): Promise<number | null>
  hasRevoke(adjustmentId: string): Promise<boolean>
  /** 이 결제에 대해 이미 회수한 Take 합(양수). 부분 환불이 여러 번 와도 적립을 넘지 않게 캡을 건다. */
  revokedTotalForTransaction(transactionId: string): Promise<number>
  revoke(input: { workspaceId: string; amount: number; refId: string; reason: string }): Promise<void>
  alert(alert: OpsAlert): Promise<void>
}

export interface PaddleWebhookOutcome {
  status: 200 | 401 | 500
  body: { ok: boolean; result?: string; error?: string }
}

// ── payload shapes (필요한 필드만) ─────────────────────────────────────────────

interface PaddleEvent {
  event_id: string
  event_type: string
  occurred_at?: string
  data: Record<string, unknown>
}

interface PriceItem {
  price?: { id?: string }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function customWorkspaceId(data: Record<string, unknown>): string | null {
  const custom = data.custom_data
  if (custom && typeof custom === 'object') return str((custom as Record<string, unknown>).workspace_id)
  return null
}

function firstPriceId(data: Record<string, unknown>): string | null {
  const items = Array.isArray(data.items) ? (data.items as PriceItem[]) : []
  for (const item of items) {
    const id = str(item?.price?.id)
    if (id) return id
  }
  return null
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

function periodEnd(data: Record<string, unknown>, key: 'billing_period' | 'current_billing_period', fallbackFrom: string): string {
  const period = data[key]
  if (period && typeof period === 'object') {
    const ends = str((period as Record<string, unknown>).ends_at)
    if (ends) return ends
  }
  return addMonths(fallbackFrom, 1)
}

// ── handler ────────────────────────────────────────────────────────────────────

export async function handlePaddleWebhook(input: {
  rawBody: string
  signatureHeader: string | null | undefined
  secret: string
  deps: PaddleWebhookDeps
}): Promise<PaddleWebhookOutcome> {
  const { deps } = input
  const nowMs = deps.now().getTime()

  if (!verifyPaddleSignature({ rawBody: input.rawBody, header: input.signatureHeader, secret: input.secret, nowMs })) {
    return { status: 401, body: { ok: false, error: 'invalid_signature' } }
  }

  let event: PaddleEvent
  try {
    const parsed = JSON.parse(input.rawBody) as Partial<PaddleEvent>
    if (!parsed || typeof parsed.event_id !== 'string' || typeof parsed.event_type !== 'string' || !parsed.data) {
      return { status: 401, body: { ok: false, error: 'malformed_event' } }
    }
    event = parsed as PaddleEvent
  } catch {
    return { status: 401, body: { ok: false, error: 'malformed_event' } }
  }

  const recorded = await deps.recordEvent({ id: event.event_id, type: event.event_type, payload: event })
  if (recorded === 'duplicate_processed') return { status: 200, body: { ok: true, result: 'duplicate' } }

  try {
    const result = await dispatch(event, deps)
    await deps.markProcessed(event.event_id)
    return { status: 200, body: { ok: true, result } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await deps.alert({
      level: 'error',
      title: `Paddle 웹훅 처리 실패 (${event.event_type})`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `event ${event.event_id}: ${message}. Paddle 이 재전송하면 다시 처리한다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return { status: 500, body: { ok: false, error: 'processing_failed' } }
  }
}

async function dispatch(event: PaddleEvent, deps: PaddleWebhookDeps): Promise<string> {
  switch (event.event_type) {
    case 'transaction.completed':
      return handleTransactionCompleted(event, deps)
    case 'transaction.payment_failed':
      return handlePaymentFailed(event, deps)
    case 'subscription.activated':
    case 'subscription.updated':
    case 'subscription.past_due':
    case 'subscription.canceled':
    case 'subscription.paused':
    case 'subscription.resumed':
    case 'subscription.trialing':
      return handleSubscriptionChanged(event, deps)
    case 'adjustment.created':
    case 'adjustment.updated':
      return handleAdjustment(event, deps)
    default:
      return 'ignored'
  }
}

/**
 * 결제 하나를 장부에 옮긴다. 웹훅과 재조회(P12)가 같은 코드를 쓴다 — 적립 규칙이 두 벌이 되면 반드시 어긋난다.
 * 재조회는 Paddle API 에서 받은 거래를 이 함수가 아는 모양(event.data)으로 감싸서 넘긴다. 서명 검증은 재조회에
 * 필요 없다 — Paddle API 응답 자체가 출처다. 이중 적립은 hasGrant 와 DB 유일 제약(P14)이 막는다.
 */
export async function processPaddleTransaction(
  transaction: Record<string, unknown>,
  deps: PaddleWebhookDeps,
  occurredAt?: string,
): Promise<string> {
  const event: PaddleEvent = {
    event_id: `recon_${str(transaction.id) ?? 'unknown'}`,
    event_type: 'transaction.completed',
    occurred_at: occurredAt,
    data: transaction,
  }
  // 웹훅과 같은 순서로 간다: 원문 저장 → 처리 → 처리 완료 표시.
  //   원문을 안 남기면 분쟁 때 근거가 사라진다 — 재조회로 들어온 적립만 출처가 없는 상태가 된다.
  //   같은 결제를 두 번 재조회해도 여기서 duplicate_processed 로 걸린다(적립 이중 방어의 첫 겹).
  const recorded = await deps.recordEvent({ id: event.event_id, type: event.event_type, payload: event })
  if (recorded === 'duplicate_processed') return 'duplicate'
  const result = await handleTransactionCompleted(event, deps)
  await deps.markProcessed(event.event_id)
  return result
}

async function handleTransactionCompleted(event: PaddleEvent, deps: PaddleWebhookDeps): Promise<string> {
  const data = event.data
  const txnId = str(data.id) ?? event.event_id
  const workspaceId = customWorkspaceId(data)
  if (!workspaceId) {
    await deps.alert({
      level: 'error',
      title: '결제 알림에 워크스페이스 표시가 없다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `transaction ${txnId}. 원문만 남기고 적립하지 않았다. Paddle 대시보드에서 고객을 확인해 관리자 적립으로 처리.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return 'no_workspace'
  }
  const workspace = await deps.findWorkspace(workspaceId)
  if (!workspace) {
    await deps.alert({
      level: 'error',
      title: '결제 알림의 워크스페이스를 찾을 수 없다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `transaction ${txnId} → workspace ${workspaceId}. 원문만 남겼다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return 'workspace_not_found'
  }

  const priceId = firstPriceId(data)
  const resolved = resolvePaddlePrice(priceId)
  if (!resolved) {
    await deps.alert({
      level: 'error',
      title: '결제 알림의 상품이 우리 목록에 없다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `transaction ${txnId}, price ${priceId ?? '(none)'}. 원문만 남겼다. 상품 대응표(catalog.ts)·env 확인.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return 'unknown_price'
  }

  const billedAt = str(data.billed_at) ?? event.occurred_at ?? deps.now().toISOString()
  const refKind = 'paddle_transaction'

  if (resolved.kind === 'pack') {
    if (await deps.hasGrant(refKind, txnId)) return 'already_granted'
    if (workspace.plan === 'free' && (await deps.hasPackPurchase(workspace.id))) {
      await deps.alert({
        level: 'warn',
        title: '무료 워크스페이스가 팩을 두 번째 샀다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
        body: `workspace ${workspace.id}, transaction ${txnId}. v4 충전 상한(무료는 Mini 1회)을 결제창 앞 판정이 막았어야 한다. Take 는 적립했다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      })
    }
    try {
      await deps.grant({
        workspaceId: workspace.id,
        kind: 'grant_purchase',
        amount: resolved.pack.takes,
        expiresAt: addMonths(billedAt, 12),
        refKind,
        refId: txnId,
        reason: `paddle pack ${resolved.pack.id}`,
      })
    } catch (err) {
      if (isUniqueViolation(err)) return 'already_granted'
      throw err
    }
    return 'pack_granted'
  }

  const plan = resolved.plan
  const ends = periodEnd(data, 'billing_period', billedAt)
  const subscriptionId = str(data.subscription_id)
  await deps.setPlan(workspace.id, plan.id)
  if (subscriptionId) {
    await deps.upsertSubscription({
      workspaceId: workspace.id,
      morSubscriptionId: subscriptionId,
      plan: plan.id,
      status: 'active',
      currentPeriodEnd: ends,
    })
  }
  if (await deps.hasGrant(refKind, txnId)) return 'already_granted'
  try {
    await deps.grant({
      workspaceId: workspace.id,
      kind: 'grant_plan',
      amount: plan.entitlements.includedTakesPerMonth,
      expiresAt: ends,
      refKind,
      refId: txnId,
      reason: `paddle plan ${plan.id} (${str(data.origin) ?? 'web'})`,
    })
  } catch (err) {
    if (isUniqueViolation(err)) return 'already_granted'
    throw err
  }
  return 'plan_granted'
}

async function handlePaymentFailed(event: PaddleEvent, deps: PaddleWebhookDeps): Promise<string> {
  const data = event.data
  const subscriptionId = str(data.subscription_id)
  const origin = str(data.origin) ?? 'web'
  // 결제창에서 카드가 거절된 것(origin web, 구독 없음)은 유저가 다시 시도하면 되는 일이라 경보 대상이 아니다.
  //   2026-09-07 오너 실측: 거절 카드 테스트가 "갱신 결제 실패"로 디스코드에 왔다. 갱신(subscription_recurring)만 경보.
  if (!subscriptionId || origin === 'web') return 'card_declined_noted'
  await deps.alert({
    level: 'warn',
    title: '갱신 결제 실패', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    body: `transaction ${str(data.id) ?? '?'}, subscription ${subscriptionId}, workspace ${customWorkspaceId(data) ?? '?'}. Paddle 이 재시도한다. 최종 실패면 subscription.past_due/canceled 가 뒤따른다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
  })
  return 'payment_failed_noted'
}

async function resolveSubscriptionWorkspace(data: Record<string, unknown>, deps: PaddleWebhookDeps) {
  const fromCustom = customWorkspaceId(data)
  if (fromCustom) {
    const ws = await deps.findWorkspace(fromCustom)
    if (ws) return ws
  }
  const subId = str(data.id)
  return subId ? deps.findWorkspaceBySubscription(subId) : null
}

async function handleSubscriptionChanged(event: PaddleEvent, deps: PaddleWebhookDeps): Promise<string> {
  const data = event.data
  const subId = str(data.id)
  if (!subId) return 'no_subscription_id'
  const workspace = await resolveSubscriptionWorkspace(data, deps)
  if (!workspace) {
    await deps.alert({
      level: 'error',
      title: '구독 알림의 워크스페이스를 찾을 수 없다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `subscription ${subId} (${event.event_type}). 원문만 남겼다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return 'workspace_not_found'
  }

  const paddleStatus = str(data.status) ?? 'active'
  const scheduled = data.scheduled_change
  const scheduledAction =
    scheduled && typeof scheduled === 'object' ? str((scheduled as Record<string, unknown>).action) : null
  const resolved = resolvePaddlePrice(firstPriceId(data))
  const planId = resolved?.kind === 'plan' ? resolved.plan.id : null
  const ends = periodEnd(data, 'current_billing_period', event.occurred_at ?? deps.now().toISOString())

  let status: string
  let plan: string
  if (paddleStatus === 'past_due') {
    status = 'past_due'
    plan = 'free'
    await deps.alert({
      level: 'warn',
      title: '갱신 결제 실패 — 구독이 밀렸다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `workspace ${workspace.id}, subscription ${subId}. 플랜을 무료로 내렸다. 재시도가 성공하면 결제 알림이 다시 올린다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
  } else if (paddleStatus === 'canceled' || paddleStatus === 'paused') {
    status = paddleStatus
    plan = 'free'
  } else if (scheduledAction === 'cancel' || scheduledAction === 'pause') {
    status = 'cancel_scheduled'
    plan = planId ?? workspace.plan
  } else {
    status = 'active'
    plan = planId ?? workspace.plan
  }

  await deps.setPlan(workspace.id, plan)
  await deps.upsertSubscription({
    workspaceId: workspace.id,
    morSubscriptionId: subId,
    plan: planId ?? (plan === 'free' ? workspace.plan : plan),
    status,
    currentPeriodEnd: ends,
  })
  return `subscription_${status}`
}

async function handleAdjustment(event: PaddleEvent, deps: PaddleWebhookDeps): Promise<string> {
  const data = event.data
  const action = str(data.action)
  if (action !== 'refund' && action !== 'chargeback') return 'adjustment_ignored'
  if (str(data.status) !== 'approved') return 'adjustment_pending'
  const adjId = str(data.id) ?? event.event_id
  const txnId = str(data.transaction_id)
  if (!txnId) return 'adjustment_no_transaction'
  if (await deps.hasRevoke(adjId)) return 'already_revoked'

  const grants = await deps.findGrantsForTransaction(txnId)
  if (grants.length === 0) {
    await deps.alert({
      level: 'warn',
      title: '환불 알림인데 회수할 적립이 없다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `adjustment ${adjId} → transaction ${txnId}. 적립 기록이 없어 회수하지 않았다. 관리자 확인.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return 'nothing_to_revoke'
  }
  const granted = grants.reduce((s, g) => s + g.delta, 0)
  const totals = data.totals
  const refunded = totals && typeof totals === 'object' ? Number.parseInt(String((totals as Record<string, unknown>).total ?? ''), 10) : NaN
  const original = await deps.findTransactionTotal(txnId)
  const ratio = Number.isFinite(refunded) && original && original > 0 ? Math.min(1, refunded / original) : 1
  const alreadyRevoked = await deps.revokedTotalForTransaction(txnId)
  const amount = Math.min(Math.round(granted * ratio), Math.max(0, granted - alreadyRevoked))
  if (amount <= 0) return 'nothing_to_revoke'

  try {
    await deps.revoke({
      workspaceId: grants[0].workspaceId,
      amount,
      refId: adjId,
      reason: `paddle ${action} of ${txnId} (${Math.round(ratio * 100)}%)`,
    })
  } catch (err) {
    if (isUniqueViolation(err)) return 'already_revoked'
    throw err
  }
  await deps.alert({
    level: 'info',
    title: `${action === 'chargeback' ? '차지백' : '환불'} 회수`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    body: `workspace ${grants[0].workspaceId}: ${amount} Take 회수 (transaction ${txnId}, ${Math.round(ratio * 100)}%).`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
  })
  return 'revoked'
}
