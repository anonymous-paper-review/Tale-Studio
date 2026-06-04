// Assets stage 수동 트리거: L2까지 완료된 프로젝트에 캐릭터/로케이션 reference 이미지 생성
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/svc/logger';
import { runAssetsGenerate } from '@/lib/svc/pipeline/stages/assets_generate';
import type {
  L0Visual,
  L1Style,
  L2Design,
  S2Block,
} from '@/lib/svc/types/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 600;

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

    const s2 = await logger.loadStage<S2Block>('04_S2.json');
    const l0l1 = await logger.loadStage<{ L0: L0Visual; L1: L1Style }>('08_L0_L1.json');
    const l2 = await logger.loadStage<L2Design>('09_L2.json');
    if (!s2 || !l0l1 || !l2) {
      return NextResponse.json(
        { error: '04_S2.json / 08_L0_L1.json / 09_L2.json 중 하나 없음. 파이프라인 L2까지 필요.' },
        { status: 400 },
      );
    }

    const result = await runAssetsGenerate(s2, l0l1.L0, l0l1.L1, l2, logger, {
      model,
      concurrency,
      force,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[svc/generate/assets]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
