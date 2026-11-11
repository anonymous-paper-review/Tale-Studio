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
import { runMayBeAlive } from '@/lib/writer/run-alive';

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
      // 아직 도는 호출이 있을 수 있으면(마지막 저장 뒤 330초 안) 찌르지 않는다(2026-11-11 T5, run-alive.ts) — 한 단계 호출은
      //   저장 없이 300초까지 정상으로 돈다. 예전엔 CAS 가 막아 준다고 보고 찔렀는데, 새 호출이 시작 표시로 실행을 가져가
      //   돌던 호출의 결과(이미 산 AI 호출)를 버리게 했고 같은 단계를 두세 번 돌렸다. 화면은 180초부터 묻고, 여기서 판정한다.
      if (runMayBeAlive(run.updated_at)) {
        return NextResponse.json({ ok: true, data: { action: 'running' } });
      }
      // 킥: 330초 넘게 저장이 없다 — 체인이 끊겼으니 step 을 한 번 찔러준다.
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
