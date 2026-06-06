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
    // 선택적 보안: CRON_SECRET 설정 시 Authorization: Bearer 검사.
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
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
