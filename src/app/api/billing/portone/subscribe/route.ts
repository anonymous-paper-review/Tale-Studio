// POST /api/billing/portone/subscribe — 카드 등록(빌링키 발급) 뒤 첫 달을 청구하고 구독을 시작한다.
//   body { paymentId, billingKey }. paymentId 는 prepare 가 만든 구독 주문이다.
//   빌링키가 우리 상점에서 발급된 살아 있는 키인지 PortOne 에 확인한 뒤에만 청구한다.
//   다음 달부터는 매시간 점검(/api/cron/portone-renewals)이 같은 카드로 청구한다.
import { NextResponse, type NextRequest } from 'next/server'
import { sendOpsAlert } from '@/lib/ops-alert'
import { processPortOnePayment } from '@/lib/billing/portone'
import { chargeBillingKey, isIssuedBillingKey, portoneDeps, saveBillingKey } from '@/lib/billing/portone-server'
import { loadPortOneContext } from '@/lib/billing/portone-context'
import { portonePlanOrderName } from '@/lib/billing/portone-renewals'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { paymentId?: unknown; billingKey?: unknown } | null
  const paymentId = typeof body?.paymentId === 'string' ? body.paymentId : null
  const billingKey = typeof body?.billingKey === 'string' ? body.billingKey : null
  if (!paymentId || !billingKey) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const ctx = await loadPortOneContext()
  if (ctx === 'unauthorized') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (ctx === 'no_workspace') return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const order = await portoneDeps.findOrder(paymentId)
  if (!order || order.kind !== 'plan' || order.workspaceId !== ctx.workspaceId) {
    return NextResponse.json({ error: 'unknown_order' }, { status: 404 })
  }
  // 카드 등록 창을 연 사이에 다른 구독이 시작됐을 수 있다.
  if (['active', 'past_due'].includes(ctx.subscriptionStatus)) return NextResponse.json({ error: 'already_subscribed' }, { status: 409 })

  try {
    if (!(await isIssuedBillingKey(billingKey))) return NextResponse.json({ error: 'invalid_billing_key' }, { status: 400 })
    await saveBillingKey({ subscriptionId: order.subscriptionId, workspaceId: ctx.workspaceId, billingKey }).catch((err: { code?: string }) => {
      if (err?.code !== '23505') throw err // 같은 주문을 다시 보낸 경우(새로고침): 이미 저장돼 있다.
    })
    const charged = await chargeBillingKey({ paymentId, billingKey, orderName: portonePlanOrderName(order.planId), amountKrw: order.amountKrw })
    if (!charged.ok) return NextResponse.json({ error: 'payment_failed', message: charged.message }, { status: 402 })
    const result = await processPortOnePayment(paymentId, portoneDeps)
    const ok = result === 'plan_granted' || result === 'already_granted' || result === 'duplicate'
    return NextResponse.json({ ok, result }, { status: ok ? 200 : 409 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[billing/portone/subscribe]', message)
    await sendOpsAlert({ level: 'error', title: 'PortOne 구독 시작 실패', body: `payment ${paymentId}: ${message}` }) // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    return NextResponse.json({ error: 'subscribe_failed' }, { status: 500 })
  }
}
