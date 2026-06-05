// 파이프라인 오케스트레이터: 스토리 → 샷 시퀀스 JSON
// resumeProjectId 전달 시 기존 stage 결과 로드해 중단 지점부터 재개
import { PipelineLogger, makeProjectId } from '@/lib/writer/logger';
import { runGenre } from '@/lib/writer/pipeline/stages/s0_genre';
import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure';
import { runCharacters } from '@/lib/writer/pipeline/stages/s2_characters';
import { runScenes } from '@/lib/writer/pipeline/stages/s3_scenes';
import { runStoryCheck } from '@/lib/writer/pipeline/stages/c_validation_1';
import { runMidPreview } from '@/lib/writer/pipeline/stages/mid_preview';
import { runRenderFormatArtDirection } from '@/lib/writer/pipeline/stages/l0_l1_visual';
import { runProductionDesign } from '@/lib/writer/pipeline/stages/l2_design';
import { runAssetsGenerate } from '@/lib/writer/pipeline/stages/assets_generate';
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
  RenderFormat,
  ArtDirection,
  ProductionDesign,
  ShotDesign,
  DecoupagePlan,
  RenderPromptsOutput,
} from '@/lib/writer/types/pipeline';

// Skip 모드 default = true (피드백 미반영 stage 건너뜀, 비용 절감)
function resolveSkip(input: PipelineInput): { validation1: boolean; midPreview: boolean } {
  return {
    validation1: input.skip?.validation1 ?? true,
    midPreview: input.skip?.midPreview ?? true,
  };
}

