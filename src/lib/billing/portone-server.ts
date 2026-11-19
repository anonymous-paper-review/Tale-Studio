import 'server-only'

// PortOne 결제의 Supabase · PortOne API 구현 (2026-11-19). 순수 규칙은 portone.ts(약속: tests/billing/portone*.test.ts).
//   주문·빌링키·갱신 실패는 새 표 없이 billing_events 에 남긴다(mor_event_id 가 멱등 키). 월요일 오픈에
//   운영 DB 마이그레이션을 끼우지 않으려는 선택이다. Take 적립·구독 기록은 Paddle 과 같은 webhookDeps 를 쓴다.
import { PortOneClient, type Payment } from '@portone/server-sdk'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { webhookDeps } from '@/lib/billing/webhook-deps'
import { LIVE_SUBSCRIPTION_STATUSES } from '@/lib/billing/subscription-state'
import { takeBalance } from '@/lib/billing/take-ledger'
import {
  PORTONE_REF_KIND,
  portoneOrderEventId,
  type PortOneDeps,
  type PortOneOrder,
  type PortOnePayment,
} from '@/lib/billing/portone'

function client() {
  const secret = process.env.PORTONE_API_SECRET?.trim()
  if (!secret) throw new Error('PORTONE_API_SECRET is not set')
  return PortOneClient({ secret })
}

function toPayment(p: Payment.Payment): PortOnePayment {
  const rec = p as unknown as { status: string; amount?: { total?: number; cancelled?: number }; currency?: string; paidAt?: string }
  return {
    status: rec.status,
    amountTotal: typeof rec.amount?.total === 'number' ? rec.amount.total : null,
    amountCancelled: typeof rec.amount?.cancelled === 'number' ? rec.amount.cancelled : 0,
    currency: typeof rec.currency === 'string' ? rec.currency : null,
    paidAt: typeof rec.paidAt === 'string' ? rec.paidAt : null,
  }
}

export async function recordPortOneOrder(order: PortOneOrder): Promise<void> {
  const { error } = await supabaseAdmin
    .from('billing_events')
    .insert({ mor_event_id: portoneOrderEventId(order.paymentId), type: 'portone.order', payload: order })
  if (error) throw error
}

export const portoneDeps: PortOneDeps = {
  now: () => new Date(),
  async findOrder(paymentId) {
    const { data, error } = await supabaseAdmin
      .from('billing_events')
      .select('payload')
      .eq('mor_event_id', portoneOrderEventId(paymentId))
      .maybeSingle()
    if (error) throw error
    return (data?.payload as PortOneOrder | undefined) ?? null
  },
  async fetchPayment(paymentId) {
    try {
      return toPayment(await client().payment.getPayment({ paymentId }))
    } catch (err) {
      if ((err as { data?: { type?: string } } | null)?.data?.type === 'PAYMENT_NOT_FOUND') return null
      throw err
    }
  },
  recordEvent: webhookDeps.recordEvent,
  markProcessed: webhookDeps.markProcessed,
  findWorkspace: webhookDeps.findWorkspace,
  hasGrant: webhookDeps.hasGrant,
  grant: webhookDeps.grant,
  alert: webhookDeps.alert,
  setPlan: webhookDeps.setPlan,
  upsertSubscription: webhookDeps.upsertSubscription,

  async findGrantsForPayment(paymentId) {
    const { data, error } = await supabaseAdmin
      .from('take_ledger')
      .select('id, workspace_id, delta')
      .eq('ref_kind', PORTONE_REF_KIND)
      .eq('ref_id', paymentId)
      .in('kind', ['grant_plan', 'grant_purchase'])
    if (error) throw error
    return (data ?? []).map((r) => ({ id: r.id as string, workspaceId: r.workspace_id as string, delta: r.delta as number }))
  },

  async revokedTotalForPayment(paymentId) {
    const { data, error } = await supabaseAdmin
      .from('take_ledger')
      .select('delta')
      .eq('kind', 'refund_revoke')
      .eq('ref_kind', 'portone_cancel')
      .like('ref_id', `${paymentId}:%`)
    if (error) throw error
    return (data ?? []).reduce((sum, r) => sum - (r.delta as number), 0)
  },

  async revoke(input) {
    const { error } = await supabaseAdmin.from('take_ledger').insert({
      workspace_id: input.workspaceId,
      grant_id: input.grantId,
      delta: -input.amount,
      kind: 'refund_revoke',
      ref_kind: 'portone_cancel',
      ref_id: input.refId,
      reason: input.reason,
    })
    if (error) throw error
  },

  endSubscription: (input) => endPortOneSubscription(input),
  balance: (workspaceId) => takeBalance(workspaceId),
}

