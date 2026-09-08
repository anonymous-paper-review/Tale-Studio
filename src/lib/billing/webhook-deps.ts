// Paddle 웹훅·재조회가 공유하는 Supabase 구현 (#payments-phase-3 P1·P12).
//   순수 로직(paddle-webhook.ts)이 요구하는 deps 를 실제 DB 로 채운다. 웹훅 라우트와 재조회 라우트가
//   같은 구현을 써야 적립 규칙이 한 벌로 유지된다 — 두 벌이 되면 반드시 어긋난다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendOpsAlert } from '@/lib/ops-alert'
import type { PaddleWebhookDeps } from '@/lib/billing/paddle-webhook'

const GRANT_KINDS = ['grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus']

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

export const webhookDeps: PaddleWebhookDeps = {
  now: () => new Date(),

  async recordEvent({ id, type, payload }) {
    const { error } = await supabaseAdmin.from('billing_events').insert({ mor_event_id: id, type, payload })
    if (!error) return 'new'
    if (!isUniqueViolation(error)) throw error
    const { data, error: readError } = await supabaseAdmin
      .from('billing_events')
      .select('processed_at')
      .eq('mor_event_id', id)
      .maybeSingle()
    if (readError) throw readError
    return data?.processed_at ? 'duplicate_processed' : 'duplicate_unprocessed'
  },

  async markProcessed(eventId) {
    const { error } = await supabaseAdmin
      .from('billing_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('mor_event_id', eventId)
    if (error) throw error
  },

  async findWorkspace(workspaceId) {
    const { data, error } = await supabaseAdmin.from('workspaces').select('id, plan').eq('id', workspaceId).maybeSingle()
    if (error) throw error
    return data ? { id: data.id as string, plan: typeof data.plan === 'string' ? data.plan : 'free' } : null
  },

  async findWorkspaceBySubscription(morSubscriptionId) {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('workspace_id')
      .eq('mor_subscription_id', morSubscriptionId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return webhookDeps.findWorkspace(data.workspace_id as string)
  },

  async setPlan(workspaceId, plan) {
    const { error } = await supabaseAdmin.from('workspaces').update({ plan }).eq('id', workspaceId)
    if (error) throw error
  },

  async upsertSubscription(row) {
    const { error } = await supabaseAdmin.from('subscriptions').upsert(
      {
        workspace_id: row.workspaceId,
        mor_subscription_id: row.morSubscriptionId,
        plan: row.plan,
        status: row.status,
        current_period_end: row.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' },
    )
    if (error) throw error
  },

  async hasGrant(refKind, refId) {
    const { data, error } = await supabaseAdmin
      .from('take_ledger')
      .select('id')
      .eq('ref_kind', refKind)
      .eq('ref_id', refId)
      .in('kind', GRANT_KINDS)
      .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
  },

  async grant(input) {
    const { error } = await supabaseAdmin.from('take_ledger').insert({
      workspace_id: input.workspaceId,
      delta: input.amount,
      kind: input.kind,
      expires_at: input.expiresAt,
      ref_kind: input.refKind,
      ref_id: input.refId,
      reason: input.reason,
    })
    if (error) throw error
  },

  async hasPackPurchase(workspaceId) {
    const { data, error } = await supabaseAdmin
      .from('take_ledger')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'grant_purchase')
      .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
  },

  async findGrantsForTransaction(transactionId) {
    const { data, error } = await supabaseAdmin
      .from('take_ledger')
      .select('id, workspace_id, kind, delta')
      .eq('ref_kind', 'paddle_transaction')
      .eq('ref_id', transactionId)
      .in('kind', GRANT_KINDS)
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      kind: r.kind as string,
      delta: r.delta as number,
    }))
  },

  async findTransactionTotal(transactionId) {
    const { data, error } = await supabaseAdmin
      .from('billing_events')
      .select('payload')
      .eq('type', 'transaction.completed')
      .eq('payload->data->>id', transactionId)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    const payload = data?.payload as { data?: { details?: { totals?: { total?: string } } } } | undefined
    const total = payload?.data?.details?.totals?.total
    const n = total ? Number.parseInt(total, 10) : NaN
    return Number.isFinite(n) ? n : null
  },

  async hasRevoke(adjustmentId) {
    const { data, error } = await supabaseAdmin
      .from('take_ledger')
      .select('id')
      .eq('kind', 'refund_revoke')
      .eq('ref_id', adjustmentId)
      .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
  },

  async revokedTotalForTransaction(transactionId) {
    // 회수 행의 reason 에 원 결제 id 를 남긴다(`paddle refund of txn_… (50%)`) — 그걸로 합산한다.
    const { data, error } = await supabaseAdmin
      .from('take_ledger')
      .select('delta')
      .eq('kind', 'refund_revoke')
      .like('reason', `% of ${transactionId} %`)
    if (error) throw error
    return (data ?? []).reduce((sum, r) => sum - (r.delta as number), 0)
  },

  async revoke(input) {
    const { error } = await supabaseAdmin.from('take_ledger').insert({
      workspace_id: input.workspaceId,
      delta: -input.amount,
      kind: 'refund_revoke',
      ref_kind: 'paddle_adjustment',
      ref_id: input.refId,
      reason: input.reason,
    })
    if (error) throw error
  },

  alert: sendOpsAlert,
}
