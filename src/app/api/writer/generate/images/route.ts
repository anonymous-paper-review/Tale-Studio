// V6: T2I 이미지 생성 (fal.ai openai/gpt-image-2)
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/writer/logger';
import { requireProjectAccess } from '@/lib/api/guard';
import { runShotImages } from '@/lib/writer/pipeline/stages/v6_images';
import type { RenderPromptsOutput } from '@/lib/writer/types/pipeline';

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
    // 유료 T2I 생성 트리거 — 소유자만 (2026-08-11 보안 감사: 무인증이었다).
    const access = await requireProjectAccess(req, projectId);
    if (!access.ok) return access.response;

    const logger = new PipelineLogger(access.projectId);
    await logger.init();

    const finalPrompts = await logger.loadStage<RenderPromptsOutput>('14_v5_renderPrompts.json');
    if (!finalPrompts) {
      return NextResponse.json(
        { error: '14_renderPrompts.json 없음. 파이프라인이 L5까지 완료되어야 함.' },
        { status: 400 },
      );
    }

    const result = await runShotImages(finalPrompts, logger, { model, concurrency, force });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/generate/images]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
