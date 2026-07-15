// 파이프라인 오케스트레이터: 스토리 → 샷 시퀀스 JSON
// resumeProjectId 전달 시 기존 stage 결과 로드해 중단 지점부터 재개
import { PipelineLogger, makeProjectId } from '@/lib/writer/logger';
import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure';
import { runScenes, mergeOpenCast, mergeOpenWorld } from '@/lib/writer/pipeline/stages/s3_scenes';
import { castContractToCharacters } from '@/lib/writer/cast-contract';
import { runStoryCheck } from '@/lib/writer/pipeline/stages/c_validation_1';
import { runMidPreview } from '@/lib/writer/pipeline/stages/mid_preview';
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
import { isCompactDepth } from '@/lib/writer/types/pipeline';
import { analyzeSceneActionBudget } from '@/lib/writer/pipeline/validators/action_budget';
import { resetGeminiCallCount, getGeminiCallCount } from '@/lib/writer/llm/gemini';
import { resetClaudeCallCount, getClaudeCallCount } from '@/lib/writer/llm/claude';
import { resetOpenAICallCount, getOpenAICallCount } from '@/lib/writer/llm/openai';
import { resetLocalCallCount, getLocalCallCount } from '@/lib/writer/llm/local';
import { resetRawSeq } from '@/lib/writer/llm/raw_collector';
import { DEFAULT_MODELS, type PipelineModelsConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  PipelineInput,
  PipelineResult,
  SceneCinematography,
  ValidationIssue,
  Genre,
  NarrativeStructure,
  Characters,
  Scenes,
  StoryCheckReport,
  MidPreview,
  VisualIdentity,
  ActVisualArc,
  CharacterVisual,
  WorldVisual,
  ShotDesign,
  DecoupagePlan,
  RenderPromptsOutput,
} from '@/lib/writer/types/pipeline';

// Skip 모드 default = true (피드백 미반영 stage 건너뜀, 비용 절감)
// export: stepwise 엔진(pipeline/steps.ts)이 동일 로직 재사용.
export function resolveSkip(input: PipelineInput): { validation1: boolean; midPreview: boolean } {
  return {
    validation1: input.skip?.validation1 ?? true,
    midPreview: input.skip?.midPreview ?? true,
  };
}

// c_validation_1 skip 시 다운스트림에 줄 빈 리포트
export function emptyC1Report(): StoryCheckReport {
  return {
    passed: true,
    issues: [],
    causality_chain: [],
    cdq_present: false,
    cdq_clarity_score: 0,
    cliche_count: 0,
    retry_count: 0,
  };
}

// mid_preview skip 시 빈 추천 (V0V1/V2/V3이 S·L 기반 자체 결정)
export function emptyMidPreview(): MidPreview {
  return {
    v_recommendations: { v0: { format: {}, style: {} }, v1: '', v2: '', v3: '', v4: '' },
    color_script: [],
    emotional_arc_visualization: '',
    production_difficulty: 'medium',
    warnings: [],
  };
}

export function resolveModels(input: PipelineInput): PipelineModelsConfig {
  const fallback = DEFAULT_MODELS;
  const m = input.models ?? {};
  const fill = (cfg: { provider?: string; model?: string; baseUrl?: string } | undefined, def: LlmAxisConfig): LlmAxisConfig => {
    if (!cfg || !cfg.provider) return def;
    return {
      provider: cfg.provider as LlmAxisConfig['provider'],
      model: cfg.model ?? def.model,
      baseUrl: cfg.baseUrl ?? def.baseUrl,
    };
  };
  return {
    S: fill(m.S, fallback.S),
    V: fill(m.V, fallback.V),
    C: fill(m.C, fallback.C),
  };
}

export interface RunPipelineOptions {
  /**
   * 사용할 project ID. 외부 (supabase 등)에서 발급된 ID를 주입할 때 사용.
   * 미지정 시 자동 생성.
   */
  projectId?: string;
  /**
   * true: 기존 stage 파일 캐시 활용 (resume mode). 입력 파일은 재작성 안 함.
   * false: 새 실행. 입력 파일 항상 작성.
   */
  resume?: boolean;
}

