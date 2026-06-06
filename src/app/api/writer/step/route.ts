// writer-pipeline 단계 실행 (자가 체이닝 웹훅).
//   한 호출 = 시간 예산(deadlineMs) 내에서 한 개 이상 stage 실행 → state 체크포인트.
//   남은 단계가 있으면(paused) after()로 다음 step 을 self-trigger 한다.
//   각 step 은 별도 서버리스 인스턴스 → maxDuration 300(Hobby 한도)을 단계별로 소진.
import { NextRequest, NextResponse, after } from 'next/server';
import { runWriterSteps, triggerWriterStep } from '@/lib/writer/pipeline/steps';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 300s 한도 안에서 마진을 두고 끊는다 (체크포인트 + 다음 트리거 여유).
const STEP_BUDGET_MS = 240_000;

export async function POST(req: NextRequest) {
  try {
    // 선택적 보안: WRITER_STEP_SECRET 설정 시 x-writer-secret 헤더 일치 요구.
    const secret = process.env.WRITER_STEP_SECRET;
    if (secret && req.headers.get('x-writer-secret') !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { projectId } = (await req.json()) as { projectId?: string };
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const deadlineMs = Date.now() + STEP_BUDGET_MS;
    const result = await runWriterSteps(projectId, { deadlineMs });

    // 남은 단계 있으면 다음 step self-trigger.
    if (result.paused) {
      after(async () => {
        await triggerWriterStep(req.nextUrl.origin, projectId);
      });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/step]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
