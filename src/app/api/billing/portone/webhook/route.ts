// POST /api/billing/portone/webhook — PortOne 결제 알림(V2 웹훅). 서명 검증과 처리는 handlePortOneWebhook(순수).
//   본문은 가공 없이 raw 로 읽어야 서명이 맞는다. 목적지(PortOne 콘솔에 등록):
//   개발 사이트 https://tale-git-dev-talestudio.vercel.app/api/billing/portone/webhook · 실제 사이트 https://talestudio.art/api/billing/portone/webhook
import { NextResponse, type NextRequest } from 'next/server'
import { sendOpsAlert } from '@/lib/ops-alert'
import { handlePortOneWebhook } from '@/lib/billing/portone'
import { portoneDeps } from '@/lib/billing/portone-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.PORTONE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    await sendOpsAlert({ level: 'error', title: 'PORTONE_WEBHOOK_SECRET 이 비어 있다', body: '결제 알림을 검증할 수 없어 전부 거절한다.' }) // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 500 })
  }
  const rawBody = await req.text()
  const outcome = await handlePortOneWebhook({
    rawBody,
    headers: {
      'webhook-id': req.headers.get('webhook-id'),
      'webhook-timestamp': req.headers.get('webhook-timestamp'),
      'webhook-signature': req.headers.get('webhook-signature'),
    },
    secret,
    deps: portoneDeps,
  })
  return NextResponse.json(outcome.body, { status: outcome.status })
}
