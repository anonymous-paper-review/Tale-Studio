// POST /api/billing/portal — 로그인 유저 워크스페이스의 Paddle 고객 포털 주소를 만든다 (#payments-phase-3 P9).
//   응답 { overviewUrl, cancelUrl, updatePaymentMethodUrl }. 고객이 없으면 409.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { pickActiveSubscription, type SubscriptionRow } from '@/lib/billing/subscription-state'
import { createPortalSession } from '@/lib/billing/portal'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { data: workspace, error: wsError } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (wsError) throw wsError
    if (!workspace) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

    const [{ data: customer }, { data: subscriptions }] = await Promise.all([
      supabaseAdmin.from('billing_customers').select('mor_customer_id').eq('workspace_id', workspace.id).maybeSingle(),
      supabaseAdmin.from('subscriptions').select('*').eq('workspace_id', workspace.id),
    ])
    const customerId = typeof customer?.mor_customer_id === 'string' ? customer.mor_customer_id : null
    if (!customerId) return NextResponse.json({ error: 'no_customer' }, { status: 409 })
    // 이력에서 지금 유효한 구독 하나를 고른다(구독 하나당 한 행, 20260908140000).
    const subscription = pickActiveSubscription(subscriptions as SubscriptionRow[] | null)
    const subscriptionId = typeof subscription?.mor_subscription_id === 'string' ? subscription.mor_subscription_id : null

    const links = await createPortalSession({ customerId, subscriptionId })
    return NextResponse.json(links)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[billing/portal]', message)
    return NextResponse.json({ error: 'portal_failed' }, { status: 500 })
  }
}
