// #stage-retry '이어서 재시도' (2026-08-13, 오너 정책: 자동 1회 재시도 소진 후 사람 방아쇠).
//   failed run 을 실패한 스테이지부터 재개한다 — state 가 마지막 체크포인트를 담고 있어
//   처음부터 다시 돌지 않는다. running 인데 체인이 끊긴 run 은 step 만 다시 찔러준다(킥).
//
//   이 라우트가 필요한 이유: /api/writer/step 은 서버-투-서버 전용(x-writer-secret, 8/11
//   fail-closed)이라 브라우저가 직접 못 부른다 — 기존 클라 keepalive 가 프로덕션에서 401 로
//   조용히 죽어 있던 자리. 여기는 유저 세션 인증 + 프로젝트 소유권으로 지키고, 체인 트리거는
//   서버 안에서 secret 을 실어 보낸다.
import { NextRequest, NextResponse, after } from 'next/server';
import { getUser } from '@/lib/supabase/auth';
import { userOwnsProject } from '@/lib/generation-jobs';
import { getActiveRun, resumeFailedRun } from '@/lib/writer/run-store';
import { triggerWriterStep, type WriterRunState } from '@/lib/writer/pipeline/steps';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { projectId } = (await req.json()) as { projectId?: string };
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Invalid request: projectId required' }, { status: 400 });
    }
    if (!(await userOwnsProject(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const run = await getActiveRun(projectId);
    if (!run) return NextResponse.json({ error: 'No run' }, { status: 404 });

    if (run.status === 'running') {
      // 킥: 체인이 끊겼을 수 있으니 step 을 한 번 찔러준다. 이미 도는 인보케이션과 경쟁해도
      //   CAS(saveRunState)가 stale 쪽을 양보시키므로 안전 (#p2-wiring).
      after(async () => {
        await triggerWriterStep(req.nextUrl.origin, projectId);
      });
      return NextResponse.json({ ok: true, data: { action: 'kicked' } });
    }

    if (run.status !== 'failed') {
      // completed / awaiting_confirmation — 재개할 것이 없다.
      return NextResponse.json({ ok: true, data: { action: 'noop', status: run.status } });
    }

    // 실패 스테이지부터 재개: attempt 리셋(자동 재시도 예산도 새로 시작) + resume 기록.
    const state = run.state as WriterRunState;
    state._attempt = undefined;
    state._repairs = [
      ...(state._repairs ?? []),
      {
        stage: run.current_stage ?? 'unknown',
        at: new Date().toISOString(),
        message: `manual resume (이어서 재시도) — 직전 오류: ${(run.error ?? '').slice(0, 160)}`,
      },
    ];
    const resumed = await resumeFailedRun(run.id, state, run.state_version ?? 0);
    if (!resumed) {
      // 경쟁 resume 이 먼저 잡았거나 상태가 이미 바뀜 — 클라는 폴링 재개만 하면 된다.
      return NextResponse.json({ ok: true, data: { action: 'already' } });
    }
    after(async () => {
      await triggerWriterStep(req.nextUrl.origin, projectId);
    });
    return NextResponse.json({ ok: true, data: { action: 'resumed', stage: run.current_stage } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/resume]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
