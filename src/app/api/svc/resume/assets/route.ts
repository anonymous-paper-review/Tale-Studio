// Assets resume: 14b_assets.json의 status='pending' 항목 회수
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/svc/logger';
import { falImageFetch } from '@/lib/svc/llm/fal';
import type { AssetItem, AssetsManifest } from '@/lib/svc/types/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { projectId } = (await req.json()) as { projectId?: string };
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const logger = new PipelineLogger(projectId);
    await logger.init();

    const file = await logger.loadStage<AssetsManifest>('14b_assets.json');
    if (!file) {
      return NextResponse.json({ error: '14b_assets.json 없음' }, { status: 400 });
    }

    const characters: AssetItem[] = file.characters.slice();
    const locations: AssetItem[] = file.locations.slice();
    const all = [
      ...characters.map((a, i) => ({ a, i, group: 'c' as const })),
      ...locations.map((a, i) => ({ a, i, group: 'l' as const })),
    ];
    const pending = all.filter((x) => x.a.status === 'pending' && x.a.request_id);

    if (pending.length === 0) {
      return NextResponse.json({ ...file, resumed: 0, still_pending: 0 });
    }

    let resumed = 0;
    const model = file.model;
    await Promise.all(
      pending.map(async ({ a, i, group }) => {
        try {
          const r = await falImageFetch(model, a.request_id!);
          if (r.status === 'COMPLETED') {
            const updated: AssetItem = { ...a, image_url: r.url, width: r.width, height: r.height, status: 'success' };
            if (group === 'c') characters[i] = updated;
            else locations[i] = updated;
            resumed++;
          } else if (r.status === 'FAILED') {
            const updated: AssetItem = { ...a, status: 'failed', error: r.error };
            if (group === 'c') characters[i] = updated;
            else locations[i] = updated;
            resumed++;
          }
        } catch (e) {
          console.warn(`[resume/assets] ${a.id} fetch error:`, e instanceof Error ? e.message : e);
        }
      }),
    );

    const merged = [...characters, ...locations];
    const output: AssetsManifest = {
      total: file.total,
      success_count: merged.filter((a) => a.status === 'success').length,
      failed_count: merged.filter((a) => a.status === 'failed').length,
      pending_count: merged.filter((a) => a.status === 'pending').length,
      model: file.model,
      aspect_ratio: file.aspect_ratio,
      characters,
      locations,
    };
    await logger.saveStage('14b_assets.json', output);
    return NextResponse.json({ ...output, resumed, still_pending: output.pending_count });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[svc/resume/assets]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
