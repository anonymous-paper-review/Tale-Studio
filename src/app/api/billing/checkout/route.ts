// POST /api/billing/checkout — 결제창을 열어도 되는지 판정하고 Paddle 거래 번호를 돌려준다 (#payments-phase-3 P7).
//   body { kind: 'plan' | 'pack', id }. 응답 { transactionId } 또는 { error: reason }.
//   판정·거래 생성은 src/lib/billing/checkout.ts(약속: tests/paddle-checkout.test.ts). 여기는 로그인·워크스페이스·저장뿐.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { pickActiveSubscription, type SubscriptionRow } from '@/lib/billing/subscription-state'
import { decidePlanChange } from '@/lib/billing/plan-change'
import { takeBalance } from '@/lib/billing/take-ledger'
import { summarizeSubscription } from '@/lib/billing/account-summary'
import { createPaddleTransaction, decideCheckout, type CheckoutKind } from '@/lib/billing/checkout'
import { sendOpsAlert } from '@/lib/ops-alert'
import { isCheckoutEnabled } from '@/lib/billing/checkout-availability'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!isCheckoutEnabled()) return NextResponse.json({ error: 'payments_not_open' }, { status: 503 })
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as { kind?: unknown; id?: unknown } | null
    const kind = body?.kind === 'plan' || body?.kind === 'pack' ? (body.kind as CheckoutKind) : null
    const id = typeof body?.id === 'string' ? body.id : null
    if (!kind || !id) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

    const { data: workspace, error: wsError } = await supabaseAdmin
      .from('workspaces')
      .select('id, plan')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (wsError) throw wsError
    if (!workspace) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
    const workspaceId = workspace.id as string
    const plan = typeof workspace.plan === 'string' ? workspace.plan : 'free'

    const [{ data: subscriptions }, { data: purchases }, { data: customer }] = await Promise.all([
      supabaseAdmin.from('subscriptions').select('*').eq('workspace_id', workspaceId),
      supabaseAdmin.from('take_ledger').select('id').eq('workspace_id', workspaceId).eq('kind', 'grant_purchase').limit(1),
      supabaseAdmin.from('billing_customers').select('mor_customer_id').eq('workspace_id', workspaceId).maybeSingle(),
    ])

    const subscription = pickActiveSubscription(subscriptions as SubscriptionRow[] | null)

    const decision = decideCheckout({
      kind,
      id,
      workspacePlan: plan,
      packPurchasedBefore: (purchases?.length ?? 0) > 0,
      subscriptionStatus: summarizeSubscription(plan, subscription ?? null).status,
    })
    if (!decision.ok) {
      // 구독 중인데 다른 플랜을 눌렀다 = 플랜 변경이다(P15). 거절만 하지 말고 판정을 실어 보내
      //   화면이 확인창을 띄우게 한다. 금액·갱신일·합산 Take 를 서버가 계산해야 화면과 청구가 안 어긋난다.
      if (decision.reason === 'already_subscribed' && kind === 'plan') {
        const change = decidePlanChange({
          currentPlan: plan,
          targetPlan: id,
          subscriptionId: subscription?.mor_subscription_id ?? null,
          now: new Date(),
        })
        if (change.ok) {
          const balance = await takeBalance(workspaceId).catch(() => null)
          return NextResponse.json(
            {
              error: decision.reason,
              planChange: {
                targetPlan: id,
                direction: change.direction,
                chargeTodayUsd: change.chargeTodayUsd,
                nextBilledAt: change.nextBilledAt,
                takesAdded: change.takesAdded,
                currentBalance: balance,
              },
            },
            { status: 409 },
          )
        }
      }
      return NextResponse.json({ error: decision.reason }, { status: 409 })
    }

    const existingCustomerId = typeof customer?.mor_customer_id === 'string' ? customer.mor_customer_id : null
    const { transactionId, customerId } = await createPaddleTransaction({
      priceId: decision.priceId,
      workspaceId,
      email: user.email,
      existingCustomerId,
    })
    if (customerId !== existingCustomerId) {
      const { error: custError } = await supabaseAdmin
        .from('billing_customers')
        .upsert({ workspace_id: workspaceId, mor_provider: 'paddle', mor_customer_id: customerId }, { onConflict: 'workspace_id' })
      if (custError) throw custError
    }
    return NextResponse.json({ transactionId, label: decision.label })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[billing/checkout]', message)
    await sendOpsAlert({ level: 'error', title: '결제창 열기 실패', body: message }) // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
  }
}
