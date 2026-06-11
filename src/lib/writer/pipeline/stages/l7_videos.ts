// L7: 영상 클립 생성 (TI2V — 첫 프레임 + 모션 프롬프트)
//   L6 image_url + L5 ti2v.motion_prompt → fal.queue.submit → polling → video URL
//
// 전략 (Next.js maxDuration timeout 회피):
//   1. 모든 샷을 fal queue에 submit (몇 초). request_id를 progressive save (status='pending').
//   2. polling 윈도우 안에 끝난 것만 success/failed로 승격.
//   3. 끝까지 안 끝난 것은 'pending'으로 남기고 reply. resume endpoint가 회수.
import { falVideoSubmit, falVideoFetch } from '@/lib/writer/llm/fal';
import type {
  RenderPromptsOutput,
  ShotImagesOutput,
  ShotVideosOutput,
  ShotVideoResult,
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

export interface L7Options {
  model?: string;
  concurrency?: number;
  /** true: 기존 성공 결과 무시하고 전부 재생성. 기본 false (캐시 활용) */
  force?: boolean;
  /** polling 윈도우 (ms). 기본 240초 (영상은 이미지보다 오래 걸림). */
  pollWindowMs?: number;
  /** polling 간격 (ms). 기본 15초. */
  pollIntervalMs?: number;
}

export async function runShotVideos(
  finalPrompts: RenderPromptsOutput,
  images: ShotImagesOutput,
  logger: PipelineLogger,
  opts: L7Options = {},
): Promise<ShotVideosOutput> {
  const modelLabel = opts.model ?? 'alibaba/happy-horse/reference-to-video';

  const cachedFile = !opts.force ? await logger.loadStage<ShotVideosOutput>('16_shotVideos.json') : null;
  const cachedSuccess = new Map<string, ShotVideoResult>(
    (cachedFile?.shots ?? [])
      .filter((s) => s.status === 'success' && s.video_url)
      .map((s) => [s.shot_id, s]),
  );

  await logger.markStage('shotVideos', 'started', {
    total: finalPrompts.shots.length,
    model: modelLabel,
    cached_skipped: cachedSuccess.size,
    force: !!opts.force,
  });

  const imageByShot = new Map(images.shots.map((i) => [i.shot_id, i]));
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 2, 2));
  const pollWindowMs = opts.pollWindowMs ?? 240_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 15_000;
  const totalShots = finalPrompts.shots.length;

  const resultByShot = new Map<string, ShotVideoResult>();
  for (const cached of cachedSuccess.values()) {
    resultByShot.set(cached.shot_id, cached);
  }

  let writeLock: Promise<void> = Promise.resolve();
  const buildOutput = (): ShotVideosOutput => {
    const arr = [...resultByShot.values()].sort((a, b) => naturalCompareShotId(a.shot_id, b.shot_id));
    return {
      total_shots: totalShots,
      success_count: arr.filter((r) => r.status === 'success').length,
      failed_count: arr.filter((r) => r.status === 'failed').length,
      skipped_count: arr.filter((r) => r.status === 'skipped').length,
      pending_count: arr.filter((r) => r.status === 'pending').length,
      model: modelLabel,
      shots: arr,
    };
  };
  const saveProgress = (): Promise<void> => {
    writeLock = writeLock
      .then(() => logger.saveStage('16_shotVideos.json', buildOutput()))
      .then(() => undefined)
      .catch((e) => {
        console.warn('[L7] progress save failed:', e);
      });
    return writeLock;
  };

  // ── Phase 1: submit ────────────────────────────────────────────────
  const submitQueue = finalPrompts.shots.filter((s) => !cachedSuccess.has(s.shot_id));
  const pendingShots: Array<{ shot_id: string; request_id: string }> = [];

  async function submitWorker() {
    while (submitQueue.length > 0) {
      const shot = submitQueue.shift();
      if (!shot) return;
      const img = imageByShot.get(shot.shot_id);
      if (!img || img.status !== 'success' || !img.image_url) {
        resultByShot.set(shot.shot_id, {
          shot_id: shot.shot_id,
          scene_id: shot.scene_id,
          video_url: '',
          prompt_used: shot.ti2v.motion_prompt,
          first_frame_url: img?.image_url ?? '',
          model: modelLabel,
          duration_seconds: shot.ti2v.duration_seconds,
          status: 'skipped',
          error: 'no first frame image',
        });
        await saveProgress();
        continue;
      }
      try {
        const { request_id } = await falVideoSubmit({
          model: opts.model,
          prompt: shot.ti2v.motion_prompt,
          image_url: img.image_url,
          duration: shot.ti2v.duration_seconds,
          aspect_ratio: shot.t2i.aspect_ratio,
          negative_prompt: shot.ti2v.negative_prompt,
        });
        resultByShot.set(shot.shot_id, {
          shot_id: shot.shot_id,
          scene_id: shot.scene_id,
          video_url: '',
          prompt_used: shot.ti2v.motion_prompt,
          first_frame_url: img.image_url,
          duration_seconds: shot.ti2v.duration_seconds,
          model: modelLabel,
          status: 'pending',
          request_id,
          submitted_at: new Date().toISOString(),
        });
        pendingShots.push({ shot_id: shot.shot_id, request_id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resultByShot.set(shot.shot_id, {
          shot_id: shot.shot_id,
          scene_id: shot.scene_id,
          video_url: '',
          prompt_used: shot.ti2v.motion_prompt,
          first_frame_url: img.image_url,
          duration_seconds: shot.ti2v.duration_seconds,
          model: modelLabel,
          status: 'failed',
          error: `submit failed: ${msg}`,
        });
        console.warn(`[L7] ${shot.shot_id} submit failed: ${msg}`);
      }
      await saveProgress();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => submitWorker()));

  // ── Phase 2: polling 윈도우 ─────────────────────────────────────────
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
          const r = await falVideoFetch(modelLabel, request_id);
          if (r.status === 'COMPLETED') {
            resultByShot.set(shot_id, {
              ...cur,
              video_url: r.url,
              duration_seconds: r.duration ?? cur.duration_seconds,
              status: 'success',
            });
            stillPending.delete(shot_id);
          } else if (r.status === 'FAILED') {
            resultByShot.set(shot_id, { ...cur, status: 'failed', error: r.error });
            stillPending.delete(shot_id);
          }
        } catch (e) {
          console.warn(`[L7] poll ${shot_id} transient:`, e instanceof Error ? e.message : e);
        }
      }),
    );
    await saveProgress();
  }

  const output = buildOutput();
  await saveProgress();
  await logger.markStage('shotVideos', 'completed', {
    success: output.success_count,
    failed: output.failed_count,
    skipped: output.skipped_count,
    pending: output.pending_count ?? 0,
  });
  return output;
}
