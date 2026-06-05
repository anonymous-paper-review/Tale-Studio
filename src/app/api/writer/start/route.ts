// svc-pipeline 시작 (비동기, fire-and-forget)
//   Producer "Complete your story" 버튼에서 호출.
//   S0~L5 (텍스트/프롬프트 단계)까지만 자동. 이미지/영상은 별도 트리거.
import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/lib/writer/pipeline';
import { PipelineLogger } from '@/lib/writer/logger';
import type { PipelineInput } from '@/lib/writer/types/pipeline';

export const runtime = 'nodejs';
// 백그라운드 실행이라 짧게 설정 (시작만 응답). Vercel 외 환경에서는 무의미.
export const maxDuration = 30;

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

    // 이미 실행 중이거나 완료된 프로젝트면 거부
    const logger = new PipelineLogger(projectId);
    await logger.init();
    const existing = await logger.loadStage<unknown>('00_input.json');
    if (existing) {
      return NextResponse.json(
        { error: 'pipeline already started for this project. Use /api/writer/status or /api/writer/resume.', projectId },
        { status: 409 },
      );
    }

    const input: PipelineInput = { story, runtimeSeconds, models };

    // Fire-and-forget. Local/self-hosted 환경 기준 (Vercel serverless 제약 있음).
    runPipeline(input, { projectId, resume: false })
      .then(() => {
        console.log(`[svc/start] ${projectId} completed`);
      })
      .catch((err) => {
        console.error(`[svc/start] ${projectId} failed:`, err);
      });

    return NextResponse.json({ projectId, status: 'started' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[svc/start]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
