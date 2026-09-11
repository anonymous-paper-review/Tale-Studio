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
    // 활성 구독은 워크스페이스당 하나다(subscriptions_one_live_per_workspace, 20260908140000).
    //   새 구독이 오면 그 워크스페이스의 옛 활성 구독을 먼저 끝난 것으로 내린다 — 안 그러면 유일 인덱스가
    //   23505 로 막고 웹훅이 500 을 낸다(Paddle 이 사흘간 재전송한다).
    //   플랜 변경(P15)은 같은 구독 번호를 유지하므로 여기 안 걸리고, 취소 후 재구독처럼 번호가 새로 생길 때만 탄다.
    if (['active', 'trialing', 'past_due'].includes(row.status)) {
      const { error: demoteError } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'superseded', updated_at: new Date().toISOString() })
        .eq('workspace_id', row.workspaceId)
        .neq('mor_subscription_id', row.morSubscriptionId)
        .in('status', ['active', 'trialing', 'past_due'])
      if (demoteError) throw demoteError
    }

    const { error } = await supabaseAdmin.from('subscriptions').upsert(
      {
        workspace_id: row.workspaceId,
        mor_subscription_id: row.morSubscriptionId,
        plan: row.plan,
        status: row.status,
        current_period_end: row.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      // 구독 하나당 한 행이다(20260908140000). workspace_id 로 충돌시키면 새 구독이 옛 구독을 덮어쓴다 —
      //   2026-09-08 에 스모크가 진짜 구독을 지운 그 사고. 활성 하나 제약은 부분 유일 인덱스가 따로 건다.
      { onConflict: 'mor_subscription_id' },
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
      grant_id: input.grantId,
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
