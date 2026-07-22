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
import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure';
import { runScenes, mergeOpenCast, mergeOpenWorld } from '@/lib/writer/pipeline/stages/s3_scenes';
import { runStructureScenesMerged } from '@/lib/writer/pipeline/stages/s1s3_merged';
import { runStoryCheck } from '@/lib/writer/pipeline/stages/c_validation_1';
import { runVisualIdentity } from '@/lib/writer/pipeline/stages/v0_visual';
import { runActVisualArc } from '@/lib/writer/pipeline/stages/v1_act_arc';
import { runV2Design } from '@/lib/writer/pipeline/stages/v2_design';
import { runSceneCinematography } from '@/lib/writer/pipeline/stages/v3_scene_plan';
import { runDecoupage } from '@/lib/writer/pipeline/stages/decoupage';
import { runShotDesign } from '@/lib/writer/pipeline/stages/v4_shots';
import { runShotCheck } from '@/lib/writer/pipeline/stages/c_application_2';
import { runRenderPrompts } from '@/lib/writer/pipeline/stages/v5_prompts';
import { inferSceneCinematographyFromShots } from '@/lib/writer/pipeline/util/infer_v3';
import { persistDesignTokens } from '@/lib/writer/pipeline/util/persist_design_tokens';
import { persistAssetsToDb, persistShotsToDb } from '@/lib/writer/pipeline/util/persist_manifest';
import { triggerAssetDrafts } from '@/lib/artist/draft-trigger';
import { isCompactDepth } from '@/lib/writer/types/pipeline';
import { analyzeSceneActionBudget } from '@/lib/writer/pipeline/validators/action_budget';
import { resolveModels, resolveSkip, emptyC1Report } from '@/lib/writer/pipeline';
import {
  getActiveRun,
  saveRunState,
  markCompleted,
  markFailed,
  advanceProjectStageAfterWriter,
  type WriterRunStateBase,
  type WriterErrorDetail,
} from '@/lib/writer/run-store';
import { getPendingRawCalls } from '@/lib/writer/llm/raw_collector';
import type {
  PipelineInput,
  SceneCinematography,
  ValidationIssue,
  Genre,
  NarrativeStructure,
  Characters,
  BackgroundContract,
  Scenes,
  StoryCheckReport,
  ActVisualArc,
  VisualIdentity,
  CharacterVisual,
  WorldVisual,
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
  world?: BackgroundContract;        // s2 월드/세팅 seed (producer background) — V축 재설계
  scenes?: Scenes;
  storyCheck?: StoryCheckReport;

  // Visual 축
  visualIdentity?: VisualIdentity;   // v0 (format+style)
  actVisualArc?: ActVisualArc;       // v1 (막별 비주얼 아크)
  characterVisual?: CharacterVisual; // v2 (인물 비주얼)
  worldVisual?: WorldVisual;         // v2 (월드 비주얼)
  sceneCinematography?: SceneCinematography[];
  sceneBudgetIssues?: ValidationIssue[];

  // Shot 축
  decoupage?: DecoupagePlan;
  shotDesign?: ShotDesign[];
  /** shotDesign 씬 단위 부분 진행(#long-writer-run 2026-07-15) — 긴 러닝타임 프로젝트에서
   *  한 step(240s 예산) 안에 전 씬을 못 끝낼 때 완료 씬을 체크포인트하고 다음 step이 이어간다. */
  shotDesignPartial?: { doneSceneIds: string[]; shots: ShotDesign[] };
  shotSequence?: ShotSequence;
  shotCheck?: ShotCheckReport;
  renderPrompts?: RenderPromptsOutput;

  // Compact Mode (genre.depth_level 기반). sceneCinematography step 에서 확정.
  compact?: boolean;

  // shots DB 기록 완료 마커(#persist-step 2026-07-15) — persistShots step의 has 판정.
  //   persist 내부의 i18n(EN/native 파생) LLM 호출이 40s+라 renderPrompts 꼬리에서
  //   함수 수명에 잘리거나 실패해도 조용히 지나가던 것을 독립 step + 재시도로 승격.
  _shotsPersisted?: boolean;
  _persistTries?: number;

  // 재시도/타임아웃 가드 (중도 kill 시 attempt 증가분이 남는다)
  _attempt?: { stage: string; count: number };
  // 단계별 소요시간 (timing pipeline). key=stage → 마지막 성공 실행의 wall-clock(ms).
  _timings?: Record<string, { ms: number; attempts: number; endedAt: string }>;
}

