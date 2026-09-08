// POST /api/billing/reconcile-me — 그 유저의 최근 결제만 Paddle 에 물어 장부에 없는 것을 그 자리에서 처리한다
//   (#payments-phase-3 P12 즉시 재조회).
//
//   언제 불리나: 결제 직후 폴링(90초)이 빈손으로 끝나는 그 자리. Paddle 재시도와 폴링이 둘 다 실패한 경우다.
//   왜 안전한가: 로그인한 그 유저의 워크스페이스에 묶인 Paddle 고객의 결제만 본다. 남의 결제는 조회 자체가 안 된다.
//   이중 적립: hasGrant 조회로 먼저 거르고, 그래도 겹치면 DB 유일 제약(P14)이 막는다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { paddleRequest } from '@/lib/billing/paddle-api'
import { processPaddleTransaction } from '@/lib/billing/paddle-webhook'
import { webhookDeps } from '@/lib/billing/webhook-deps'
import { toTxnSummary } from '@/lib/billing/reconcile'
import { sendOpsAlert } from '@/lib/ops-alert'

export const runtime = 'nodejs'

const GRANT_KINDS = ['grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus']

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('id, plan')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!workspace) return NextResponse.json({ ok: true, recovered: 0 })

    const { data: customer } = await supabaseAdmin
      .from('billing_customers')
      .select('mor_customer_id')
      .eq('workspace_id', workspace.id)
      .maybeSingle()
    const customerId = typeof customer?.mor_customer_id === 'string' ? customer.mor_customer_id : null
    // 결제한 적이 없으면 Paddle 에 고객이 없다 — 조회할 것이 없다.
    if (!customerId) return NextResponse.json({ ok: true, recovered: 0 })

    const raw = await paddleRequest<Record<string, unknown>[]>(
      'GET',
      `/transactions?customer_id=${encodeURIComponent(customerId)}&status=completed&per_page=20&order_by=billed_at[DESC]`,
    )
    const transactions = (raw ?? []).map((t) => ({ raw: t, summary: toTxnSummary(t) })).filter((t) => t.summary.id)
    if (transactions.length === 0) return NextResponse.json({ ok: true, recovered: 0 })

    const { data: granted } = await supabaseAdmin
      .from('take_ledger')
      .select('ref_id')
      .eq('ref_kind', 'paddle_transaction')
      .in('kind', GRANT_KINDS)
    const grantedIds = new Set((granted ?? []).map((r) => r.ref_id as string))

    let recovered = 0
    for (const t of transactions) {
      if (grantedIds.has(t.summary.id)) continue
      await processPaddleTransaction(t.raw, webhookDeps, t.summary.billedAt ?? undefined)
      recovered += 1
    }
    if (recovered > 0) {
      await sendOpsAlert({
        level: 'warn',
        title: '즉시 재조회로 결제를 복구했다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
        body: `workspace ${workspace.id}: ${recovered}건. 웹훅이 유실됐다는 뜻이다 — 왜 유실됐는지 Paddle 알림 로그 확인.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      })
    }
    return NextResponse.json({ ok: true, recovered })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[billing/reconcile-me]', message)
    return NextResponse.json({ ok: false, error: 'reconcile_failed' }, { status: 500 })
  }
}
