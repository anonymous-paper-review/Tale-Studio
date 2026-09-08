// POST /api/billing/paddle/webhook — Paddle 결제 알림 수신 (#payments-phase-3 P1).
//   로직은 src/lib/billing/paddle-webhook.ts(순수, tests/billing/paddle-webhook.test.ts 가 약속을 지킨다),
//   Supabase 구현은 src/lib/billing/webhook-deps.ts(재조회 P12 와 공유). 여기는 raw 본문을 읽어 넘기는 껍데기다.
//   본문은 가공 없이 raw 로 읽어야 서명이 맞는다. 5초 안에 2xx 를 돌려줘야 Paddle 이 재전송하지 않는다.
//   샌드박스 목적지: https://tale-git-dev-talestudio.vercel.app/api/billing/paddle/webhook (paddle-todo.md).
import { NextResponse, type NextRequest } from 'next/server'
import { sendOpsAlert } from '@/lib/ops-alert'
import { handlePaddleWebhook } from '@/lib/billing/paddle-webhook'
import { webhookDeps } from '@/lib/billing/webhook-deps'
import { clientIpFrom, fetchPaddleIps, isPaddleIp } from '@/lib/billing/paddle-ips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret) {
    await sendOpsAlert({ level: 'error', title: 'PADDLE_WEBHOOK_SECRET 이 비어 있다', body: '웹훅을 검증할 수 없어 전부 거절한다.' }) // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 500 })
  }
  // Paddle 발신 IP 가 아니면 서명 검증까지 갈 것도 없다. 목록을 못 받아오면 막지 않는다(서명이 최후 방어).
  //   라이브에서만 건다 — 샌드박스는 발신 주소가 다르고, 로컬 테스트가 통째로 막힌다.
  if (process.env.NEXT_PUBLIC_PADDLE_ENV === 'production') {
    const ip = clientIpFrom(req.headers)
    if (!isPaddleIp(ip, await fetchPaddleIps())) {
      console.warn('[paddle/webhook] Paddle 목록에 없는 주소에서 온 요청을 거절했다:', ip) // i18n-ok: 서버 로그, 유저 화면 아님
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
  }

  const rawBody = await req.text()
  const outcome = await handlePaddleWebhook({
    rawBody,
    signatureHeader: req.headers.get('paddle-signature'),
    secret,
    deps: webhookDeps,
  })
  return NextResponse.json(outcome.body, { status: outcome.status })
}
