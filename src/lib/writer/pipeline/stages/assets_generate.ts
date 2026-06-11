// Assets stage: 캐릭터/로케이션 reference 이미지 생성 (L2 직후)
//   - S2.characters → 캐릭터 시트 reference
//   - L2.locations → 로케이션 establishing reference
//
// 전략: L6/L7 동일 — submit/poll + progressive save.
//   - 순수 T2I (openai/gpt-image-2). reference 없이 깨끗하게 생성.
//   - 이 결과가 L6에서 reference_image_urls로 주입됨 (I2I).
import { falImageSubmit, falImageFetch } from '@/lib/writer/llm/fal';
import type {
  AssetItem,
  AssetsManifest,
  RenderFormat,
  ArtDirection,
  ProductionDesign,
  Characters,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface AssetsOptions {
  model?: string;
  concurrency?: number;
  force?: boolean;
  pollWindowMs?: number;
  pollIntervalMs?: number;
}

// 캐릭터 시트 프롬프트: 일관성을 위해 중립 배경 + 풀바디 + 단일 캐릭터
function buildCharacterPrompt(
  char: Characters['characters'][number],
  costumes: string[],
  artDirection: ArtDirection,
  productionDesign: ProductionDesign,
): string {
  const palette = [productionDesign.global_palette.primary, productionDesign.global_palette.secondary, productionDesign.global_palette.accent]
    .filter(Boolean)
    .join(', ');
  const costumeText = costumes?.length ? `wearing ${costumes.join(', ')}` : '';
  return [
    `Character reference sheet of ${char.name}`,
    char.age ? `age ${char.age}` : '',
    char.role,
    char.appearance_description,
    costumeText,
    `art style: ${artDirection.art_style}`,
    `shape language: ${artDirection.shape_language}`,
    `palette: ${palette}`,
    `full body, neutral grey background, single character, front view, T-pose, clean lighting, no text, no logo`,
  ]
    .filter(Boolean)
    .join('. ');
}

function buildLocationPrompt(
  loc: ProductionDesign['locations'][number],
  artDirection: ArtDirection,
  productionDesign: ProductionDesign,
): string {
  const palette = [productionDesign.global_palette.primary, productionDesign.global_palette.secondary, productionDesign.global_palette.accent]
    .filter(Boolean)
    .join(', ');
  const lights = loc.lighting_sources?.length ? `lighting: ${loc.lighting_sources.join(', ')}` : '';
  const props = loc.props?.length ? `props: ${loc.props.join(', ')}` : '';
  return [
    `Location establishing shot of ${loc.id}`,
    loc.style_description,
    lights,
    props,
    `art style: ${artDirection.art_style}`,
    `palette: ${palette}`,
    `wide establishing shot, no characters, environment only, clean composition, no text, no logo`,
  ]
    .filter(Boolean)
    .join('. ');
}

export async function runAssetsGenerate(
  characters: Characters,
  renderFormat: RenderFormat,
  artDirection: ArtDirection,
  productionDesign: ProductionDesign,
  logger: PipelineLogger,
  opts: AssetsOptions = {},
): Promise<AssetsManifest> {
  const modelLabel = opts.model ?? 'openai/gpt-image-2'; // 순수 T2I (reference 없이)
  const aspectRatio = renderFormat.aspect_ratio;

  const cachedFile = !opts.force ? await logger.loadStage<AssetsManifest>('14b_assets.json') : null;
  const cachedSuccessById = new Map<string, AssetItem>();
  for (const a of [...(cachedFile?.characters ?? []), ...(cachedFile?.locations ?? [])]) {
    if (a.status === 'success' && a.image_url) cachedSuccessById.set(a.id, a);
  }

  await logger.markStage('assets_generate', 'started', {
    characters: characters.characters.length,
    locations: productionDesign.locations.length,
    cached_skipped: cachedSuccessById.size,
    model: modelLabel,
    force: !!opts.force,
  });

  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 2, 2));
  const pollWindowMs = opts.pollWindowMs ?? 90_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 8_000;

  // 작업 단위: 캐릭터 + 로케이션 한 리스트로
  type Task = {
    id: string;
    kind: 'character' | 'location';
    name: string;
    prompt: string;
  };
  const allTasks: Task[] = [];
  for (const c of characters.characters) {
    const costumes = productionDesign.costumes?.[c.id] ?? [];
    allTasks.push({
      id: c.id,
      kind: 'character',
      name: c.name,
      prompt: buildCharacterPrompt(c, costumes, artDirection, productionDesign),
    });
  }
  for (const loc of productionDesign.locations) {
    allTasks.push({
      id: loc.id,
      kind: 'location',
      name: loc.id,
      prompt: buildLocationPrompt(loc, artDirection, productionDesign),
    });
  }

  // 결과 누적 — id 기준 upsert
  const resultById = new Map<string, AssetItem>();
  for (const cached of cachedSuccessById.values()) {
    resultById.set(cached.id, cached);
  }

  let writeLock: Promise<void> = Promise.resolve();
  const buildManifest = (): AssetsManifest => {
    const all = [...resultById.values()];
    const characters = all.filter((a) => a.kind === 'character');
    const locations = all.filter((a) => a.kind === 'location');
    return {
      total: allTasks.length,
      success_count: all.filter((a) => a.status === 'success').length,
      failed_count: all.filter((a) => a.status === 'failed').length,
      pending_count: all.filter((a) => a.status === 'pending').length,
      model: modelLabel,
      aspect_ratio: aspectRatio,
      characters,
      locations,
    };
  };
  const saveProgress = (): Promise<void> => {
    writeLock = writeLock
      .then(() => logger.saveStage('14b_assets.json', buildManifest()))
      .then(() => undefined)
      .catch((e) => {
        console.warn('[assets] progress save failed:', e);
      });
    return writeLock;
  };

  // ── Phase 1: submit ────────────────────────────────────────────────
  const submitQueue = allTasks.filter((t) => !cachedSuccessById.has(t.id));
  const pendingItems: Array<{ id: string; request_id: string }> = [];

  async function submitWorker() {
    while (submitQueue.length > 0) {
      const task = submitQueue.shift();
      if (!task) return;
      try {
        const { request_id } = await falImageSubmit({
          model: opts.model,
          prompt: task.prompt,
          aspect_ratio: aspectRatio,
        });
        resultById.set(task.id, {
          id: task.id,
          kind: task.kind,
          name: task.name,
          prompt_used: task.prompt,
          image_url: '',
          model: modelLabel,
          status: 'pending',
          request_id,
          submitted_at: new Date().toISOString(),
        });
        pendingItems.push({ id: task.id, request_id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resultById.set(task.id, {
          id: task.id,
          kind: task.kind,
          name: task.name,
          prompt_used: task.prompt,
          image_url: '',
          model: modelLabel,
          status: 'failed',
          error: `submit failed: ${msg}`,
        });
        console.warn(`[assets] ${task.id} submit failed: ${msg}`);
      }
      await saveProgress();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => submitWorker()));

  // ── Phase 2: polling 윈도우 ─────────────────────────────────────────
  const pollDeadline = Date.now() + pollWindowMs;
  const stillPending = new Map<string, string>();
  for (const p of pendingItems) stillPending.set(p.id, p.request_id);

  while (stillPending.size > 0 && Date.now() < pollDeadline) {
    await sleep(pollIntervalMs);
    const entries = [...stillPending.entries()];
    await Promise.all(
      entries.map(async ([id, request_id]) => {
        const cur = resultById.get(id);
        if (!cur) return;
        try {
          const r = await falImageFetch(modelLabel, request_id);
          if (r.status === 'COMPLETED') {
            resultById.set(id, {
              ...cur,
              image_url: r.url,
              width: r.width,
              height: r.height,
              status: 'success',
            });
            stillPending.delete(id);
          } else if (r.status === 'FAILED') {
            resultById.set(id, { ...cur, status: 'failed', error: r.error });
            stillPending.delete(id);
          }
        } catch (e) {
          console.warn(`[assets] poll ${id} transient:`, e instanceof Error ? e.message : e);
        }
      }),
    );
    await saveProgress();
  }

  const manifest = buildManifest();
  await saveProgress();
  await logger.markStage('assets_generate', 'completed', {
    success: manifest.success_count,
    failed: manifest.failed_count,
    pending: manifest.pending_count ?? 0,
  });
  return manifest;
}
