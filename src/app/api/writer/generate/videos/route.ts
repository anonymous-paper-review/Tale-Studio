// V7: TI2V 영상 생성 (fal.ai Seedance)
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/writer/logger';
import { runShotVideos } from '@/lib/writer/pipeline/stages/v7_videos';
import type { RenderPromptsOutput, ShotImagesOutput } from '@/lib/writer/types/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;  // Vercel Hobby 한도. 점진적 저장으로 도중 끊겨도 부분 결과 보존, resume으로 이어받기.

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

    const finalPrompts = await logger.loadStage<RenderPromptsOutput>('14_renderPrompts.json');
    if (!finalPrompts) {
      return NextResponse.json({ error: '14_renderPrompts.json 없음' }, { status: 400 });
    }
    const images = await logger.loadStage<ShotImagesOutput>('15_shotImages.json');
    if (!images) {
      return NextResponse.json(
        { error: '15_shotImages.json 없음. 이미지 생성 먼저 실행.' },
        { status: 400 },
      );
    }

    const result = await runShotVideos(finalPrompts, images, logger, { model, concurrency, force });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/generate/videos]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
