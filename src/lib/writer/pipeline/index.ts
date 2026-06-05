// 파이프라인 오케스트레이터: 스토리 → 샷 시퀀스 JSON
// resumeProjectId 전달 시 기존 stage 결과 로드해 중단 지점부터 재개
import { PipelineLogger, makeProjectId } from '@/lib/svc/logger';
import { runS0 } from '@/lib/svc/pipeline/stages/s0_genre';
import { runS1 } from '@/lib/svc/pipeline/stages/s1_structure';
import { runS2 } from '@/lib/svc/pipeline/stages/s2_characters';
import { runS3 } from '@/lib/svc/pipeline/stages/s3_scenes';
import { runCValidation1 } from '@/lib/svc/pipeline/stages/c_validation_1';
import { runMidPreview } from '@/lib/svc/pipeline/stages/mid_preview';
import { runL0L1 } from '@/lib/svc/pipeline/stages/l0_l1_visual';
import { runL2 } from '@/lib/svc/pipeline/stages/l2_design';
import { runAssetsGenerate } from '@/lib/svc/pipeline/stages/assets_generate';
import { runL3SceneVisualPlan } from '@/lib/svc/pipeline/stages/l3_scene_plan';
import { runDecoupage } from '@/lib/svc/pipeline/stages/decoupage';
import { runL4Shots } from '@/lib/svc/pipeline/stages/l4_shots';
import { runCApplication2 } from '@/lib/svc/pipeline/stages/c_application_2';
import { runL5Prompts } from '@/lib/svc/pipeline/stages/l5_prompts';
import { inferL3FromL4Shots } from '@/lib/svc/pipeline/util/infer_l3';
import { isCompactDepth } from '@/lib/svc/types/pipeline';
import { analyzeSceneActionBudget } from '@/lib/svc/pipeline/validators/action_budget';
import { resetGeminiCallCount, getGeminiCallCount } from '@/lib/svc/llm/gemini';
import { resetClaudeCallCount, getClaudeCallCount } from '@/lib/svc/llm/claude';
import { resetOpenAICallCount, getOpenAICallCount } from '@/lib/svc/llm/openai';
import { resetLocalCallCount, getLocalCallCount } from '@/lib/svc/llm/local';
import { resetRawSeq } from '@/lib/svc/llm/raw_collector';
import { DEFAULT_MODELS, type PipelineModelsConfig, type LlmAxisConfig } from '@/lib/svc/llm/dispatch';
import type {
  PipelineInput,
  PipelineResult,
  L3SceneVisualPlan,
  ValidationIssue,
  S0Genre,
  S1Structure,
  S2Block,
  S3Block,
  CValidation1Report,
  MidPreview,
  L0Visual,
  L1Style,
  L2Design,
  L4Shot,
  DecoupagePlan,
  FinalPromptsOutput,
} from '@/lib/svc/types/pipeline';

// Skip 모드 default = true (피드백 미반영 stage 건너뜀, 비용 절감)
function resolveSkip(input: PipelineInput): { validation1: boolean; midPreview: boolean } {
  return {
    validation1: input.skip?.validation1 ?? true,
    midPreview: input.skip?.midPreview ?? true,
  };
}

