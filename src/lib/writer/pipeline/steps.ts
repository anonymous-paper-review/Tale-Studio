// Stepwise 파이프라인 엔진 (서버리스 웹훅 체이닝).
//
// pipeline/index.ts 의 _runPipelineInner 데이터 흐름을 그대로 미러링하되,
//   - 입력을 state(jsonb) 객체에서 읽고
//   - 한 step 당 한 stage(시간 예산 내면 빠른 stage 몇 개)만 실행
//   - 매 stage 후 state 를 writer_runs 에 체크포인트
// 한다. 각 step 은 별도 서버리스 인스턴스라 메모리/파일이 공유되지 않으므로 state 가 유일한 캐리어.
//
// runPipeline(로컬, 파일 캐시 resume)과 별개 경로 — 그쪽 로직은 건드리지 않는다.
import { PipelineLogger } from '@/lib/writer/logger';
import { runGenre } from '@/lib/writer/pipeline/stages/s0_genre';
import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure';
import { runCharacters } from '@/lib/writer/pipeline/stages/s2_characters';
import { runScenes } from '@/lib/writer/pipeline/stages/s3_scenes';
import { runStoryCheck } from '@/lib/writer/pipeline/stages/c_validation_1';
import { runMidPreview } from '@/lib/writer/pipeline/stages/mid_preview';
import { runRenderFormatArtDirection } from '@/lib/writer/pipeline/stages/l0_l1_visual';
import { runProductionDesign } from '@/lib/writer/pipeline/stages/l2_design';
import { runSceneCinematography } from '@/lib/writer/pipeline/stages/l3_scene_plan';
import { runDecoupage } from '@/lib/writer/pipeline/stages/decoupage';
import { runShotDesign } from '@/lib/writer/pipeline/stages/l4_shots';
import { runShotCheck } from '@/lib/writer/pipeline/stages/c_application_2';
import { runRenderPrompts } from '@/lib/writer/pipeline/stages/l5_prompts';
import { inferSceneCinematographyFromShots } from '@/lib/writer/pipeline/util/infer_l3';
import { persistDesignTokens } from '@/lib/writer/pipeline/util/persist_design_tokens';
import { persistAssetsToDb, persistShotsToDb } from '@/lib/writer/pipeline/util/persist_manifest';
import { isCompactDepth } from '@/lib/writer/types/pipeline';
import { analyzeSceneActionBudget } from '@/lib/writer/pipeline/validators/action_budget';
import { resolveModels, resolveSkip, emptyC1Report, emptyMidPreview } from '@/lib/writer/pipeline';
import {
  getActiveRun,
  saveRunState,
  markCompleted,
  markFailed,
  type WriterRunStateBase,
} from '@/lib/writer/run-store';
import type {
  PipelineInput,
  SceneCinematography,
  ValidationIssue,
  Genre,
  NarrativeStructure,
  Characters,
  Scenes,
  StoryCheckReport,
  MidPreview,
  RenderFormat,
  ArtDirection,
  ProductionDesign,
  ShotDesign,
  DecoupagePlan,
  ShotSequence,
  ShotCheckReport,
  RenderPromptsOutput,
} from '@/lib/writer/types/pipeline';

// =====================================================================
// state 모델: _runPipelineInner 의 모든 중간 산출물을 누적한다.
// =====================================================================
export interface WriterRunState extends WriterRunStateBase {
  input: PipelineInput;

  // Story 축
  genre?: Genre;
  narrativeStructure?: NarrativeStructure;
  characters?: Characters;
  scenes?: Scenes;
  storyCheck?: StoryCheckReport;
  midPreview?: MidPreview;

  // Visual 축
  renderFormat?: RenderFormat;
  artDirection?: ArtDirection;
  productionDesign?: ProductionDesign;
  sceneCinematography?: SceneCinematography[];
  sceneBudgetIssues?: ValidationIssue[];

  // Shot 축
  decoupage?: DecoupagePlan;
  shotDesign?: ShotDesign[];
  shotSequence?: ShotSequence;
  shotCheck?: ShotCheckReport;
  renderPrompts?: RenderPromptsOutput;

