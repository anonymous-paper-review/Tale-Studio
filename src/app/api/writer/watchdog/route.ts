// writer-pipeline 워치독 (Vercel Cron).
//   status='running' 이면서 updated_at 이 오래된(>90s) run 을 찾아 /api/writer/step 을 다시 트리거한다.
//   서버리스 체인이 (인스턴스 kill / 트리거 유실로) 멈춘 경우를 복구한다.
//   ⚠️ Hobby cron 주기는 제약이 크다(분 단위) → 실시간 복구는 클라이언트 keepalive 가 담당.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { triggerWriterStep } from '@/lib/writer/pipeline/steps';

export const runtime = 'nodejs';

// 이 시간보다 오래 갱신 없는 running run = 멈춘 것으로 간주.
//   fan-out 단계가 100s+ 걸릴 수 있어 진행 중 단계를 오판하지 않도록 넉넉히 잡는다.
//   (근본 해결은 fan-out per-item 체크포인트 = Phase 2.)
const STALE_MS = 180_000;

export async function GET(req: NextRequest) {
  try {
    // Vercel Cron 전용. CRON_SECRET 이 설정돼 있으면 Vercel 이 Authorization: Bearer 로 실어준다.
    //   ⚠️ 2026-08-11 감사: 예전엔 `if (cronSecret && …)` 라 env 미설정 시 가드가 통째로
    //   건너뛰어졌다 — 실제로 미설정이라 누구나 파이프라인 재개를 트리거할 수 있었다. fail-closed 로 전환.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[writer/watchdog] CRON_SECRET 미설정 — 프로덕션에서 요청 거부');
        return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
      }
      console.warn('[writer/watchdog] CRON_SECRET 미설정 — 개발 환경이라 통과시킴');
    } else if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from('writer_runs')
      .select('project_id')
      .eq('status', 'running')
      .lt('updated_at', cutoff);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const projectIds = Array.from(
      new Set((data ?? []).map((r) => r.project_id as string)),
    );

    await Promise.all(projectIds.map((pid) => triggerWriterStep(req.nextUrl.origin, pid)));

    return NextResponse.json({ resumed: projectIds });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/watchdog]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
