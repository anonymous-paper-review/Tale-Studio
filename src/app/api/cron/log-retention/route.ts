// GET /api/cron/log-retention — 90일이 지난 접근·오류 로그 행을 매일 지운다.
//
//   개인정보 처리방침 §1 은 두 줄로 보관 기간을 약속한다: "Usage & system logs … Access logs about
//   3 months" 와 "Image/video prompt screening records … Access and error logs are generally kept for
//   about 3 months". 지우는 코드가 없으면 그 문장이 거짓이다 — 우리 DB 로그는 영구 보관이었다.
//
//   무엇을 지우나: 진단 목적의 로그 표만. 결과물·장부·사용자가 쓴 글은 로그가 아니라 보관 약속이 다르다
//   (Take·결제 장부는 법정 보관 5년, generation_jobs 는 결과물과 연결, feedback 은 사용자가 보낸 글).
//   표를 추가할 땐 "이 행이 사라져도 사용자의 결과물·증빙이 그대로인가"를 먼저 본다.
//
//   한 표가 막혀도 나머지는 지운다 — 전부 멈추면 보관 기간이 조용히 무한이 된다. 실패는 경보로 올리고
//   다음 날 다시 시도한다(기준이 '지난 90일'이라 하루 밀려도 자동으로 따라잡는다).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendOpsAlert } from '@/lib/ops-alert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 개인정보 처리방침 §1 "about 3 months" 의 코드 쪽 진실. */
export const LOG_RETENTION_DAYS = 90

/**
 * 기간이 지나면 지우는 로그 표.
 *
 *   server_errors               — 서버 예외(경로·메서드·메시지·스택). instrumentation.ts onRequestError.
 *   writer_observability_events — 생성 수명주기 관측 이벤트(쿼터·예산 거절, 단계 시작·실패, Creem 검사 판정).
 *   chat_traces                 — 채팅 요청 1건의 영수증(토큰 수·소요·상태). 프롬프트 원문은 담지 않는다.
 *
 * generation_jobs.chat_trace_id 는 on delete set null 이라 오래된 영수증을 지워도 작업 행은 남는다.
 */
export const LOG_RETENTION_TABLES = [
  'server_errors',
  'writer_observability_events',
  'chat_traces',
] as const

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[cron/log-retention] CRON_SECRET 미설정 — 프로덕션에서 요청 거부') // i18n-ok: 서버 로그·운영 경보, 유저 화면 아님
      return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 401 })
    }
    console.warn('[cron/log-retention] CRON_SECRET 미설정 — 개발 환경이라 통과시킴') // i18n-ok: 서버 로그·운영 경보, 유저 화면 아님
  } else if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const deleted: Record<string, number> = {}
  const failures: string[] = []

  for (const table of LOG_RETENTION_TABLES) {
    const { count, error } = await supabaseAdmin
      .from(table)
      .delete({ count: 'exact' })
      .lt('created_at', cutoff)
    if (error) {
      console.error('[cron/log-retention]', table, error.message)
      failures.push(`${table}: ${error.message}`)
      deleted[table] = 0
      continue
    }
    deleted[table] = count ?? 0
  }

  if (failures.length > 0) {
    await sendOpsAlert({
      level: 'error',
      title: `로그 정리 실패 — ${failures.length}개 표`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      body: `${failures.join('\n')}\n→ 그 표는 ${LOG_RETENTION_DAYS}일이 지난 행이 남아 있다(개인정보 처리방침 §1 보관 기간과 어긋남).`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
    })
    return NextResponse.json({ ok: false, error: 'retention_failed', cutoff, deleted }, { status: 500 })
  }

  return NextResponse.json({ ok: true, cutoff, deleted })
}
