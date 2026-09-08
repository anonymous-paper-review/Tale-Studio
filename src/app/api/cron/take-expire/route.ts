// GET /api/cron/take-expire — 만료일이 지난 lot 의 남은 양을 "만료" 행으로 정리한다 (#payments-phase-3 P13).
//
//   이 잡은 새는 창을 막는 역할이 **아니다**. 잔액 계산과 생성 게이트가 이미 만료된 lot 을 빼고 세기 때문에
//   (account-summary.takeBreakdown · take_hold RPC) 잡이 늦어도 유저는 만료된 Take 를 못 쓴다.
//   잡의 역할은 둘: ① 내역에 "만료 −N" 을 남긴다 ② 죽은 lot 을 계속 세지 않게 0 으로 만든다.
//   그래서 하루 1회면 충분하다(2026-09-08 오너 결정, ledger-two-holes.html 3판 4절).
//
//   계산은 take_expire_due() RPC 안에서 한 덩어리로 한다 — 세는 동안 다른 요청이 같은 lot 에서 빼가면 숫자가 틀어진다.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendOpsAlert } from '@/lib/ops-alert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[cron/take-expire] CRON_SECRET 미설정 — 프로덕션에서 요청 거부')
      return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 401 })
    }
    console.warn('[cron/take-expire] CRON_SECRET 미설정 — 개발 환경이라 통과시킴')
  } else if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin.rpc('take_expire_due')
  if (error) {
    console.error('[cron/take-expire]', error.message)
    await sendOpsAlert({
      level: 'error',
      title: 'Take 만료 잡 실패', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `take_expire_due: ${error.message}. 만료 행이 안 쌓여 내역이 비어 보인다(잔액은 읽을 때 빼므로 정확하다).`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return NextResponse.json({ ok: false, error: 'expire_failed' }, { status: 500 })
  }
  const result = (data ?? { lots: 0, takes: 0 }) as { lots?: number; takes?: number }
  return NextResponse.json({ ok: true, lots: result.lots ?? 0, takes: result.takes ?? 0 })
}
