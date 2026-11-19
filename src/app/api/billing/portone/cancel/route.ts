// POST /api/billing/portone/cancel — 국내 카드 구독 해지. 구독 중이면 이번 기간 끝까지 쓰고 다음 청구를 하지 않는다.
//   결제 실패 중이면 바로 끝내고 무료로 돌린다. 판정은 decidePortOneCancel(약속: tests/billing/portone-subscription.test.ts).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { decidePortOneCancel, isPortOneSubscriptionId } from '@/lib/billing/portone'
import { endPortOneSubscription } from '@/lib/billing/portone-renewals'
import { loadPortOneContext } from '@/lib/billing/portone-context'

export const runtime = 'nodejs'

export async function POST() {
  const ctx = await loadPortOneContext()
  if (ctx === 'unauthorized') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (ctx === 'no_workspace') return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const sub = ctx.subscription
  if (!sub || !isPortOneSubscriptionId(sub.mor_subscription_id)) return NextResponse.json({ error: 'no_subscription' }, { status: 409 })

  const decision = decidePortOneCancel(sub.status)
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: 409 })
  try {
    if (decision.status === 'canceled') {
      await endPortOneSubscription({ workspaceId: ctx.workspaceId, subscriptionId: sub.mor_subscription_id as string, plan: sub.plan })
    } else {
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'cancel_scheduled', updated_at: new Date().toISOString() })
        .eq('mor_subscription_id', sub.mor_subscription_id as string)
      if (error) throw error
    }
    return NextResponse.json({ ok: true, status: decision.status, accessEndsAt: decision.status === 'cancel_scheduled' ? sub.current_period_end : null })
  } catch (err) {
    console.error('[billing/portone/cancel]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'cancel_failed' }, { status: 500 })
  }
}
