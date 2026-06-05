// Assets stage 수동 트리거: L2까지 완료된 프로젝트에 캐릭터/로케이션 reference 이미지 생성
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/writer/logger';
import { runAssetsGenerate } from '@/lib/writer/pipeline/stages/assets_generate';
import type {
  RenderFormat,
  ArtDirection,
  ProductionDesign,
  Characters,
} from '@/lib/writer/types/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Hobby 한도. 점진적 저장 + resume으로 초과분 이어받기.

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

    const characters = await logger.loadStage<Characters>('04_characters.json');
    const visualFormat = await logger.loadStage<{ renderFormat: RenderFormat; artDirection: ArtDirection }>('08_renderFormat_artDirection.json');
    const productionDesign = await logger.loadStage<ProductionDesign>('09_productionDesign.json');
    if (!characters || !visualFormat || !productionDesign) {
      return NextResponse.json(
        { error: '04_characters.json / 08_renderFormat_artDirection.json / 09_productionDesign.json 중 하나 없음. 파이프라인 productionDesign까지 필요.' },
        { status: 400 },
      );
    }

    const result = await runAssetsGenerate(characters, visualFormat.renderFormat, visualFormat.artDirection, productionDesign, logger, {
      model,
      concurrency,
      force,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/generate/assets]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
