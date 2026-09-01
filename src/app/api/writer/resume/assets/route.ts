// Assets resume: 14b_assets.json의 status='pending' 항목 회수
import { NextRequest, NextResponse } from 'next/server';
import { PipelineLogger } from '@/lib/writer/logger';
import { requireProjectAccess } from '@/lib/api/guard';
import { falImageFetch } from '@/lib/writer/llm/fal';
import type { AssetItem, AssetsManifest } from '@/lib/writer/types/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { projectId } = (await req.json()) as { projectId?: string };
    // fal 회수 트리거 — 소유자만 (2026-08-11 보안 감사: 무인증이었다).
    const access = await requireProjectAccess(req, projectId);
    if (!access.ok) return access.response;

    const logger = new PipelineLogger(access.projectId);
    await logger.init();

    const file = await logger.loadStage<AssetsManifest>('14b_assets.json');
    if (!file) {
      return NextResponse.json({ error: '14b_assets.json missing' }, { status: 400 });
    }

    const characters: AssetItem[] = file.characters.slice();
    const locations: AssetItem[] = file.locations.slice();
    const all = [
      ...characters.map((a, i) => ({ a, i, group: 'c' as const })),
      ...locations.map((a, i) => ({ a, i, group: 'l' as const })),
    ];
    // request_id 는 있지만 fal_key_id 가 없는 항목은 다중키 이전에 제출된 오래된 pending —
    //   어느 키로 제출됐는지 알 수 없어 재시도 없이 즉시 failed 처리(#fal-key-pool).
    for (const { a, i, group } of all) {
      if (a.status === 'pending' && a.request_id && !a.fal_key_id) {
        const failed = { ...a, status: 'failed' as const, error: 'fal key unknown (pre-multikey entry)' };
        if (group === 'c') characters[i] = failed;
        else locations[i] = failed;
      }
    }
    const pending = all
      .map(({ i, group }) => ({ a: group === 'c' ? characters[i] : locations[i], i, group }))
      .filter((x) => x.a.status === 'pending' && x.a.request_id);

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
          const r = await falImageFetch(model, a.request_id!, a.fal_key_id!);
          if (r.status === 'COMPLETED') {
            setItem({ ...a, image_url: r.url, width: r.width, height: r.height, status: 'success' });
          } else if (r.status === 'FAILED') {
            setItem({ ...a, status: 'failed', error: r.error });
          } else if (tooOld) {
            // 아직 IN_QUEUE/IN_PROGRESS인데 제한시간 초과 → 포기
            setItem({ ...a, status: 'failed', error: `timeout: not completed within ${Math.round(TIMEOUT_MS / 60000)} min (last status ${r.status})` });
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
