// writer-pipeline 시작 (서버리스 웹훅 체이닝).
//   Producer "Complete your story" 버튼에서 호출.
//   writer_runs 행을 만들고 첫 step(/api/writer/step)을 after()로 트리거한다.
//   이후 각 step 이 한 stage 실행 → state 체크포인트 → 다음 step self-trigger (자가 체이닝).
//   genre~renderPrompts (텍스트/프롬프트 단계)까지만 자동. 이미지/영상은 별도 트리거.
import { NextRequest, NextResponse, after } from 'next/server';
import { createRun, getActiveRun } from '@/lib/writer/run-store';
import { WRITER_TOTAL_UNITS, triggerWriterStep } from '@/lib/writer/pipeline/steps';
import type { PipelineInput } from '@/lib/writer/types/pipeline';

export const runtime = 'nodejs';
// 시작만 응답하고 첫 step 은 after()로 트리거. 짧게.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId: string;
      story: string;
      runtimeSeconds?: number;
      models?: PipelineInput['models'];
    };
    const { projectId, story, runtimeSeconds, models } = body;

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }
    if (!story || typeof story !== 'string') {
      return NextResponse.json({ error: 'story required' }, { status: 400 });
    }

    // 이미 실행 중이면 거부 (중복 시작 방지).
    const existing = await getActiveRun(projectId);
    if (existing && existing.status === 'running') {
      return NextResponse.json({ error: 'already running', projectId }, { status: 409 });
    }

    const input: PipelineInput = { story, runtimeSeconds, models };
    const run = await createRun(projectId, input, WRITER_TOTAL_UNITS);

    // 첫 step 트리거 (응답 후 별도 서버리스 인스턴스에서 실행).
    after(async () => {
      await triggerWriterStep(req.nextUrl.origin, projectId);
    });

    return NextResponse.json({ projectId, runId: run.id, status: 'started' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/start]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