// c_validation_1 skip 시 다운스트림에 줄 빈 리포트
function emptyC1Report(): StoryCheckReport {
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

// mid_preview skip 시 빈 추천 (L0L1/L2/L3이 S·L 기반 자체 결정)
function emptyMidPreview(): MidPreview {
  return {
    v_recommendations: { L0: {}, L1: {}, L2_summary: '', L3_scene_strategy: '', L4_shot_recipe: '' },
    color_script: [],
    emotional_arc_visualization: '',
    production_difficulty: 'medium',
    warnings: [],
  };
}

function resolveModels(input: PipelineInput): PipelineModelsConfig {
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
  const genre = (await loadOrRun<Genre>(resume, '02_genre.json', () => runGenre(input, logger, models.S), 'genre', logger)).value;
  const narrativeStructure = (await loadOrRun<NarrativeStructure>(resume, '03_narrativeStructure.json', () => runNarrativeStructure(input, genre, logger, models.S), 'narrativeStructure', logger)).value;
  const characters = (await loadOrRun<Characters>(resume, '04_characters.json', () => runCharacters(input, genre, narrativeStructure, logger, models.S), 'characters', logger)).value;
  const scenes = (await loadOrRun<Scenes>(resume, '05_scenes.json', () => runScenes(input, genre, narrativeStructure, characters, logger, models.S), 'scenes', logger)).value;

  const skip = resolveSkip(input);

  // ===== storyCheck (skip 시 빈 리포트) =====
  const storyCheck = skip.validation1
    ? (await (async () => {
        await logger.markStage('storyCheck', 'completed', { skipped: true });
        return emptyC1Report();
      })())
    : (await loadOrRun<StoryCheckReport>(
        resume,
        '06_storyCheck.json',
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
        '07_midPreview.json',
        () => runMidPreview(genre, narrativeStructure, characters, scenes, storyCheck, logger, models.V),
        'midPreview',
        logger,
      )).value;

  // ===== Visual 축 =====
  // renderFormat + artDirection 은 { renderFormat, artDirection } 합본으로 저장
  const visualFormatPair = await loadOrRun<{ renderFormat: RenderFormat; artDirection: ArtDirection }>(
    resume,
    '08_renderFormat_artDirection.json',
    async () => {
      const r = await runRenderFormatArtDirection(genre, midPreview, logger, models.V);
      return { renderFormat: r.renderFormat, artDirection: r.artDirection };
    },
    'renderFormat_artDirection',
    logger,
  );
  const { renderFormat, artDirection } = visualFormatPair.value;

  const productionDesign = (await loadOrRun<ProductionDesign>(resume, '09_productionDesign.json', () => runProductionDesign(characters, scenes, artDirection, midPreview, logger, models.V), 'productionDesign', logger)).value;

  // productionDesign 직후 → 전역 디자인 토큰을 projects.design_tokens 에 기록 (§2-2, DB化).
  //   소비(artist 턴어라운드 등)는 DB에서 읽는다. non-blocking — 실패해도 파이프라인 계속.
  persistDesignTokens(projectId, renderFormat, artDirection, productionDesign).catch((e) => {
    console.warn('[writer] design_tokens persist failed (pipeline continues):', e);
  });

  // productionDesign 직후 → 캐릭터/로케이션 reference 에셋 생성 (shotImages에서 I2I용으로 사용)
  // 실패해도 파이프라인은 계속 진행 (shotImages는 에셋 없으면 순수 T2I로 자동 fallback).
  runAssetsGenerate(characters, renderFormat, artDirection, productionDesign, logger, { concurrency: 4 }).catch((e) => {
    console.warn('[assets] background generation failed (pipeline continues):', e);
  });

  // ★ Tier 1 persist (이미지에 필수): characters/locations/scenes 를 여기서 미리 DB 기록 →
  //   artist 가 shots/director 단계(10~14)를 안 기다리고 ~절반 시점에 언블록되어 이미지 생성 시작.
  //   scenes 포함 — world 이미지 생성이 scene.mood 의존(없으면 generateWorldAsset 스킵). stage 05 에서 준비됨.
  //   완료 마커(persistAssets)는 _progress.jsonl 에 timestamp 로 남아 artist-언블록 지연 측정에 쓰임.
  //   non-blocking — 실패해도 파이프라인 계속(끝의 persistShots 와 무관).
  persistAssetsToDb(projectId, characters, scenes, productionDesign)
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
  const sceneCinematographyFileNormal = '10_sceneCinematography.json';
  const sceneCinematographyFileInferred = '10_sceneCinematography_inferred.json';

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
      const planResult = await runSceneCinematography(genre, characters, scenes, artDirection, productionDesign, midPreview, logger, models.V);
      await logger.flushRawLlm('sceneCinematography');
      sceneCinematography = planResult.scene_plans;
      sceneBudgetIssues = planResult.budget_issues;
    }
  }

  // Découpage: 감독의 beat→shot 분해 (shotDesign 입력). Compact mode에선 sceneCinematography plans 미제공(자체 판단).
  // 시간 제약은 driver가 아니라 validator — 감독이 샷 수/경계를 저작한다 (linear_pipeline Turn 7).
  const decoupage = (await loadOrRun<DecoupagePlan>(
    resume,
    '10b_decoupage.json',
    () => runDecoupage(genre, characters, scenes, artDirection, productionDesign, compact ? null : sceneCinematography, logger, models.V),
    'decoupage',
    logger,
  )).value;

  // shotDesign: 샷 단위 3분할 (intent + static + dynamic). 데쿠파주가 정한 샷에 spec을 붙인다.
  const shotDesignResult = await loadOrRun<{ shots: ShotDesign[]; compact_mode: boolean }>(
    resume,
    '11_shotDesign.json',
    async () => {
      const shots = await runShotDesign(genre, characters, scenes, artDirection, productionDesign, compact ? null : sceneCinematography, decoupage, logger, models.V);
      return { shots, compact_mode: compact };
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
    const cachedSeq = await logger.loadStage<PipelineResult['shotSequence']>('13_shotSequence.json');
    const cachedReport = await logger.loadStage<PipelineResult['shotCheck']>('12_shotCheck.json');
    if (cachedSeq && cachedReport) {
      shotCheckResult = { shotSequence: cachedSeq, report: cachedReport };
      await logger.markStage('shotCheck', 'completed', { resumed: true });
    } else {
      shotCheckResult = await runShotCheck(projectId, genre, narrativeStructure, characters, scenes, renderFormat, artDirection, productionDesign, sceneCinematography, shotDesign, sceneBudgetIssues, logger, models.V, models.C);
      await logger.flushRawLlm('shotCheck');
    }
  } else {
    shotCheckResult = await runShotCheck(projectId, genre, narrativeStructure, characters, scenes, renderFormat, artDirection, productionDesign, sceneCinematography, shotDesign, sceneBudgetIssues, logger, models.V, models.C);
    await logger.flushRawLlm('shotCheck');
  }

  const { shotSequence, report: shotCheck } = shotCheckResult;

  // ===== renderPrompts: T2I + TI2V 최종 프롬프트 정리 =====
  // 기존 샷의 first_frame_generation/video_generation을 추출.
  // 없는 경우만 LLM(Visual 축)로 보충 생성.
  const renderPrompts = (await loadOrRun<RenderPromptsOutput>(
    resume,
    '14_renderPrompts.json',
    () => runRenderPrompts(shotSequence, renderFormat, characters, productionDesign, logger, models.V),
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
    renderFormat,
    artDirection,
    productionDesign,
    sceneCinematography,
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
