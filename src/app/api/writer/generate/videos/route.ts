// L7: TI2V 영상 생성 (fal.ai Seedance)
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/svc/logger';
import { runL7Videos } from '@/lib/svc/pipeline/stages/l7_videos';
import type { FinalPromptsOutput, L6ImagesOutput } from '@/lib/svc/types/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 1800;  // 30분. 점진적 저장으로 도중 끊겨도 부분 결과 보존.

export async function POST(req: NextRequest) {
  try {
    const { projectId, model, concurrency, force } = (await req.json()) as {
      projectId?: string;
      model?: string;
      concurrency?: number;
      force?: boolean;
    };
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const logger = new PipelineLogger(projectId);
    await logger.init();

    const finalPrompts = await logger.loadStage<FinalPromptsOutput>('14_final_prompts.json');
    if (!finalPrompts) {
      return NextResponse.json({ error: '14_final_prompts.json 없음' }, { status: 400 });
    }
    const images = await logger.loadStage<L6ImagesOutput>('15_L6_images.json');
    if (!images) {
      return NextResponse.json(
        { error: '15_L6_images.json 없음. 이미지 생성 먼저 실행.' },
        { status: 400 },
      );
    }

    const result = await runL7Videos(finalPrompts, images, logger, { model, concurrency, force });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[svc/generate/videos]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
