// POST /api/billing/portone/complete — 결제창이 끝난 뒤 브라우저가 부른다. body { paymentId }.
//   브라우저의 "끝났다"는 믿지 않는다: processPortOnePayment 가 PortOne 에 결제를 다시 물어 확인한다.
//   결제 알림(webhook)이 같은 함수를 부르므로 어느 쪽이 먼저 와도 Take 는 한 번만 들어간다.
import { NextResponse, type NextRequest } from 'next/server'
import { processPortOnePayment } from '@/lib/billing/portone'
import { portoneDeps } from '@/lib/billing/portone-server'
import { loadPortOneContext } from '@/lib/billing/portone-context'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { paymentId?: unknown } | null
  const paymentId = typeof body?.paymentId === 'string' ? body.paymentId : null
  if (!paymentId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const ctx = await loadPortOneContext()
  if (ctx === 'unauthorized') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (ctx === 'no_workspace') return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  // 남의 결제 번호로 확인을 부르는 것은 막는다(적립은 어차피 주문의 워크스페이스로 가지만, 결과를 알려 줄 이유가 없다).
  const order = await portoneDeps.findOrder(paymentId)
  if (!order || order.workspaceId !== ctx.workspaceId) return NextResponse.json({ error: 'unknown_order' }, { status: 404 })
  if (order.kind !== 'pack') return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  try {
    const result = await processPortOnePayment(paymentId, portoneDeps)
    const ok = result === 'pack_granted' || result === 'already_granted' || result === 'duplicate'
    return NextResponse.json({ ok, result }, { status: ok ? 200 : 409 })
  } catch (err) {
    console.error('[billing/portone/complete]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'confirm_failed' }, { status: 500 })
  }
}
