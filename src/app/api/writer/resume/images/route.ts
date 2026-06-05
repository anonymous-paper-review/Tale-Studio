// L6 resume: 15_L6_images.json의 status='pending' 항목을 fal.queue로 회수
//   - status='pending' + request_id 있는 항목만 처리
//   - polling 한 라운드 + 즉시 응답 (UI가 반복 호출)
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/writer/logger';
import { falImageFetch } from '@/lib/writer/llm/fal';
import type { L6ImagesOutput, ShotImageResult } from '@/lib/writer/types/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

function naturalCompareShotId(a: string, b: string): number {
  const ax = (a.match(/\d+/g) ?? []).map(Number);
  const bx = (b.match(/\d+/g) ?? []).map(Number);
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const av = ax[i] ?? 0;
    const bv = bx[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return a.localeCompare(b);
}

export async function POST(req: NextRequest) {
  try {
    const { projectId } = (await req.json()) as { projectId?: string };
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const logger = new PipelineLogger(projectId);
    await logger.init();

    const file = await logger.loadStage<L6ImagesOutput>('15_L6_images.json');
    if (!file) {
      return NextResponse.json({ error: '15_L6_images.json 없음' }, { status: 400 });
    }

    const shots: ShotImageResult[] = file.shots.slice();
    const pendingIdx = shots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.status === 'pending' && s.request_id);

    if (pendingIdx.length === 0) {
      return NextResponse.json({
        ...file,
        resumed: 0,
        still_pending: 0,
      });
    }

    let resumed = 0;
    const model = file.model;
    await Promise.all(
      pendingIdx.map(async ({ s, i }) => {
        try {
          const r = await falImageFetch(model, s.request_id!);
          if (r.status === 'COMPLETED') {
            shots[i] = { ...s, image_url: r.url, width: r.width, height: r.height, status: 'success' };
            resumed++;
          } else if (r.status === 'FAILED') {
            shots[i] = { ...s, status: 'failed', error: r.error };
            resumed++;
          }
        } catch (e) {
          console.warn(`[resume/images] ${s.shot_id} fetch error:`, e instanceof Error ? e.message : e);
        }
      }),
    );

    const sorted = shots.sort((a, b) => naturalCompareShotId(a.shot_id, b.shot_id));
    const output: L6ImagesOutput = {
      total_shots: file.total_shots,
      success_count: sorted.filter((r) => r.status === 'success').length,
      failed_count: sorted.filter((r) => r.status === 'failed').length,
      pending_count: sorted.filter((r) => r.status === 'pending').length,
      model: file.model,
      shots: sorted,
    };
    await logger.saveStage('15_L6_images.json', output);
    return NextResponse.json({ ...output, resumed, still_pending: output.pending_count });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[svc/resume/images]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
