// Assets resume: 14b_assets.json의 status='pending' 항목 회수
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/writer/logger';
import { falImageFetch } from '@/lib/writer/llm/fal';
import type { AssetItem, AssetsManifest } from '@/lib/writer/types/pipeline';

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

    // pending이 영원히 안 풀리면(fal 큐 정체 / fetch가 계속 Forbidden·throw) 클라이언트가
    // 무한히 resume를 폴링한다. submitted_at 기준 age-out: 일정 시간 초과하면 'failed'로
    // 강등해 pending을 비워 루프를 종료시킨다. (submitted_at 없으면 회수 불가로 보고 즉시 실패)
    const TIMEOUT_MS = 5 * 60 * 1000; // 5분
    const now = Date.now();

    let resumed = 0;
    const model = file.model;
    await Promise.all(
      pending.map(async ({ a, i, group }) => {
        const setItem = (updated: AssetItem) => {
          if (group === 'c') characters[i] = updated;
          else locations[i] = updated;
          resumed++;
        };
        const ageMs = a.submitted_at ? now - Date.parse(a.submitted_at) : Infinity;
        const tooOld = !(ageMs < TIMEOUT_MS); // NaN/Infinity도 timeout으로 간주

        try {
          const r = await falImageFetch(model, a.request_id!);
          if (r.status === 'COMPLETED') {
            setItem({ ...a, image_url: r.url, width: r.width, height: r.height, status: 'success' });
          } else if (r.status === 'FAILED') {
            setItem({ ...a, status: 'failed', error: r.error });
          } else if (tooOld) {
            // 아직 IN_QUEUE/IN_PROGRESS인데 제한시간 초과 → 포기
            setItem({ ...a, status: 'failed', error: `timeout: ${Math.round(TIMEOUT_MS / 60000)}분 내 미완료 (마지막 ${r.status})` });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (tooOld) {
            // fetch가 계속 실패(예: Forbidden)하고 제한시간도 초과 → 포기
            setItem({ ...a, status: 'failed', error: `timeout after fetch error: ${msg}` });
          } else {
            console.warn(`[resume/assets] ${a.id} fetch error (will retry):`, msg);
          }
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
    console.error('[writer/resume/assets]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
