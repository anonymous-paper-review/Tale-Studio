// L7 resume: 16_shotVideos.json의 status='pending' 항목을 fal.queue로 회수
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/writer/logger';
import { requireProjectAccess } from '@/lib/api/guard';
import { falVideoFetch } from '@/lib/writer/llm/fal';
import type { ShotVideosOutput, ShotVideoResult } from '@/lib/writer/types/pipeline';

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
    // fal 회수 트리거 — 소유자만 (2026-08-11 보안 감사: 무인증이었다).
    const access = await requireProjectAccess(req, projectId);
    if (!access.ok) return access.response;

    const logger = new PipelineLogger(access.projectId);
    await logger.init();

    const file = await logger.loadStage<ShotVideosOutput>('16_v7_shotVideos.json');
    if (!file) {
      return NextResponse.json({ error: '16_shotVideos.json missing' }, { status: 400 });
    }

    const shots: ShotVideoResult[] = file.shots.slice();
    // request_id 는 있지만 fal_key_id 가 없는 항목은 다중키 이전에 제출된 오래된 pending —
    //   어느 키로 제출됐는지 알 수 없어 재시도 없이 즉시 failed 처리(#fal-key-pool).
    for (const s of shots) {
      if (s.status === 'pending' && s.request_id && !s.fal_key_id) {
        s.status = 'failed';
        s.error = 'fal key unknown (pre-multikey entry)';
      }
    }
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
          const r = await falVideoFetch(model, s.request_id!, s.fal_key_id!);
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
    const output: ShotVideosOutput = {
      total_shots: file.total_shots,
      success_count: sorted.filter((r) => r.status === 'success').length,
      failed_count: sorted.filter((r) => r.status === 'failed').length,
      skipped_count: sorted.filter((r) => r.status === 'skipped').length,
      pending_count: sorted.filter((r) => r.status === 'pending').length,
      model: file.model,
      shots: sorted,
    };
    await logger.saveStage('16_v7_shotVideos.json', output);
    return NextResponse.json({ ...output, resumed, still_pending: output.pending_count });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/resume/videos]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