// c_validation_1 skip 시 다운스트림에 줄 빈 리포트
function emptyC1Report(): CValidation1Report {
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

  // ===== S축 =====
  const S0 = (await loadOrRun<S0Genre>(resume, '02_S0.json', () => runS0(input, logger, models.S), 'S0', logger)).value;
  const S1 = (await loadOrRun<S1Structure>(resume, '03_S1.json', () => runS1(input, S0, logger, models.S), 'S1', logger)).value;
  const S2 = (await loadOrRun<S2Block>(resume, '04_S2.json', () => runS2(input, S0, S1, logger, models.S), 'S2', logger)).value;
  const S3 = (await loadOrRun<S3Block>(resume, '05_S3.json', () => runS3(input, S0, S1, S2, logger, models.S), 'S3', logger)).value;

  const skip = resolveSkip(input);

  // ===== C 적용 ① (skip 시 빈 리포트) =====
  const c_validation_1 = skip.validation1
    ? (await (async () => {
        await logger.markStage('C1_validation', 'completed', { skipped: true });
        return emptyC1Report();
      })())
    : (await loadOrRun<CValidation1Report>(
        resume,
        '06_C_validation_1.json',
        () => runCValidation1(S0, S1, S2, S3, logger, models.C),
        'C1_validation',
        logger,
      )).value;

  // ===== Mid Preview (V축 — 시각 제안 생성. skip 시 빈 추천) =====
  const mid_preview = skip.midPreview
    ? (await (async () => {
        await logger.markStage('mid_preview', 'completed', { skipped: true });
        return emptyMidPreview();
      })())
    : (await loadOrRun<MidPreview>(
        resume,
        '07_mid_preview.json',
        () => runMidPreview(S0, S1, S2, S3, c_validation_1, logger, models.V),
        'mid_preview',
        logger,
      )).value;

  // ===== V축 =====
  // L0_L1은 { L0, L1 } 합쳐서 저장
  const l01Pair = await loadOrRun<{ L0: L0Visual; L1: L1Style }>(
    resume,
    '08_L0_L1.json',
    async () => {
      const r = await runL0L1(S0, mid_preview, logger, models.V);
      return { L0: r.L0, L1: r.L1 };
    },
    'L0_L1',
    logger,
  );
  const { L0, L1 } = l01Pair.value;

  const L2 = (await loadOrRun<L2Design>(resume, '09_L2.json', () => runL2(S2, S3, L1, mid_preview, logger, models.V), 'L2', logger)).value;

  // L2 직후 → 캐릭터/로케이션 reference 에셋 생성 (L6에서 I2I용으로 사용)
  // 실패해도 파이프라인은 계속 진행 (L6는 에셋 없으면 순수 T2I로 자동 fallback).
  runAssetsGenerate(S2, L0, L1, L2, logger, { concurrency: 4 }).catch((e) => {
    console.warn('[assets] background generation failed (pipeline continues):', e);
  });

  // L3 (씬 비주얼 플랜) — Compact Mode (D1~D3)에선 스킵
  const compact = isCompactDepth(S0.depth_level);
  let L3: L3SceneVisualPlan[] = [];
  let l3BudgetIssues: ValidationIssue[] = [];

  // L3 resume: compact면 별도 파일(_inferred), 아니면 정상 파일
  type L3SavedShape = { scene_plans: L3SceneVisualPlan[]; budget_issues?: ValidationIssue[] };
  const l3FileNormal = '10_L3_scene_plans.json';
  const l3FileInferred = '10_L3_scene_plans_inferred.json';

  let l3PlanLoaded = false;
  if (resume) {
    const normal = await logger.loadStage<L3SavedShape>(l3FileNormal);
    if (normal) {
      L3 = normal.scene_plans;
      l3BudgetIssues = normal.budget_issues ?? S3.scenes.flatMap((sc) => analyzeSceneActionBudget(sc).issues);
      l3PlanLoaded = true;
      await logger.markStage('L3_scene_plan', 'completed', { resumed: true, source: l3FileNormal });
    } else if (compact) {
      const inferred = await logger.loadStage<L3SavedShape>(l3FileInferred);
      if (inferred) {
        L3 = inferred.scene_plans;
        l3BudgetIssues = inferred.budget_issues ?? S3.scenes.flatMap((sc) => analyzeSceneActionBudget(sc).issues);
        l3PlanLoaded = true;
        await logger.markStage('L3_scene_plan', 'completed', { resumed: true, source: l3FileInferred });
      }
    }
  }

  if (!l3PlanLoaded) {
    if (compact) {
      await logger.markStage('L3_scene_plan', 'completed', { skipped: true, reason: `Compact Mode (${S0.depth_level})` });
      l3BudgetIssues = S3.scenes.flatMap((sc) => analyzeSceneActionBudget(sc).issues);
    } else {
      const planResult = await runL3SceneVisualPlan(S0, S2, S3, L1, L2, mid_preview, logger, models.V);
      await logger.flushRawLlm('L3_scene_plan');
      L3 = planResult.scene_plans;
      l3BudgetIssues = planResult.budget_issues;
    }
  }

  // Découpage: 감독의 beat→shot 분해 (L4 입력). Compact mode에선 L3 plans 미제공(자체 판단).
  // 시간 제약은 driver가 아니라 validator — 감독이 샷 수/경계를 저작한다 (linear_pipeline Turn 7).
  const decoupage = (await loadOrRun<DecoupagePlan>(
    resume,
    '10b_decoupage.json',
    () => runDecoupage(S0, S2, S3, L1, L2, compact ? null : L3, logger, models.V),
    'Decoupage',
    logger,
  )).value;

  // L4: 샷 단위 3분할 (intent + static + dynamic). 데쿠파주가 정한 샷에 spec을 붙인다.
  const l4Result = await loadOrRun<{ shots: L4Shot[]; compact_mode: boolean }>(
    resume,
    '11_L4_shots.json',
    async () => {
      const shots = await runL4Shots(S0, S2, S3, L1, L2, compact ? null : L3, decoupage, logger, models.V);
      return { shots, compact_mode: compact };
    },
    'L4_shots',
    logger,
  );
  const L4 = l4Result.value.shots;

  // Compact mode 사후처리: L4에서 L3 역추론 (다운스트림 호환)
  // resume에서 inferred 못 찾았고 + 방금 L4 새로 만든 경우만 수행 (이미 inferred 있으면 위에서 로드됨)
  if (compact && !l3PlanLoaded) {
    L3 = inferL3FromL4Shots(L4, S3);
    await logger.saveStage(l3FileInferred, {
      scene_plans: L3,
      note: 'inferred from L4 (Compact Mode skipped L3 generation)',
    });
  }

  // ===== C 적용 ② =====
  // C2는 두 파일(12_C_application_2.json + 13_shot_sequence.json) 함께 저장됨
  type C2Shape = {
    shotSequence: PipelineResult['shot_sequence'];
    report: PipelineResult['c_validation_2'];
  };
  let c2: C2Shape;
  if (resume) {
    const cachedSeq = await logger.loadStage<PipelineResult['shot_sequence']>('13_shot_sequence.json');
    const cachedReport = await logger.loadStage<PipelineResult['c_validation_2']>('12_C_application_2.json');
    if (cachedSeq && cachedReport) {
      c2 = { shotSequence: cachedSeq, report: cachedReport };
      await logger.markStage('C2_application', 'completed', { resumed: true });
    } else {
      c2 = await runCApplication2(projectId, S0, S1, S2, S3, L0, L1, L2, L3, L4, l3BudgetIssues, logger, models.V, models.C);
      await logger.flushRawLlm('C2_application');
    }
  } else {
    c2 = await runCApplication2(projectId, S0, S1, S2, S3, L0, L1, L2, L3, L4, l3BudgetIssues, logger, models.V, models.C);
    await logger.flushRawLlm('C2_application');
  }

  const { shotSequence, report: c_validation_2 } = c2;

  // ===== L5: T2I + TI2V 최종 프롬프트 정리 =====
  // 기존 샷의 first_frame_generation/video_generation을 추출.
  // 없는 경우만 LLM(V 축)로 보충 생성.
  const final_prompts = (await loadOrRun<FinalPromptsOutput>(
    resume,
    '14_final_prompts.json',
    () => runL5Prompts(shotSequence, L0, S2, L2, logger, models.V),
    'L5_prompts',
    logger,
  )).value;

  const completedAt = new Date().toISOString();
  const totalDurationMs = Date.now() - startedMs;

  const result: PipelineResult = {
    project_id: projectId,
    input,
    S0,
    S1,
    S2,
    S3,
    c_validation_1,
    mid_preview,
    L0,
    L1,
    L2,
    L3,
    L4,
    c_validation_2,
    shot_sequence: shotSequence,
    final_prompts,
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
