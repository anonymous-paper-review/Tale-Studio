// L6: 첫 프레임 이미지 생성 (T2I)
//   L5 final_prompts.shots[].t2i.prompt → fal.queue.submit → polling → image URL
//
// 전략 (Next.js maxDuration timeout 회피):
//   1. 모든 샷을 fal queue에 submit (몇 초). request_id를 progressive save (status='pending').
//   2. 짧은 polling 윈도우 안에 끝난 것만 success/failed로 승격.
//   3. 끝까지 안 끝난 것은 'pending'으로 두고 reply. resume endpoint가 나중에 회수.
import { falImageSubmit, falImageFetch } from '@/lib/writer/llm/fal';
import type {
  AssetsManifest,
  FinalPromptsOutput,
  L6ImagesOutput,
  ShotImageResult,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface L6Options {
  model?: string;
  concurrency?: number;
  /** true: 기존 성공 결과 무시하고 전부 재생성. 기본 false (캐시 활용) */
  force?: boolean;
  /** polling 윈도우 (ms). 기본 90초. 그 안에 안 끝난 샷은 pending으로 남김. */
  pollWindowMs?: number;
  /** polling 간격 (ms). 기본 8초. */
  pollIntervalMs?: number;
}

export async function runL6Images(
  finalPrompts: FinalPromptsOutput,
  logger: PipelineLogger,
  opts: L6Options = {},
): Promise<L6ImagesOutput> {
  // 에셋 매니페스트 로드 → reference 이미지 URL 룩업 테이블
  //   asset 있으면 자동으로 edit 모델 (openai/gpt-image-2/edit)로 라우팅 (I2I)
  //   asset 없으면 순수 T2I (openai/gpt-image-2)
  const assets = await logger.loadStage<AssetsManifest>('14b_assets.json');
  const assetUrlById = new Map<string, string>();
  for (const a of [...(assets?.characters ?? []), ...(assets?.locations ?? [])]) {
    if (a.status === 'success' && a.image_url) assetUrlById.set(a.id, a.image_url);
  }
  const hasAnyAssets = assetUrlById.size > 0;
  const modelLabel = opts.model ?? (hasAnyAssets ? 'openai/gpt-image-2/edit' : 'openai/gpt-image-2');

  const cachedFile = !opts.force ? await logger.loadStage<L6ImagesOutput>('15_L6_images.json') : null;
  const cachedSuccess = new Map<string, ShotImageResult>(
    (cachedFile?.shots ?? [])
      .filter((s) => s.status === 'success' && s.image_url)
      .map((s) => [s.shot_id, s]),
  );

  await logger.markStage('L6_images', 'started', {
    total: finalPrompts.shots.length,
    model: modelLabel,
    asset_count: assetUrlById.size,
    cached_skipped: cachedSuccess.size,
    force: !!opts.force,
  });

  const concurrency = opts.concurrency ?? 4;
  const pollWindowMs = opts.pollWindowMs ?? 90_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 8_000;
  const totalShots = finalPrompts.shots.length;

  const resultByShot = new Map<string, ShotImageResult>();
  for (const cached of cachedSuccess.values()) {
    resultByShot.set(cached.shot_id, cached);
  }

  let writeLock: Promise<void> = Promise.resolve();
  const buildOutput = (): L6ImagesOutput => {
    const arr = [...resultByShot.values()].sort((a, b) => naturalCompareShotId(a.shot_id, b.shot_id));
    return {
      total_shots: totalShots,
      success_count: arr.filter((r) => r.status === 'success').length,
      failed_count: arr.filter((r) => r.status === 'failed').length,
      pending_count: arr.filter((r) => r.status === 'pending').length,
      model: modelLabel,
      shots: arr,
    };
  };
  const saveProgress = (): Promise<void> => {
    writeLock = writeLock
      .then(() => logger.saveStage('15_L6_images.json', buildOutput()))
      .then(() => undefined)
      .catch((e) => {
        console.warn('[L6] progress save failed:', e);
      });
    return writeLock;
  };

  // ── Phase 1: 모든 샷을 fal queue에 submit ─────────────────────────────
  const submitQueue = finalPrompts.shots.filter((s) => !cachedSuccess.has(s.shot_id));
  const pendingShots: Array<{ shot_id: string; request_id: string }> = [];

  async function submitWorker() {
    while (submitQueue.length > 0) {
      const shot = submitQueue.shift();
      if (!shot) return;
      // shot.t2i.reference_assets (ID 목록) → asset URL 목록
      const refUrls = (shot.t2i.reference_assets ?? [])
        .map((id) => assetUrlById.get(id))
        .filter((u): u is string => !!u);
      try {
        const { request_id } = await falImageSubmit({
          model: opts.model,
          prompt: shot.t2i.prompt,
          aspect_ratio: shot.t2i.aspect_ratio,
          negative_prompt: shot.t2i.negative_prompt,
          reference_image_urls: refUrls.length > 0 ? refUrls : undefined,
        });
        const pending: ShotImageResult = {
          shot_id: shot.shot_id,
          scene_id: shot.scene_id,
          image_url: '',
          prompt_used: shot.t2i.prompt,
          model: modelLabel,
          status: 'pending',
          request_id,
          submitted_at: new Date().toISOString(),
        };
        resultByShot.set(shot.shot_id, pending);
        pendingShots.push({ shot_id: shot.shot_id, request_id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resultByShot.set(shot.shot_id, {
          shot_id: shot.shot_id,
          scene_id: shot.scene_id,
          image_url: '',
          prompt_used: shot.t2i.prompt,
          model: modelLabel,
          status: 'failed',
          error: `submit failed: ${msg}`,
        });
        console.warn(`[L6] ${shot.shot_id} submit failed: ${msg}`);
      }
      await saveProgress();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => submitWorker()));

  // ── Phase 2: 짧은 polling 윈도우 ──────────────────────────────────────
  const pollDeadline = Date.now() + pollWindowMs;
  const stillPending = new Map<string, string>();
  for (const p of pendingShots) stillPending.set(p.shot_id, p.request_id);

  while (stillPending.size > 0 && Date.now() < pollDeadline) {
    await sleep(pollIntervalMs);
    const entries = [...stillPending.entries()];
    await Promise.all(
      entries.map(async ([shot_id, request_id]) => {
        const cur = resultByShot.get(shot_id);
        if (!cur) return;
        try {
          const r = await falImageFetch(modelLabel, request_id);
          if (r.status === 'COMPLETED') {
            resultByShot.set(shot_id, {
              ...cur,
              image_url: r.url,
              width: r.width,
              height: r.height,
              status: 'success',
            });
            stillPending.delete(shot_id);
          } else if (r.status === 'FAILED') {
            resultByShot.set(shot_id, { ...cur, status: 'failed', error: r.error });
            stillPending.delete(shot_id);
          }
        } catch (e) {
          console.warn(`[L6] poll ${shot_id} transient:`, e instanceof Error ? e.message : e);
        }
      }),
    );
    await saveProgress();
  }

  const output = buildOutput();
  await saveProgress();
  await logger.markStage('L6_images', 'completed', {
    success: output.success_count,
    failed: output.failed_count,
    pending: output.pending_count ?? 0,
  });
  return output;
}
