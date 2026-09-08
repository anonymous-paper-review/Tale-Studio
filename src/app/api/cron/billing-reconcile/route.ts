// GET /api/cron/billing-reconcile — 어제 완료된 Paddle 결제와 우리 장부를 대조한다 (#payments-phase-3 P12 일일 대사).
//
//   유저가 창을 닫았거나 구독 갱신처럼 아무도 안 보는 결제는 즉시 재조회가 못 잡는다. 그걸 다음 날 아침에 잡는다.
//   **자동 적립은 하지 않는다** — 즉시 재조회는 방금 결제한 한 건만 보니 안전하지만, 대사는 남의 결제까지 훑는다.
//   잘못 만들면 없는 결제로 Take 를 준다. 경보까지만이고 복구는 관리자가 Paddle 재전송이나 수동 적립으로.
//   전부 맞으면 조용하다 — 매일 "OK" 가 오면 진짜 경보를 안 읽게 된다(오너 09-08: 주간 요약도 안 보낸다).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { paddleRequest } from '@/lib/billing/paddle-api'
import { diffLedgerAgainstPaddle, toTxnSummary, yesterdayStart } from '@/lib/billing/reconcile'
import { sendOpsAlert } from '@/lib/ops-alert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GRANT_KINDS = ['grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus']

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[cron/billing-reconcile] CRON_SECRET 미설정 — 프로덕션에서 요청 거부') // i18n-ok: 서버 로그·운영 경보, 유저 화면 아님
      return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 401 })
    }
    console.warn('[cron/billing-reconcile] CRON_SECRET 미설정 — 개발 환경이라 통과시킴') // i18n-ok: 서버 로그·운영 경보, 유저 화면 아님
  } else if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const since = yesterdayStart()
    const raw = await paddleRequest<Record<string, unknown>[]>(
      'GET',
      `/transactions?status=completed&billed_at[GTE]=${encodeURIComponent(since)}&per_page=200`,
    )
    const paddleTransactions = (raw ?? []).map(toTxnSummary).filter((t) => t.id)

    const { data: granted, error } = await supabaseAdmin
      .from('take_ledger')
      .select('ref_id')
      .eq('ref_kind', 'paddle_transaction')
      .in('kind', GRANT_KINDS)
    if (error) throw error
    const grantedTransactionIds = (granted ?? []).map((r) => r.ref_id as string).filter(Boolean)

    const diff = diffLedgerAgainstPaddle({ paddleTransactions, grantedTransactionIds })

    if (diff.missing.length > 0) {
      await sendOpsAlert({
        level: 'error',
        title: `결제가 장부에 없다 — ${diff.missing.length}건`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
        body: diff.missing // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
          .map((t) => `${t.id} (고객 ${t.customerId ?? '?'}, ${t.total ?? '?'} 최소단위, ${t.billedAt ?? '?'})`) // i18n-ok: 서버 로그·운영 경보, 유저 화면 아님
          .join('\n')
          .concat('\n→ Paddle 대시보드에서 알림 재전송하거나 관리자 적립. 자동 적립은 하지 않는다.'), // i18n-ok: 서버 로그·운영 경보, 유저 화면 아님
      })
    }
    if (diff.extra.length > 0) {
      await sendOpsAlert({
        level: 'error',
        title: `장부에 있는데 Paddle 에 없는 결제 — ${diff.extra.length}건`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
        body: `${diff.extra.join(', ')}\n→ 있을 수 없는 일이다. 위조나 버그 신호.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      })
    }
    return NextResponse.json({ ok: true, missing: diff.missing.length, extra: diff.extra.length, matched: diff.matched })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/billing-reconcile]', message)
    await sendOpsAlert({
      level: 'error',
      title: '일일 대사 실패', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `${message}. 대사가 안 돌면 알림 유실을 못 잡는 상태로 돌아간다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return NextResponse.json({ ok: false, error: 'reconcile_failed' }, { status: 500 })
  }
}