interface StepContext {
  logger: PipelineLogger;
  projectId: string;
  /** 이 step 인보케이션의 시간 예산(epoch ms) — 부분 진행 가능한 스테이지가 씬 사이에서 양보할 때 사용. */
  deadlineMs?: number;
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
// producer-story-gate §4: s0(genre)·s2(characters) 스테이지 삭제. producer 게이트가 확정해
//   createRun 이 state.genre/state.characters 로 seed 하므로 writer 는 s1(structure)부터 수행한다.
//   (genre seed 가 없으면 narrativeStructure 의 s.genre! 에서 명시적으로 실패 — 핸드오프는 항상 seed.)
export const WRITER_STEPS: WriterStep[] = [
  {
    key: 'narrativeStructure',
    has: (s) => s.narrativeStructure !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      // E13b 체크포인트 재설계: S1+S3 병합 게이트(기본 off — 프로덕션 기본은 현행 2콜).
      //   게이트 on 이면 병합 1콜로 구조+씬을 함께 산출해 narrativeStructure/scenes 두 슬롯에
      //   모두 기록한다 — 다음 루프에서 scenes step 은 has()=true 로 투명하게 skip 되고, 하류
      //   스테이지와 재실행 단위(체크포인트)는 2콜 때와 동일하게 보인다. 오픈 캐스트/월드 머지도
      //   scenes step 과 동일하게 여기서 수행(append-only, 원천 불변).
      if (process.env.WRITER_MERGE_S1S3 === '1') {
        const { narrativeStructure, scenes } = await runStructureScenesMerged(
          s.input,
          s.genre!,
          s.characters!,
          s.world,
          logger,
          models.S,
        );
        await logger.flushRawLlm('structureScenesMerged');
        const characters = mergeOpenCast(s.characters!, scenes);
        const world = mergeOpenWorld(s.world, scenes);
        const patch: Partial<WriterRunState> = { narrativeStructure, scenes };
        if (characters !== s.characters) patch.characters = characters;
        if (world !== s.world) patch.world = world;
        return patch;
      }
      const narrativeStructure = await runNarrativeStructure(s.input, s.genre!, logger, models.S);
      await logger.flushRawLlm('narrativeStructure');
      return { narrativeStructure };
    },
  },
  {
    key: 'scenes',
    has: (s) => s.scenes !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const scenes = await runScenes(s.input, s.genre!, s.narrativeStructure!, s.characters!, s.world, logger, models.S);
      await logger.flushRawLlm('scenes');
      // 오픈 캐스트(§4 + V축 재설계): 전개상 필요한 인물/월드를 producer 베이스라인에 append.
      //   producer 전달값(원천)은 불변 — mergeOpen* 가 append-only(아키텍처 §5#2).
      const characters = mergeOpenCast(s.characters!, scenes);
      const world = mergeOpenWorld(s.world, scenes);
      const patch: Partial<WriterRunState> = { scenes };
      if (characters !== s.characters) patch.characters = characters;
      if (world !== s.world) patch.world = world;
      return patch;
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
    key: 'visualFormat',
    has: (s) => s.visualIdentity !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const visualIdentity = await runVisualIdentity(s.genre!, logger, models.V, s.input.styleAnchor);
      await logger.flushRawLlm('visualIdentity');
      return { visualIdentity };
    },
  },
  {
    // v1 ↔ s1: 막별 비주얼 아크. 같은-계층 [s1 narrativeStructure] + 직전 v0(renderFormat/artDirection).
    //   (V축 재설계 — additive 도입. 현재 하류 미소비, 후속 푸시에서 v2/v3가 consume.)
    key: 'actVisualArc',
    has: (s) => s.actVisualArc !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const actVisualArc = await runActVisualArc(
        s.narrativeStructure!,
        s.visualIdentity!, // v0 번들 (format+style) — coarse-to-fine 직전 단계
        logger,
        models.V,
      );
      await logger.flushRawLlm('actVisualArc');
      return { actVisualArc };
    },
  },
  {
    // v2 ↔ s2: 비주얼 디자인 (인물/월드). native 생성 — [v0 스타일]+[v1 아크]+[s2 chars/world]+[seed.v2].
    //   옛 productionDesign+derive shim 대체 (V축 재설계). char/world visual 을 직접 산출.
    key: 'v2Design',
    has: (s) => s.characterVisual !== undefined && s.worldVisual !== undefined,
    run: async (s, { logger, projectId }) => {
      const models = resolveModels(s.input);
      const { characterVisual, worldVisual } = await runV2Design(
        s.visualIdentity!,                    // v0 전역 스타일 루트
        s.actVisualArc!,                      // v1 막별 아크 (v-체인 상속)
        s.characters!,                        // s2 인물
        s.world,                              // s2 월드 (producer + 오픈캐스트)
        '',                                    // bridge seed 제거(E6 삭제 채택) — v2Design 시그니처 하위호환용 빈 값
        logger,
        models.V,
      );
      await logger.flushRawLlm('v2Design');

      // v2 직후 → 전역 디자인 토큰 + Tier 1 에셋(characters/locations/scenes)을 DB 기록.
      //   design_tokens 는 이미지 초안의 hard gate 이므로 실패를 흡수하지 않는다(실패 → writer rerun).
      //   assets persist 는 기존처럼 best-effort, 이후 writer 가 v2Design 확인점에서 producer-origin drafts 를 submit 한다.
      await persistDesignTokens(projectId, s.visualIdentity!, worldVisual);
      await persistAssetsToDb(projectId, s.characters!, s.scenes!, worldVisual, characterVisual).catch(() => {});
      await triggerAssetDrafts(projectId).catch(() => {});
      return { characterVisual, worldVisual };
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
        s.visualIdentity!, // v0 (전역 스타일) — 직전 v 체인의 루트 상수
        s.worldVisual!,    // v2 (월드 디자인: 팔레트/로케이션)
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
        s.worldVisual!, // v2 (로케이션 디자인). artDirection 은 decoupage 미사용 → 드롭
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
    run: async (s, { logger, deadlineMs }) => {
      const models = resolveModels(s.input);
      const compact = s.compact === true;
      const result = await runShotDesign(
        s.genre!,
        s.characters!,
        s.scenes!,
        s.visualIdentity!,   // v0 (전역 스타일)
        s.worldVisual!,      // v2 (팔레트/로케이션)
        s.characterVisual!,  // v2 (인물 의상) — character_blocking 생성용
        compact ? null : s.sceneCinematography!,
        s.decoupage!,
        '', // bridge seed 제거(E6 삭제 채택) — shotDesign 시그니처 하위호환용 빈 값
        logger,
        models.V,
        // 씬 단위 이어달리기(#long-writer-run): 이전 부분 진행 재개 + step 예산에서 양보.
        { resume: s.shotDesignPartial ?? null, softDeadlineMs: deadlineMs },
      );
      await logger.flushRawLlm('shotDesign');

      // 부분 진행 — 완료 씬 체크포인트만 남기고 스테이지 미완(has=false 유지).
      //   runWriterSteps가 이를 감지해 attempt를 리셋하고 다음 step에서 이어간다.
      if (!result.done) {
        return {
          shotDesignPartial: { doneSceneIds: result.doneSceneIds, shots: result.shots },
        };
      }

      const patch: Partial<WriterRunState> = {
        shotDesign: result.shots,
        shotDesignPartial: undefined, // 체크포인트 정리 (JSONB 직렬화에서 키 제거)
      };
      // Compact mode 사후처리: shotDesign 으로부터 sceneCinematography 역추론 (다운스트림 호환).
      if (compact) {
        patch.sceneCinematography = inferSceneCinematographyFromShots(result.shots, s.scenes!);
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
        s.characters!,
        s.scenes!,
        s.worldVisual!,    // v2 (palette/locations) — asset 정규화용
        s.shotDesign!,
        s.sceneBudgetIssues ?? [],
        logger,
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
        s.visualIdentity!, // v0 (format) — 옛 renderFormat
        s.worldVisual!,    // v2 (palette/color_meaning) — 옛 productionDesign
        logger,
        models.V,
      );
      await logger.flushRawLlm('renderPrompts');
      return { renderPrompts };
    },
  },
  {
    // ★ Tier 2 persist: shots → DB — 독립 step(#persist-step 2026-07-15).
    //   내부 i18n(EN/native 파생) 배치가 76샷 기준 40~60s 걸려, renderPrompts 꼬리에
    //   붙어 있으면 함수 수명(300s) 끝자락에서 잘리거나 실패해도 지나쳐 shots 0행으로
    //   끝났다(47a62d1d 실측 2회). 자체 step 예산 + 실패 시 최대 3회 재시도.
    key: 'persistShots',
    has: (s) => s._shotsPersisted === true,
    run: async (s, { projectId }) => {
      try {
        await persistShotsToDb(projectId, s.shotSequence!);
        return { _shotsPersisted: true };
      } catch (e) {
        const tries = (s._persistTries ?? 0) + 1;
        console.error(
          `[writer] persistShotsToDb 실패 (try ${tries}/3):`,
          e instanceof Error ? e.message : e,
        );
        if (tries >= 3) {
          // 포기 — 파이프라인은 완료시키되(러프 보드 외 진행 가능) 미기록을 로그로 남긴다.
          //   (기존 silent-skip과 동일한 최악치. shots는 state.shotSequence에 남아 수동 복구 가능)
          return { _shotsPersisted: true, _persistTries: tries };
        }
        // has=false 유지 → 부분 진행 경로로 paused → 다음 step이 재시도.
        return { _persistTries: tries };
      }
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

// 실패 시 진단 스냅샷 — 직전 LLM 호출(prompt/response/error)을 truncate 해 DB(error_detail)에 남긴다.
//   서버리스에선 FS raw 로그가 no-op 이라 이게 유일한 durable 진단 (error-logging-mvp).
const ERROR_DETAIL_MAX_CALLS = 3;
const ERROR_DETAIL_CHARS = 4000;
function captureErrorDetail(stage: string, message: string): WriterErrorDetail {
  const calls = getPendingRawCalls()
    .slice(-ERROR_DETAIL_MAX_CALLS)
    .map((c) => ({
      provider: c.provider,
      model: c.model,
      error: c.error,
      finish_reason: c.finish_reason,
      duration_ms: c.duration_ms,
      input_chars: c.input_chars,
      output_chars: c.output_chars,
      prompt: c.prompt.slice(0, ERROR_DETAIL_CHARS),
      response: c.response.slice(0, ERROR_DETAIL_CHARS),
    }));
  return { stage, message, at: new Date().toISOString(), calls };
}

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
      await advanceProjectStageAfterWriter(projectId);
      return { done: true };
    }

    // 재시도/타임아웃 가드: 같은 단계가 MAX_STAGE_ATTEMPTS 회 이상 진입했으면 실패 처리.
    if (state._attempt?.stage === step.key && state._attempt.count >= MAX_STAGE_ATTEMPTS) {
      // (#long-writer-run 2026-07-15) 레이스 방어: 마지막 진입 마킹(updated_at) 후 함수 수명
      //   (300s)+마진이 지나기 전이면 그 attempt 인보케이션이 아직 돌고 있을 수 있다 —
      //   keepalive가 띄운 경쟁 인보케이션이 성공 직전의 run을 failed로 마킹하던 것(실측:
      //   shotCheck 278s 성공 저장 직전에 failed). 확정 전엔 양보(paused)한다.
      const sinceLastMarkMs = Date.now() - Date.parse(run.updated_at);
      if (Number.isFinite(sinceLastMarkMs) && sinceLastMarkMs < 330_000) {
        return { paused: true };
      }
      const message = `stage ${step.key} exceeded retry/time budget`;
      await markFailed(run.id, message, captureErrorDetail(step.key, message));
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

    // 단계 실행 (단계별 소요시간 측정 — timing pipeline).
    const stageStartedMs = Date.now();
    let patch: Partial<WriterRunState>;
    try {
      patch = await step.run(state, { logger, projectId, deadlineMs: opts.deadlineMs });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await markFailed(run.id, message, captureErrorDetail(step.key, message));
      return { failed: true };
    }
    const stageMs = Date.now() - stageStartedMs;

    // 산출물 병합 + attempt 리셋 + 단계별 타이밍 기록 + 진행률 증가 → 체크포인트.
    Object.assign(state, patch);

    // 부분 진행(#long-writer-run 2026-07-15): 병합 후에도 has()가 false = 스테이지가 씬
    //   체크포인트만 남기고 양보한 것. 러너는 정상 반환 시 패스당 최소 1단위 진행을 보장하므로
    //   attempt를 리셋하고(중도 kill과 구분) 유닛/타이밍은 최종 완료 패스에서만 기록한다.
    //   같은 인보케이션에서 재진입하지 않고 paused로 양보 — 다음 step이 이어간다.
    if (!step.has(state)) {
      state._attempt = undefined;
      try {
        await saveRunState(run.id, state, { completed_units: completedUnits, current_stage: step.key });
      } catch {
        return { paused: true };
      }
      console.log(
        `[writer timing] ${projectId} · ${step.key} partial checkpoint (${((Date.now() - stageStartedMs) / 1000).toFixed(1)}s)`,
      );
      return { paused: true };
    }

    state._attempt = undefined;
    state._timings = {
      ...(state._timings ?? {}),
      [step.key]: { ms: stageMs, attempts: nextCount, endedAt: new Date().toISOString() },
    };
    console.log(
      `[writer timing] ${projectId} · ${step.key} ${(stageMs / 1000).toFixed(1)}s (attempt ${nextCount})`,
    );
    completedUnits += 1;
    try {
      await saveRunState(run.id, state, { completed_units: completedUnits, current_stage: step.key });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await markFailed(run.id, message, captureErrorDetail(step.key, message));
      return { failed: true };
    }

    // 시간 예산 초과면 일시정지 (호출자가 다음 step self-trigger).
    if (Date.now() > opts.deadlineMs) break;
  }

  // 루프 탈출: 남은 단계 있으면 paused, 없으면 완료.
  const remaining = WRITER_STEPS.find((st) => !st.has(state));
  if (remaining) return { paused: true };
  await markCompleted(run.id);
  await advanceProjectStageAfterWriter(projectId);
  return { done: true };
}
