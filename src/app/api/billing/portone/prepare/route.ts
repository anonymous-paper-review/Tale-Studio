// POST /api/billing/portone/prepare — 국내 카드 결제창(PortOne · KG이니시스)을 열어도 되는지 판정하고 주문을 남긴다.
//   body { kind: 'pack' | 'plan', id }. 응답은 브라우저가 결제창에 그대로 넘길 값(결제 번호·금액·채널 키).
//   금액과 상품은 서버 가격표에서만 나온다. 판정은 src/lib/billing/portone.ts(약속: tests/billing/portone*.test.ts).
import { NextResponse, type NextRequest } from 'next/server'
import { sendOpsAlert } from '@/lib/ops-alert'
import {
  decidePortOnePack,
  decidePortOnePlan,
  isPortOneBillingConfigured,
  isPortOneConfigured,
  newPortOnePaymentId,
  newPortOneSubscriptionId,
  readPortOneBillingChannelKey,
  readPortOnePublicConfig,
} from '@/lib/billing/portone'
import { recordPortOneOrder } from '@/lib/billing/portone-server'
import { loadPortOneContext } from '@/lib/billing/portone-context'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { kind?: unknown; id?: unknown } | null
    const kind = body?.kind === 'pack' || body?.kind === 'plan' ? body.kind : null
    const id = typeof body?.id === 'string' ? body.id : null
    if (!kind || !id) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

    const ctx = await loadPortOneContext()
    if (ctx === 'unauthorized') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (ctx === 'no_workspace') return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

    const config = readPortOnePublicConfig()
    const paymentId = newPortOnePaymentId()

    if (kind === 'pack') {
      const decision = decidePortOnePack({
        packId: id,
        workspacePlan: ctx.plan,
        packPurchasedBefore: ctx.packPurchasedBefore,
        configured: isPortOneConfigured(),
      })
      if (!decision.ok || !config) return NextResponse.json({ error: decision.ok ? 'portone_not_configured' : decision.reason }, { status: 409 })
      await recordPortOneOrder({ kind: 'pack', paymentId, workspaceId: ctx.workspaceId, packId: decision.packId, amountKrw: decision.amountKrw })
      return NextResponse.json({
        kind,
        paymentId,
        storeId: config.storeId,
        channelKey: config.channelKey,
        orderName: decision.orderName,
        amountKrw: decision.amountKrw,
        email: ctx.email,
      })
    }

    const decision = decidePortOnePlan({ planId: id, configured: isPortOneBillingConfigured(), subscriptionStatus: ctx.subscriptionStatus })
    const billingChannelKey = readPortOneBillingChannelKey()
    if (!decision.ok || !config || !billingChannelKey) {
      return NextResponse.json({ error: decision.ok ? 'portone_not_configured' : decision.reason }, { status: 409 })
    }
    const subscriptionId = newPortOneSubscriptionId()
    await recordPortOneOrder({
      kind: 'plan',
      paymentId,
      workspaceId: ctx.workspaceId,
      planId: decision.planId,
      amountKrw: decision.amountKrw,
      subscriptionId,
      periodEnd: null,
    })
    return NextResponse.json({
      kind,
      paymentId,
      storeId: config.storeId,
      channelKey: billingChannelKey,
      orderName: decision.orderName,
      amountKrw: decision.amountKrw,
      email: ctx.email,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[billing/portone/prepare]', message)
    await sendOpsAlert({ level: 'error', title: 'PortOne 결제창 준비 실패', body: message }) // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
  }
}
