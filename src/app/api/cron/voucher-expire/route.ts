// GET /api/cron/voucher-expire — 끝나는 시각이 지난 바우처 요금제를 무료로 돌린다 (2026-11-12 오너).
//
//   바우처 요금제는 코드를 쓴 때로부터 30일 뒤(코드로 받은 Take 가 사라지는 시각과 같다) 끝난다.
//   판정과 변경은 voucher_plan_expire_due() 한 곳이 한다 — 구독을 시작한 계정 · 요금제가 바뀐 계정 ·
//   아직 끝나지 않은 다른 코드 요금제가 있는 계정은 그대로 둔다. 하루 한 번이라 끝난 뒤 최대 하루 늦게 무료가 된다.
//   약속: tests/billing/voucher.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendOpsAlert } from '@/lib/ops-alert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[cron/voucher-expire] CRON_SECRET 미설정 — 프로덕션에서 요청 거부') // i18n-ok: 서버 로그·운영 경보, 유저 화면 아님
      return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 401 })
    }
    console.warn('[cron/voucher-expire] CRON_SECRET 미설정 — 개발 환경이라 통과시킴') // i18n-ok: 서버 로그·운영 경보, 유저 화면 아님
  } else if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin.rpc('voucher_plan_expire_due')
  if (error) {
    console.error('[cron/voucher-expire]', error.message)
    await sendOpsAlert({
      level: 'error',
      title: '바우처 요금제 정리 잡 실패', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `voucher_plan_expire_due: ${error.message}. 한 달이 지난 바우처 요금제가 무료로 돌아가지 않고 남는다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return NextResponse.json({ ok: false, error: 'expire_failed' }, { status: 500 })
  }
  const result = (data ?? { reverted: 0, kept: 0 }) as { reverted?: number; kept?: number }
  return NextResponse.json({ ok: true, reverted: result.reverted ?? 0, kept: result.kept ?? 0 })
}
