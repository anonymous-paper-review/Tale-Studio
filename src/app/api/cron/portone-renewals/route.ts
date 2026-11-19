// GET /api/cron/portone-renewals — 매시간 국내 카드 구독을 점검한다: 기간이 끝난 구독은 다음 달을 청구하고,
//   해지 예약이나 세 번 실패한 구독은 끝내고 무료로 돌린다. 실행부 src/lib/billing/portone-renewals.ts.
import { NextResponse } from 'next/server'
import { sendOpsAlert } from '@/lib/ops-alert'
import { runPortOneRenewals } from '@/lib/billing/portone-renewals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[cron/portone-renewals] CRON_SECRET 미설정 — 프로덕션에서 요청 거부') // i18n-ok: 서버 로그, 유저 화면 아님
      return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 401 })
    }
  } else if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.PORTONE_API_SECRET) return NextResponse.json({ ok: true, skipped: 'portone_not_configured' })
  try {
    return NextResponse.json({ ok: true, ...(await runPortOneRenewals()) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await sendOpsAlert({ level: 'error', title: 'PortOne 구독 갱신 잡 실패', body: message }) // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    return NextResponse.json({ ok: false, error: 'renewal_failed' }, { status: 500 })
  }
}