  // Compact Mode (genre.depth_level 기반). sceneCinematography step 에서 확정.
  compact?: boolean;

  // 재시도/타임아웃 가드 (중도 kill 시 attempt 증가분이 남는다)
  _attempt?: { stage: string; count: number };
}

interface StepContext {
  logger: PipelineLogger;
  projectId: string;
}

interface WriterStep {
  key: string;
  has: (s: WriterRunState) => boolean;
  run: (s: WriterRunState, ctx: StepContext) => Promise<Partial<WriterRunState>>;
}

// =====================================================================
// 단계 정의 (순서 = _runPipelineInner 와 동일).
//   has  = 해당 산출물이 state 에 이미 있는가
//   run  = state 입력으로 한 stage 실행 → patch 반환
// =====================================================================
export const WRITER_STEPS: WriterStep[] = [
  {
    key: 'genre',
    has: (s) => s.genre !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const genre = await runGenre(s.input, logger, models.S);
      await logger.flushRawLlm('genre');
      return { genre };
    },
  },
  {
    key: 'narrativeStructure',
    has: (s) => s.narrativeStructure !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const narrativeStructure = await runNarrativeStructure(s.input, s.genre!, logger, models.S);
      await logger.flushRawLlm('narrativeStructure');
      return { narrativeStructure };
    },
  },
  {
    key: 'characters',
    has: (s) => s.characters !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const characters = await runCharacters(s.input, s.genre!, s.narrativeStructure!, logger, models.S);
      await logger.flushRawLlm('characters');
      return { characters };
    },
  },
  {
    key: 'scenes',
    has: (s) => s.scenes !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const scenes = await runScenes(s.input, s.genre!, s.narrativeStructure!, s.characters!, logger, models.S);
      await logger.flushRawLlm('scenes');
      return { scenes };
    },
  },
  {
    key: 'storyCheck',
    has: (s) => s.storyCheck !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      if (resolveSkip(s.input).validation1) {
        await logger.markStage('storyCheck', 'completed', { skipped: true });
        return { storyCheck: emptyC1Report() };
      }
      const storyCheck = await runStoryCheck(s.genre!, s.narrativeStructure!, s.characters!, s.scenes!, logger, models.C);
      await logger.flushRawLlm('storyCheck');
      return { storyCheck };
    },
  },
  {
    key: 'midPreview',
    has: (s) => s.midPreview !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      if (resolveSkip(s.input).midPreview) {
        await logger.markStage('midPreview', 'completed', { skipped: true });
        return { midPreview: emptyMidPreview() };
      }
      const midPreview = await runMidPreview(
        s.genre!,
        s.narrativeStructure!,
        s.characters!,
        s.scenes!,
        s.storyCheck!,
        logger,
        models.V,
      );
      await logger.flushRawLlm('midPreview');
      return { midPreview };
    },
  },
  {
    key: 'visualFormat',
    has: (s) => s.renderFormat !== undefined && s.artDirection !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const r = await runRenderFormatArtDirection(s.genre!, s.midPreview!, logger, models.V);
      await logger.flushRawLlm('renderFormat_artDirection');
      return { renderFormat: r.renderFormat, artDirection: r.artDirection };
    },
  },
  {
    key: 'productionDesign',
    has: (s) => s.productionDesign !== undefined,
    run: async (s, { logger, projectId }) => {
      const models = resolveModels(s.input);
      const productionDesign = await runProductionDesign(
        s.characters!,
        s.scenes!,
        s.artDirection!,
        s.midPreview!,
        logger,
        models.V,
      );
      await logger.flushRawLlm('productionDesign');

      // productionDesign 직후 → 전역 디자인 토큰 + Tier 1 에셋(characters/locations/scenes)을 DB 기록.
      //   serverless 에선 함수가 응답 후 동결되므로 fire-and-forget 불가 → await + catch 로 흡수.
      await persistDesignTokens(projectId, s.renderFormat!, s.artDirection!, productionDesign).catch(() => {});
      await persistAssetsToDb(projectId, s.characters!, s.scenes!, productionDesign).catch(() => {});

      // ⚠️ runAssetsGenerate / persistAssetImagesToDb 는 의도적으로 스킵한다.
      //   무거운 reference-image 생성은 별도 이미지 phase 의 책임이고(artist 가 client-side 로
      //   view 이미지를 생성), 텍스트 파이프라인의 시간 예산을 잡아먹지 않아야 한다.
      return { productionDesign };
    },
  },
  {
    key: 'sceneCinematography',
    // compact 가 정해졌으면(=이 step 실행됨) has=true. compact 모드는 sceneCinematography=[] 라
    //   배열 존재만으로는 구분 불가 → compact 플래그로 "실행됨"을 판정.
    has: (s) => s.compact !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const genre = s.genre!;
      const scenes = s.scenes!;
      const compact = isCompactDepth(genre.depth_level);

      if (compact) {
        await logger.markStage('sceneCinematography', 'completed', {
          skipped: true,
          reason: `Compact Mode (${genre.depth_level})`,
        });
        const sceneBudgetIssues = scenes.scenes.flatMap((sc) => analyzeSceneActionBudget(sc).issues);
        // compact: sceneCinematography 는 shotDesign 이후 역추론으로 채운다 (지금은 빈 배열).
        return { compact, sceneCinematography: [], sceneBudgetIssues };
      }

      const planResult = await runSceneCinematography(
        genre,
        s.characters!,
        scenes,
        s.artDirection!,
        s.productionDesign!,
        s.midPreview!,
        logger,
        models.V,
      );
      await logger.flushRawLlm('sceneCinematography');
      return {
        compact,
        sceneCinematography: planResult.scene_plans,
        sceneBudgetIssues: planResult.budget_issues,
      };
    },
  },
  {
    key: 'decoupage',
    has: (s) => s.decoupage !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const compact = s.compact === true;
      const decoupage = await runDecoupage(
        s.genre!,
        s.characters!,
        s.scenes!,
        s.artDirection!,
        s.productionDesign!,
        compact ? null : s.sceneCinematography!,
        logger,
        models.V,
      );
      await logger.flushRawLlm('decoupage');
      return { decoupage };
    },
  },
  {
    key: 'shotDesign',
    has: (s) => s.shotDesign !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const compact = s.compact === true;
      const shotDesign = await runShotDesign(
        s.genre!,
        s.characters!,
        s.scenes!,
        s.artDirection!,
        s.productionDesign!,
        compact ? null : s.sceneCinematography!,
        s.decoupage!,
        logger,
        models.V,
      );
      await logger.flushRawLlm('shotDesign');

      const patch: Partial<WriterRunState> = { shotDesign };
      // Compact mode 사후처리: shotDesign 으로부터 sceneCinematography 역추론 (다운스트림 호환).
      if (compact) {
        patch.sceneCinematography = inferSceneCinematographyFromShots(shotDesign, s.scenes!);
      }
      return patch;
    },
  },
  {
    key: 'shotCheck',
    has: (s) => s.shotSequence !== undefined && s.shotCheck !== undefined,
    run: async (s, { logger, projectId }) => {
      const models = resolveModels(s.input);
      const result = await runShotCheck(
        projectId,
        s.genre!,
        s.narrativeStructure!,
        s.characters!,
        s.scenes!,
        s.renderFormat!,
        s.artDirection!,
        s.productionDesign!,
        s.sceneCinematography!,
        s.shotDesign!,
        s.sceneBudgetIssues ?? [],
        logger,
        models.V,
        models.C,
      );
      await logger.flushRawLlm('shotCheck');
      return { shotSequence: result.shotSequence, shotCheck: result.report };
    },
  },
  {
    key: 'renderPrompts',
    has: (s) => s.renderPrompts !== undefined,
    run: async (s, { logger, projectId }) => {
      const models = resolveModels(s.input);
      const renderPrompts = await runRenderPrompts(
        s.shotSequence!,
        s.renderFormat!,
        s.characters!,
        s.productionDesign!,
        logger,
        models.V,
      );
      await logger.flushRawLlm('renderPrompts');

      // ★ Tier 2 persist: shots → DB. serverless 동결 회피 위해 await + catch.
      await persistShotsToDb(projectId, s.shotSequence!).catch(() => {});
      return { renderPrompts };
    },
  },
];