export async function runPipeline(
  input: PipelineInput,
  opts: RunPipelineOptions | string = {},
): Promise<PipelineResult> {
  // backward compat: string으로 resume ID 받던 옛 시그니처 지원
  const options: RunPipelineOptions =
    typeof opts === 'string' ? { projectId: opts, resume: true } : opts;

  resetGeminiCallCount();
  resetClaudeCallCount();
  resetOpenAICallCount();
  resetLocalCallCount();
  resetRawSeq();
  const models = resolveModels(input);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const projectId = options.projectId ?? makeProjectId();
  const logger = new PipelineLogger(projectId);
  await logger.init();
  const isResume = options.resume === true;

  // 입력 저장 (resume인 경우 기존 입력 유지)
  if (!isResume) {
    await logger.saveText(
      '00_input_story.md',
      `# Input\n\n${input.story}\n\n## Options\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\`\n`,
    );
    // 재개용 순수 JSON 입력도 저장
    await logger.saveStage('00_input.json', input);
  }

  await logger.markStage('PIPELINE', 'started', { resumed: isResume, projectId });

  // 파이프라인 전체를 try/finally로 감싸 에러 시에도 raw 로그 저장
  try {
    return await _runPipelineInner(input, logger, projectId, startedAt, startedMs, isResume, models);
  } catch (e) {
    await logger.flushRawLlm('ERROR').catch(() => {});
    await logger.markStage('PIPELINE', 'failed', { error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

// stage 결과를 캐시(파일)에서 로드 → 없으면 runner 실행. resume=false면 항상 실행.
async function loadOrRun<T>(
  resume: boolean,
  filename: string,
  runner: () => Promise<T>,
  flushLabel: string,
  logger: PipelineLogger,
): Promise<{ value: T; loaded: boolean }> {
  if (resume) {
    const existing = await logger.loadStage<T>(filename);
    if (existing !== null) {
      await logger.markStage(flushLabel, 'completed', { resumed: true, source: filename });
      return { value: existing, loaded: true };
    }
  }
  const value = await runner();
  await logger.flushRawLlm(flushLabel);
  return { value, loaded: false };
}

async function _runPipelineInner(
  input: PipelineInput,
  logger: PipelineLogger,
  projectId: string,
  startedAt: string,
  startedMs: number,
  resume: boolean,
  models: PipelineModelsConfig,
): Promise<PipelineResult> {

  // ===== Story 축 =====
  // producer-story-gate §4: s0(genre)·s2(characters)는 producer 게이트가 확정한 seed(input.genre/cast)로
  //   대체된다 — writer 는 더 이상 LLM 으로 장르/캐스트를 만들지 않는다. 로컬 runPipeline 도 seed 를 받는다.
  if (!input.genre) {
    throw new Error('runPipeline: input.genre seed required (producer-story-gate: s0_genre removed)');
  }
  const genre: Genre = input.genre;
  await logger.markStage('genre', 'completed', { seeded: true });
  let characters: Characters = input.cast
    ? castContractToCharacters(input.cast)
    : { characters: [], relationships: [], subtext_notes: [] };
  await logger.markStage('characters', 'completed', { seeded: true, count: characters.characters.length });

  const narrativeStructure = (await loadOrRun<NarrativeStructure>(resume, '03_s1_narrativeStructure.json', () => runNarrativeStructure(input, genre, logger, models.S), 'narrativeStructure', logger)).value;
  const scenes = (await loadOrRun<Scenes>(resume, '05_s3_scenes.json', () => runScenes(input, genre, narrativeStructure, characters, input.background, logger, models.S), 'scenes', logger)).value;
  // 오픈 캐스트(§4): 전개상 추가된 new_characters 를 머지 → 하류 stage 와 persistAssetsToDb(origin='writer' insert)가 본다.
  characters = mergeOpenCast(characters, scenes);

  const skip = resolveSkip(input);

  // ===== storyCheck (skip 시 빈 리포트) =====
  const storyCheck = skip.validation1
    ? (await (async () => {
        await logger.markStage('storyCheck', 'completed', { skipped: true });
        return emptyC1Report();
      })())
    : (await loadOrRun<StoryCheckReport>(
        resume,
        '06_c1_storyCheck.json',
        () => runStoryCheck(genre, narrativeStructure, characters, scenes, logger, models.C),
        'storyCheck',
        logger,
      )).value;

  // ===== Mid Preview (Visual 축 — 시각 제안 생성. skip 시 빈 추천) =====
  const midPreview = skip.midPreview
    ? (await (async () => {
        await logger.markStage('midPreview', 'completed', { skipped: true });
        return emptyMidPreview();
      })())
    : (await loadOrRun<MidPreview>(
        resume,
        '07_bridge_midPreview.json',
        () => runMidPreview(genre, narrativeStructure, characters, scenes, storyCheck, logger, models.V),
        'midPreview',
        logger,
      )).value;

  // ===== Visual 축 (native — steps.ts 서버리스 경로와 동일) =====
  // v0: VisualIdentity 직접 생성 (genre + bridge seed.v0)
  const visualIdentity = (await loadOrRun<VisualIdentity>(
    resume,
    '08_v0_visualIdentity.json',
    () => runVisualIdentity(genre, midPreview, logger, models.V, input.styleAnchor),
    'visualIdentity',
    logger,
  )).value;

  // v1: 막별 비주얼 아크 (s1 + v0 + bridge seed.v1)
  const actVisualArc = (await loadOrRun<ActVisualArc>(
    resume,
    '08b_v1_actVisualArc.json',
    () => runActVisualArc(narrativeStructure, visualIdentity, midPreview.v_recommendations.v1, logger, models.V),
    'actVisualArc',
    logger,
  )).value;

  // s2 월드: producer background seed + 오픈캐스트(씬 로케이션 append-only). v2 입력.
  const world = mergeOpenWorld(input.background, scenes);

  // v2: 인물/월드 비주얼 직접 생성 (v0 + v1 + s2 chars/world + bridge seed.v2). 옛 productionDesign+derive 대체.
  const { characterVisual, worldVisual } = (await loadOrRun<{ characterVisual: CharacterVisual; worldVisual: WorldVisual }>(
    resume,
    '09_v2_design.json',
    () => runV2Design(visualIdentity, actVisualArc, characters, world, midPreview.v_recommendations.v2, logger, models.V),
    'v2Design',
    logger,
  )).value;

  // v2 직후 → 전역 디자인 토큰을 projects.design_tokens 에 기록 (§2-2, DB化).
  //   소비(artist 턴어라운드 등)는 DB에서 읽는다. non-blocking — 실패해도 파이프라인 계속.
  persistDesignTokens(projectId, visualIdentity, worldVisual).catch((e) => {
    console.warn('[writer] design_tokens persist failed (pipeline continues):', e);
  });

  // ★ Tier 1 persist (행만): characters/locations/scenes 를 여기서 미리 DB 기록 →
  //   artist 가 shots/director 단계(10~14)를 안 기다리고 ~절반 시점에 언블록된다.
  //   ⚠️ 이미지(view_main/wide_shot)는 writer 가 만들지 않는다 (producer-story-gate 결정 8):
  //   캐릭터/로케이션 이미지는 artist 전담 — artist 진입 시 autoGenerateBaseImages 가 빈칸을 자동 생성.
  //   non-blocking — 실패해도 파이프라인 계속(끝의 persistShots 와 무관).
  persistAssetsToDb(projectId, characters, scenes, worldVisual, characterVisual)
    .then(() => logger.markStage('persistAssets', 'completed'))
    .catch((e) => {
      console.warn('[writer] Tier1 assets persist failed (pipeline continues):', e);
    });

  // sceneCinematography (씬 비주얼 플랜) — Compact Mode (D1~D3)에선 스킵
  const compact = isCompactDepth(genre.depth_level);
  let sceneCinematography: SceneCinematography[] = [];
  let sceneBudgetIssues: ValidationIssue[] = [];

  // sceneCinematography resume: compact면 별도 파일(_inferred), 아니면 정상 파일
  type SceneCinematographySavedShape = { scene_plans: SceneCinematography[]; budget_issues?: ValidationIssue[] };
  const sceneCinematographyFileNormal = '10_v3_sceneCinematography.json';
  const sceneCinematographyFileInferred = '10_v3_sceneCinematography_inferred.json';

  let sceneCinematographyLoaded = false;
  if (resume) {
    const normal = await logger.loadStage<SceneCinematographySavedShape>(sceneCinematographyFileNormal);
    if (normal) {
      sceneCinematography = normal.scene_plans;
      sceneBudgetIssues = normal.budget_issues ?? scenes.scenes.flatMap((sc) => analyzeSceneActionBudget(sc).issues);
      sceneCinematographyLoaded = true;
      await logger.markStage('sceneCinematography', 'completed', { resumed: true, source: sceneCinematographyFileNormal });
    } else if (compact) {
      const inferred = await logger.loadStage<SceneCinematographySavedShape>(sceneCinematographyFileInferred);
      if (inferred) {
        sceneCinematography = inferred.scene_plans;
        sceneBudgetIssues = inferred.budget_issues ?? scenes.scenes.flatMap((sc) => analyzeSceneActionBudget(sc).issues);
        sceneCinematographyLoaded = true;
        await logger.markStage('sceneCinematography', 'completed', { resumed: true, source: sceneCinematographyFileInferred });
      }
    }
  }

  if (!sceneCinematographyLoaded) {
    if (compact) {
      await logger.markStage('sceneCinematography', 'completed', { skipped: true, reason: `Compact Mode (${genre.depth_level})` });
      sceneBudgetIssues = scenes.scenes.flatMap((sc) => analyzeSceneActionBudget(sc).issues);
    } else {
      const planResult = await runSceneCinematography(genre, characters, scenes, visualIdentity, worldVisual, midPreview, logger, models.V);
      await logger.flushRawLlm('sceneCinematography');
      sceneCinematography = planResult.scene_plans;
      sceneBudgetIssues = planResult.budget_issues;
    }
  }

  // Découpage: 감독의 beat→shot 분해 (shotDesign 입력). Compact mode에선 sceneCinematography plans 미제공(자체 판단).
  // 시간 제약은 driver가 아니라 validator — 감독이 샷 수/경계를 저작한다 (linear_pipeline Turn 7).
  const decoupage = (await loadOrRun<DecoupagePlan>(
    resume,
    '10b_c_decoupage.json',
    () => runDecoupage(genre, characters, scenes, worldVisual, compact ? null : sceneCinematography, logger, models.V),
    'decoupage',
    logger,
  )).value;

  // shotDesign: 샷 단위 3분할 (intent + static + dynamic). 데쿠파주가 정한 샷에 spec을 붙인다.
  const shotDesignResult = await loadOrRun<{ shots: ShotDesign[]; compact_mode: boolean }>(
    resume,
    '11_v4_shotDesign.json',
    async () => {
      // 로컬 전체 실행 — 시간 예산 없음(opts 생략 → 항상 done까지 완주).
      const result = await runShotDesign(genre, characters, scenes, visualIdentity, worldVisual, characterVisual, compact ? null : sceneCinematography, decoupage, midPreview.v_recommendations.v4, logger, models.V);
      return { shots: result.shots, compact_mode: compact };
    },
    'shotDesign',
    logger,
  );
  const shotDesign = shotDesignResult.value.shots;

  // Compact mode 사후처리: shotDesign에서 sceneCinematography 역추론 (다운스트림 호환)
  // resume에서 inferred 못 찾았고 + 방금 shotDesign 새로 만든 경우만 수행 (이미 inferred 있으면 위에서 로드됨)
  if (compact && !sceneCinematographyLoaded) {
    sceneCinematography = inferSceneCinematographyFromShots(shotDesign, scenes);
    await logger.saveStage(sceneCinematographyFileInferred, {
      scene_plans: sceneCinematography,
      note: 'inferred from shotDesign (Compact Mode skipped sceneCinematography generation)',
    });
  }

  // ===== shotCheck =====
  // shotCheck는 두 파일(12_shotCheck.json + 13_shotSequence.json) 함께 저장됨
  type ShotCheckShape = {
    shotSequence: PipelineResult['shotSequence'];
    report: PipelineResult['shotCheck'];
  };
  let shotCheckResult: ShotCheckShape;
  if (resume) {
    const cachedSeq = await logger.loadStage<PipelineResult['shotSequence']>('13_c2_shotSequence.json');
    const cachedReport = await logger.loadStage<PipelineResult['shotCheck']>('12_c2_shotCheck.json');
    if (cachedSeq && cachedReport) {
      shotCheckResult = { shotSequence: cachedSeq, report: cachedReport };
      await logger.markStage('shotCheck', 'completed', { resumed: true });
    } else {
      shotCheckResult = await runShotCheck(projectId, genre, narrativeStructure, characters, scenes, visualIdentity, worldVisual, sceneCinematography, shotDesign, sceneBudgetIssues, logger, models.V, models.C);
      await logger.flushRawLlm('shotCheck');
    }
  } else {
    shotCheckResult = await runShotCheck(projectId, genre, narrativeStructure, characters, scenes, visualIdentity, worldVisual, sceneCinematography, shotDesign, sceneBudgetIssues, logger, models.V, models.C);
    await logger.flushRawLlm('shotCheck');
  }

  const { shotSequence, report: shotCheck } = shotCheckResult;

  // ===== renderPrompts: T2I + TI2V 최종 프롬프트 정리 =====
  // 기존 샷의 first_frame_generation/video_generation을 추출.
  // 없는 경우만 LLM(Visual 축)로 보충 생성.
  const renderPrompts = (await loadOrRun<RenderPromptsOutput>(
    resume,
    '14_v5_renderPrompts.json',
    () => runRenderPrompts(shotSequence, visualIdentity, worldVisual, logger, models.V),
    'renderPrompts',
    logger,
  )).value;

  // ★ Tier 2 persist (스토리보드/director): shots 를 마지막에 DB 기록.
  //   characters/locations/scenes 는 Tier 1(stage 09)이 이미 기록 — 여기선 건드리지 않음(artist 편집 보존).
  //   shotSequence 는 샷별 대사를 보유. non-blocking — 실패해도 파이프라인 계속.
  persistShotsToDb(projectId, shotSequence)
    .then(() => logger.markStage('persistShots', 'completed'))
    .catch((e) => {
      console.warn('[writer] Tier2 shots persist failed (pipeline continues):', e);
    });

  const completedAt = new Date().toISOString();
  const totalDurationMs = Date.now() - startedMs;

  const result: PipelineResult = {
    project_id: projectId,
    input,
    genre,
    narrativeStructure,
    characters,
    scenes,
    storyCheck,
    midPreview,
    visualIdentity,
    actVisualArc,
    characterVisual,
    worldVisual,
    sceneCinematography,
    decoupage,
    shotDesign,
    shotCheck,
    shotSequence,
    renderPrompts,
    metadata: {
      started_at: startedAt,
      completed_at: completedAt,
      total_duration_ms: totalDurationMs,
      llm_calls: {
        gemini: getGeminiCallCount(),
        claude: getClaudeCallCount(),
        openai: getOpenAICallCount(),
        local: getLocalCallCount(),
      },
    },
  };

  await logger.saveIntegrated(result);
  await logger.markStage('PIPELINE', 'completed', {
    total_ms: totalDurationMs,
    final_shots: shotSequence.total_shots,
    resumed: resume,
  });

  return result;
}
