// L7 resume: 16_L7_videos.json의 status='pending' 항목을 fal.queue로 회수
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/writer/logger';
import { falVideoFetch } from '@/lib/writer/llm/fal';
import type { L7VideosOutput, ShotVideoResult } from '@/lib/writer/types/pipeline';

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

    const file = await logger.loadStage<L7VideosOutput>('16_L7_videos.json');
    if (!file) {
      return NextResponse.json({ error: '16_L7_videos.json 없음' }, { status: 400 });
    }

    const shots: ShotVideoResult[] = file.shots.slice();
    const pendingIdx = shots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.status === 'pending' && s.request_id);

    if (pendingIdx.length === 0) {
      return NextResponse.json({ ...file, resumed: 0, still_pending: 0 });
    }

    let resumed = 0;
    const model = file.model;
    await Promise.all(
      pendingIdx.map(async ({ s, i }) => {
        try {
          const r = await falVideoFetch(model, s.request_id!);
          if (r.status === 'COMPLETED') {
            shots[i] = {
              ...s,
              video_url: r.url,
              duration_seconds: r.duration ?? s.duration_seconds,
              status: 'success',
            };
            resumed++;
          } else if (r.status === 'FAILED') {
            shots[i] = { ...s, status: 'failed', error: r.error };
            resumed++;
          }
        } catch (e) {
          console.warn(`[resume/videos] ${s.shot_id} fetch error:`, e instanceof Error ? e.message : e);
        }
      }),
    );

    const sorted = shots.sort((a, b) => naturalCompareShotId(a.shot_id, b.shot_id));
    const output: L7VideosOutput = {
      total_shots: file.total_shots,
      success_count: sorted.filter((r) => r.status === 'success').length,
      failed_count: sorted.filter((r) => r.status === 'failed').length,
      skipped_count: sorted.filter((r) => r.status === 'skipped').length,
      pending_count: sorted.filter((r) => r.status === 'pending').length,
      model: file.model,
      shots: sorted,
    };
    await logger.saveStage('16_L7_videos.json', output);
    return NextResponse.json({ ...output, resumed, still_pending: output.pending_count });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[svc/resume/videos]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