// ── 빌링키(정기결제 카드) ────────────────────────────────────────────────────────

const billingKeyEventId = (subscriptionId: string) => `portone_billingkey_${subscriptionId}`

/** 브라우저가 보낸 빌링키가 우리 상점에서 발급된 살아 있는 키인지 PortOne 에 확인한다. */
export async function isIssuedBillingKey(billingKey: string): Promise<boolean> {
  try {
    const info = (await client().payment.billingKey.getBillingKeyInfo({ billingKey })) as { status?: string }
    return info.status === 'ISSUED'
  } catch {
    return false
  }
}

export async function saveBillingKey(input: { subscriptionId: string; workspaceId: string; billingKey: string }): Promise<void> {
  const { error } = await supabaseAdmin
    .from('billing_events')
    .insert({ mor_event_id: billingKeyEventId(input.subscriptionId), type: 'portone.billing_key', payload: input })
  if (error) throw error
}

export async function findBillingKey(subscriptionId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('billing_events')
    .select('payload')
    .eq('mor_event_id', billingKeyEventId(subscriptionId))
    .maybeSingle()
  if (error) throw error
  const key = (data?.payload as { billingKey?: unknown } | undefined)?.billingKey
  return typeof key === 'string' ? key : null
}

/** 빌링키로 바로 청구한다. 성공하면 true, 카드사 거절 등으로 실패하면 사유와 함께 false. */
export async function chargeBillingKey(input: {
  paymentId: string
  billingKey: string
  orderName: string
  amountKrw: number
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await client().payment.payWithBillingKey({
      paymentId: input.paymentId,
      billingKey: input.billingKey,
      orderName: input.orderName,
      amount: { total: input.amountKrw },
      currency: 'KRW',
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/** 해지 등으로 더는 청구하지 않을 카드는 PortOne 에서 지운다. 실패해도 우리 쪽 청구는 이미 멈췄으니 던지지 않는다. */
export async function deleteBillingKey(billingKey: string): Promise<void> {
  try {
    await client().payment.billingKey.deleteBillingKey({ billingKey })
  } catch (err) {
    console.warn('[portone] billing key delete failed:', err instanceof Error ? err.message : String(err)) // i18n-ok: 서버 로그, 유저 화면 아님
  }
}

// ── 갱신 실패 기록 ──────────────────────────────────────────────────────────────

export async function recordRenewalFailure(input: { paymentId: string; subscriptionId: string; periodEnd: string; message: string }): Promise<void> {
  const { error } = await supabaseAdmin.from('billing_events').insert({
    mor_event_id: `portone_renewfail_${input.paymentId}`,
    type: 'portone.renewal_failed',
    payload: { ...input, at: new Date().toISOString() },
    processed_at: new Date().toISOString(),
  })
  if (error) throw error
}

/** 이 구독의 이번 기간(periodEnd 로 끝나는 기간) 갱신이 몇 번 실패했고 마지막 실패가 언제였는지. */
export async function renewalFailures(subscriptionId: string, periodEnd: string): Promise<{ count: number; lastAt: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('billing_events')
    .select('received_at')
    .eq('type', 'portone.renewal_failed')
    .eq('payload->>subscriptionId', subscriptionId)
    .eq('payload->>periodEnd', periodEnd)
    .order('received_at', { ascending: false })
  if (error) throw error
  return { count: data?.length ?? 0, lastAt: (data?.[0]?.received_at as string | undefined) ?? null }
}

/** 구독을 끝낸다: 상태 canceled, 카드 삭제, 다른 살아 있는 구독이 없으면 무료로. */
export async function endPortOneSubscription(input: { workspaceId: string; subscriptionId: string; plan: string }): Promise<void> {
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('mor_subscription_id', input.subscriptionId)
  if (error) throw error

  const { data: others, error: otherError } = await supabaseAdmin
    .from('subscriptions')
    .select('mor_subscription_id')
    .eq('workspace_id', input.workspaceId)
    .neq('mor_subscription_id', input.subscriptionId)
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES])
    .limit(1)
  if (otherError) throw otherError
  if ((others?.length ?? 0) === 0) {
    // 해지 뒤 새로 산 다른 플랜은 건드리지 않는다: 지금 플랜이 이 구독의 플랜일 때만 무료로 돌린다.
    const { error: planError } = await supabaseAdmin
      .from('workspaces')
      .update({ plan: 'free' })
      .eq('id', input.workspaceId)
      .eq('plan', input.plan)
    if (planError) throw planError
  }

  const billingKey = await findBillingKey(input.subscriptionId)
  if (billingKey) await deleteBillingKey(billingKey)
}

