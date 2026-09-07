// POST /api/billing/paddle/webhook — Paddle 결제 알림 수신 (#payments-phase-3 P1).
//   로직은 src/lib/billing/paddle-webhook.ts(순수, tests/paddle-webhook.test.ts 가 약속을 지킨다)이고 여기는
//   Supabase 로 deps 를 채우는 얇은 껍데기다. 본문은 가공 없이 raw 로 읽어야 서명이 맞는다.
//   5초 안에 2xx 를 돌려줘야 Paddle 이 재전송하지 않는다 — 적립은 insert 한 줄이라 충분하다.
//   샌드박스 목적지: https://tale-git-dev-talestudio.vercel.app/api/billing/paddle/webhook (paddle-todo.md).
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendOpsAlert } from '@/lib/ops-alert'
import { handlePaddleWebhook, type PaddleWebhookDeps } from '@/lib/billing/paddle-webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GRANT_KINDS = ['grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus']

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

const deps: PaddleWebhookDeps = {
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
    return deps.findWorkspace(data.workspace_id as string)
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

export async function POST(req: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret) {
    await sendOpsAlert({ level: 'error', title: 'PADDLE_WEBHOOK_SECRET 이 비어 있다', body: '웹훅을 검증할 수 없어 전부 거절한다.' }) // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 500 })
  }
  const rawBody = await req.text()
  const outcome = await handlePaddleWebhook({
    rawBody,
    signatureHeader: req.headers.get('paddle-signature'),
    secret,
    deps,
  })
  return NextResponse.json(outcome.body, { status: outcome.status })
}
