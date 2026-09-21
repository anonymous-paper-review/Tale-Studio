// POST /api/billing/change-plan — 구독 중인 유저가 플랜을 올리거나 내린다 (#payments-phase-3 P15).
//
//   결제창을 안 띄운다. 저장된 카드로 서버가 바로 청구한다(구독 변경이라 Paddle 이 그렇게 처리한다).
//   판정은 src/lib/billing/plan-change.ts, 약속은 tests/billing/plan-change.test.ts.
//   Take 적립은 여기서 하지 않는다 — ① 청구가 transaction.completed 웹훅으로 돌아와 기존 코드가 적립한다
//   (2026-09-08 실측: 잔액 260→290). 적립 규칙이 두 벌이 되면 반드시 어긋난다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { paddleRequest } from '@/lib/billing/paddle-api'
import { decidePlanChange } from '@/lib/billing/plan-change'
import { pickActiveSubscription, type SubscriptionRow } from '@/lib/billing/subscription-state'
import { PADDLE_PLANS } from '@/lib/billing/catalog'
import { sendOpsAlert } from '@/lib/ops-alert'
import { isCheckoutEnabled } from '@/lib/billing/checkout-availability'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { plan?: string }
    const targetPlan = typeof body.plan === 'string' ? body.plan : ''

    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('id, plan')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!workspace) return NextResponse.json({ ok: false, error: 'no_workspace' }, { status: 409 })

    const { data: subscriptions } = await supabaseAdmin.from('subscriptions').select('*').eq('workspace_id', workspace.id)
    const subscription = pickActiveSubscription(subscriptions as SubscriptionRow[] | null)

    const decision = decidePlanChange({
      currentPlan: typeof workspace.plan === 'string' ? workspace.plan : 'free',
      targetPlan,
      subscriptionId: subscription?.mor_subscription_id ?? null,
      now: new Date(),
    })
    if (!decision.ok) return NextResponse.json({ ok: false, error: decision.reason }, { status: 409 })
    if (!isCheckoutEnabled() && decision.steps.some((step) => step.prorationBillingMode !== 'do_not_bill')) {
      return NextResponse.json({ ok: false, error: 'payments_not_open' }, { status: 503 })
    }

    // 순서대로 보낸다. Paddle 이 항목 변경과 갱신일 변경을 한 요청에 못 받는다(2026-09-08 실측).
    for (const [index, step] of decision.steps.entries()) {
      const payload: Record<string, unknown> = { proration_billing_mode: step.prorationBillingMode }
      if (step.items) {
        const priceId = PADDLE_PLANS.find((p) => p.id === step.items![0].planId)?.paddlePriceId ?? null
        if (!priceId) return NextResponse.json({ ok: false, error: 'price_not_configured' }, { status: 409 })
        payload.items = [{ price_id: priceId, quantity: 1 }]
      }
      if (step.nextBilledAt) payload.next_billed_at = step.nextBilledAt

      try {
        await paddleRequest('PATCH', `/subscriptions/${decision.subscriptionId}`, payload)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (index === 0) {
          // 첫 요청이 실패했다 = 아무것도 안 바뀌었다. 유저에게 그대로 알리고 끝낸다.
          return NextResponse.json({ ok: false, error: 'change_failed' }, { status: 502 })
        }
        // 청구는 됐는데 갱신일 리셋이 실패했다. 유저는 돈을 냈고 플랜도 바뀌었으니 성공으로 답하되,
        //   갱신일이 옛 날짜로 남아 다음 청구가 빨리 온다 — 관리자가 손으로 맞춰야 한다.
        await sendOpsAlert({
          level: 'error',
          title: '플랜 변경: 청구는 됐는데 갱신일 리셋이 실패했다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
          body: `workspace ${workspace.id}, subscription ${decision.subscriptionId}, ${workspace.plan} → ${targetPlan}. Paddle 대시보드에서 next_billed_at 을 ${decision.nextBilledAt} 로 직접 맞춰야 한다. 안 맞추면 옛 갱신일에 또 청구된다. 원인: ${message}`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
        })
        break
      }
    }

    return NextResponse.json({
      ok: true,
      direction: decision.direction,
      plan: targetPlan,
      chargedUsd: decision.chargeTodayUsd,
      nextBilledAt: decision.nextBilledAt,
      takesAdded: decision.takesAdded,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[billing/change-plan]', message) // i18n-ok: 서버 로그, 유저 화면 아님
    return NextResponse.json({ ok: false, error: 'change_failed' }, { status: 500 })
  }
}