export const WRITER_TOTAL_UNITS = WRITER_STEPS.length;

/**
 * 다음 step 을 self-trigger 한다 (start / step paused / watchdog 공용).
 *   WRITER_STEP_SECRET 가 설정돼 있으면 x-writer-secret 헤더로 전달한다.
 *   fire-and-forget — 호출자가 after()/non-blocking 으로 감싼다. 에러는 흡수.
 */
export async function triggerWriterStep(origin: string, projectId: string): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const secret = process.env.WRITER_STEP_SECRET;
  if (secret) headers['x-writer-secret'] = secret;
  try {
    await fetch(new URL('/api/writer/step', origin), {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId }),
    });
  } catch {
    // 다음 step 트리거 실패는 watchdog/keepalive 가 복구한다.
  }
}

const MAX_STAGE_ATTEMPTS = 3;

/**
 * 한 step 호출 동안 시간 예산(deadlineMs) 내에서 단계들을 실행한다.
 *   - done   : 모든 단계 완료 (markCompleted)
 *   - failed : 단계 실행 에러 or 재시도 예산 초과 (markFailed)
 *   - paused : 남은 단계 있음 — 호출자가 다음 step 을 self-trigger 해야 함
 */
export async function runWriterSteps(
  projectId: string,
  opts: { deadlineMs: number },
): Promise<{ done?: true; failed?: true; paused?: true }> {
  const run = await getActiveRun(projectId);
  if (!run || run.status !== 'running') return { done: true };

  const state = run.state as WriterRunState;
  // best-effort logger (FS 쓰기는 no-op-safe). raw_collector 그룹화에만 쓰인다.
  const logger = new PipelineLogger(projectId);
  await logger.init();

  let completedUnits = run.completed_units;

  for (;;) {
    const step = WRITER_STEPS.find((st) => !st.has(state));

    // 남은 단계 없음 → 완료.
    if (!step) {
      await markCompleted(run.id);
      return { done: true };
    }

    // 재시도/타임아웃 가드: 같은 단계가 MAX_STAGE_ATTEMPTS 회 이상 진입했으면 실패 처리.
    if (state._attempt?.stage === step.key && state._attempt.count >= MAX_STAGE_ATTEMPTS) {
      await markFailed(run.id, `stage ${step.key} exceeded retry/time budget`);
      return { failed: true };
    }

    // 진입 마킹: attempt 증가 + current_stage 기록 (중도 kill 시 증가분/단계가 남는다).
    const nextCount = state._attempt?.stage === step.key ? state._attempt.count + 1 : 1;
    state._attempt = { stage: step.key, count: nextCount };
    try {
      await saveRunState(run.id, state, { completed_units: completedUnits, current_stage: step.key });
    } catch {
      // 진입 체크포인트 쓰기 실패(아직 stage 미실행)는 영구 실패로 보지 않는다 — 일시적 DB 블립일 수
      //   있으니 paused 로 두고 watchdog/keepalive 가 재시도하게 한다.
      return { paused: true };
    }

    // 단계 실행.
    let patch: Partial<WriterRunState>;
    try {
      patch = await step.run(state, { logger, projectId });
    } catch (e) {
      await markFailed(run.id, e instanceof Error ? e.message : String(e));
      return { failed: true };
    }

    // 산출물 병합 + attempt 리셋 + 진행률 증가 → 체크포인트.
    Object.assign(state, patch);
    state._attempt = undefined;
    completedUnits += 1;
    try {
      await saveRunState(run.id, state, { completed_units: completedUnits, current_stage: step.key });
    } catch (e) {
      await markFailed(run.id, e instanceof Error ? e.message : String(e));
      return { failed: true };
    }

    // 시간 예산 초과면 일시정지 (호출자가 다음 step self-trigger).
    if (Date.now() > opts.deadlineMs) break;
  }

  // 루프 탈출: 남은 단계 있으면 paused, 없으면 완료.
  const remaining = WRITER_STEPS.find((st) => !st.has(state));
  if (remaining) return { paused: true };
  await markCompleted(run.id);
  return { done: true };
}
