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
import { runDramaturgySafe } from '@/lib/writer/pipeline/stages/s0_dramaturgy';
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
import { runDialogue, toDialogueTrack, type DialogueProgress } from '@/lib/writer/pipeline/stages/dialogue';
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
  markAwaiting,
  advanceProjectStageAfterWriter,
  type WriterRunStateBase,
  type WriterErrorDetail,
} from '@/lib/writer/run-store';
import { getPendingRawCalls, getUsageTotals } from '@/lib/writer/llm/raw_collector';
import { shouldAutoRetry, AUTO_RETRY_PER_STAGE } from '@/lib/writer/pipeline/stage-errors';
import type {
  PipelineInput,
  SceneCinematography,
  ValidationIssue,
  Genre,
  Dramaturgy,
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
  SceneDecoupage,
  ShotSequence,
  ShotCheckReport,
  RenderPromptsOutput,
  DialogueTrack,
} from '@/lib/writer/types/pipeline';

// =====================================================================
// state 모델: _runPipelineInner 의 모든 중간 산출물을 누적한다.
// =====================================================================
export interface WriterRunState extends WriterRunStateBase {
  input: PipelineInput;

  // #s3-gate: 씬 게이트 확정 플래그 + 수정 요청 누적(개정 시 scenes/storyCheck 를 지워 s3 재실행).
  _gateConfirmed?: boolean;
  _sceneRevisionNotes?: string[];

  // Story 축
  genre?: Genre;
  /** s0.5 드라마투르그 — s1(CDQ 후보)·s3(무대 후보) 의 참고 재료. 스토리 원천은 불변. */
  dramaturgy?: Dramaturgy | null; // null = 실패 흡수(배지) — 재료 없이 진행 (s0_dramaturgy 흡수 래퍼)
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
  /** decoupage 씬 단위 부분 진행(#scene-checkpoint 2026-08-09) — 씬 수 × 씬당 수십 초가 step
   *  예산(240s)을 넘던 17씬 사고의 처방. 완료 씬을 체크포인트하고 다음 step 이 이어간다.
   *  (doneSceneIds 는 scenes[].scene_id 로 파생 가능 — 별도 저장하지 않는다.) */
  decoupagePartial?: SceneDecoupage[];
  shotDesign?: ShotDesign[];
  /** shotDesign 씬 단위 부분 진행(#long-writer-run 2026-07-15) — 긴 러닝타임 프로젝트에서
   *  한 step(240s 예산) 안에 전 씬을 못 끝낼 때 완료 씬을 체크포인트하고 다음 step이 이어간다. */
  shotDesignPartial?: { doneSceneIds: string[]; shots: ShotDesign[] };
  shotSequence?: ShotSequence;
  shotCheck?: ShotCheckReport;
  renderPrompts?: RenderPromptsOutput;

  // 샷 단위 대사 트랙(#dialogue-v4 2026-07-23) — persistShots가 shots.dialogue_lines로 매핑.
  dialogue?: DialogueTrack;
  /** dialogue 씬 단위 부분 진행 — shotDesignPartial과 동일 계약(체크포인트 후 다음 step 이어감). */
  dialoguePartial?: DialogueProgress;

  // Compact Mode (genre.depth_level 기반). sceneCinematography step 에서 확정.
  compact?: boolean;

  // shots DB 기록 완료 마커(#persist-step 2026-07-15) — persistShots step의 has 판정.
  //   persist 내부의 i18n(EN/native 파생) LLM 호출이 40s+라 renderPrompts 꼬리에서
  //   함수 수명에 잘리거나 실패해도 조용히 지나가던 것을 독립 step + 재시도로 승격.
  _shotsPersisted?: boolean;
  _persistTries?: number;

  // 재시도/타임아웃 가드 (중도 kill 시 attempt 증가분이 남는다)
  _attempt?: { stage: string; count: number };
  // #stage-retry: 자동 재시도·수동 resume 기록 — 조용한 치유 금지(F-005 교훈), 관측 가능해야 한다.
  _repairs?: Array<{ stage: string; at: string; message: string }>;
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
  /** 이 step 이 차지하는 진행 유닛 수(기본 1). 합성 step 이 옛 다단계를 대체할 때 진행률
   *  (total_units/completed_units) 을 하위호환으로 유지하기 위한 것 — 새 진실 아님. */
  units?: number;
}

// 레인 순차 실행 게이트(#2lane A/B) — WRITER_LANES=0 이면 Lane V→Lane D 순차. 그 외 코드 경로는 동일.
const LANES_PARALLEL = process.env.WRITER_LANES !== '0';

// =====================================================================
// decoupage 후 2-레인(#2lane 2026-08-10).
//   Lane V: shotDesign → shotCheck → renderPrompts / Lane D: voiceProfiles → dialogue.
//   dialogue 의 입력은 scenes(s3)+decoupage 뿐(dialogue.ts 헤더)이라 레인 V 산출물을 읽지
//   않는다 — 옛 4직렬 step 을 한 인보케이션 안에서 겹치는 합성 step 하나로 바꿨다.
//   각 레인은 자기 산출물이 이미 state 에 있으면 건너뛰므로, 예산 초과로 한쪽만 부분
//   체크포인트(shotDesignPartial / dialoguePartial)를 남겨도 다음 인보케이션이 양 레인을
//   정확히 이어받는다(진행 중 run 하위호환: state 필드명·markStage 이벤트명 모두 불변).
// =====================================================================
async function runLaneVisual(
  s: WriterRunState,
  { logger, projectId, deadlineMs }: StepContext,
): Promise<Partial<WriterRunState>> {
  const models = resolveModels(s.input);
  const compact = s.compact === true;
  const patch: Partial<WriterRunState> = {};

  let shotDesign = s.shotDesign;
  if (shotDesign === undefined) {
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
      //   동시성은 decoupage 와 같은 env 노브. 미설정이면 v4_shots 자체 기본값(SHOTDESIGN_CONCURRENCY).
      {
        resume: s.shotDesignPartial ?? null,
        softDeadlineMs: deadlineMs,
        concurrency: Number(process.env.WRITER_SCENE_CONCURRENCY) || undefined,
      },
    );
    await logger.flushRawLlm('shotDesign');

    // 부분 진행 — 완료 씬 체크포인트만 남기고 레인 미완(has=false 유지).
    if (!result.done) {
      return { shotDesignPartial: { doneSceneIds: result.doneSceneIds, shots: result.shots } };
    }
    shotDesign = result.shots;
    patch.shotDesign = shotDesign;
    patch.shotDesignPartial = undefined; // 체크포인트 정리 (JSONB 직렬화에서 키 제거)
    // Compact mode 사후처리: shotDesign 으로부터 sceneCinematography 역추론 (다운스트림 호환).
    if (compact) patch.sceneCinematography = inferSceneCinematographyFromShots(shotDesign, s.scenes!);
  }

  let shotSequence = s.shotSequence;
  if (shotSequence === undefined || s.shotCheck === undefined) {
    // 착수 게이트(#shotcheck-gate 2026-08-11). shotCheck 는 시간 예산을 모르는 단일 콜이다
    //   (실측 87~154s, 관측 최대 278s — 씬 단위 분할은 이미 기각돼 쪼갤 수도 없다).
    //   남은 예산으로 못 끝낼 것 같으면 **착수하지 않고** 방금 만든 shotDesign 을 저장한 뒤 양보한다.
    //   고치는 사고: shotDesign 이 예산 끝에 완주 → 게이트 없이 shotCheck 착수 → 함수 수명(300s)에
    //   잘림 → patch 가 로컬 변수인 채 통째로 소실 → 다음 인보케이션이 마지막 체크포인트부터 같은
    //   유료 호출을 반복. shotDesign 은 c8 실측 134s(15씬)이고 긴 프로젝트에선 더 크다.
    //   상수는 보수적으로 — 헛되이 양보하는 비용은 step 왕복 1회(수 초)뿐이고, 잘못 착수하는 비용은
    //   수백 초의 유료 호출이다. 양보하면 다음 인보케이션이 예산 전체를 쥐고 shotCheck 를 시작한다.
    const EST_SHOTCHECK_MS = 160_000;
    if (deadlineMs != null && Date.now() + EST_SHOTCHECK_MS > deadlineMs) {
      console.log(
        `[writer] shotCheck 착수 보류 — 남은 예산 ${Math.round((deadlineMs - Date.now()) / 1000)}s < 예상 ${EST_SHOTCHECK_MS / 1000}s. shotDesign 체크포인트 후 다음 step 으로.`,
      );
      return patch;
    }
    const result = await runShotCheck(
      projectId,
      s.genre!,
      s.characters!,
      s.scenes!,
      s.worldVisual!,      // v2 (palette/locations) — asset 정규화용
      shotDesign,
      s.decoupage ?? null, // #p2-wiring: 표시문 소스(beat_summary) — 구 state resume 이면 null 폴백
      s.sceneBudgetIssues ?? [],
      logger,
      models.C,
    );
    await logger.flushRawLlm('shotCheck');
    shotSequence = result.shotSequence;
    patch.shotSequence = result.shotSequence;
    patch.shotCheck = result.report;
  }

  if (s.renderPrompts === undefined) {
    patch.renderPrompts = await runRenderPrompts(
      shotSequence,
      s.visualIdentity!, // v0 (format) — 옛 renderFormat
      s.worldVisual!,    // v2 (palette/color_meaning) — 옛 productionDesign
      logger,
      models.V,
    );
    await logger.flushRawLlm('renderPrompts');
  }
  return patch;
}

async function runLaneDialogue(
  s: WriterRunState,
  { logger, deadlineMs }: StepContext,
): Promise<Partial<WriterRunState>> {
  if (s.dialogue !== undefined) return {};
  const models = resolveModels(s.input);
  // ⚠️ 씬 순차 + 글로벌 메모리 체인은 V4 품질 메커니즘(블라인드 A/B 검증) — 레인으로 분리만
  //   하고 내부는 병렬화하지 않는다. 씬 실패는 빈 대사로 흡수(runDialogue 내부 계약).
  const result = await runDialogue(
    s.input.story,
    s.genre!,
    s.characters!,
    s.scenes!,
    s.decoupage!,
    logger,
    models.S,
    { resume: s.dialoguePartial ?? null, softDeadlineMs: deadlineMs },
  );
  await logger.flushRawLlm('dialogue');

  if (!result.done) {
    return {
      dialoguePartial: {
        doneSceneIds: result.doneSceneIds,
        scenes: result.scenes,
        memory: result.memory,
        profiles: result.profiles,
      },
    };
  }
  return { dialogue: toDialogueTrack(result), dialoguePartial: undefined };
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
    // s0.5 드라마투르그 — s1 앞에서 "재료"(무대 후보 + 극적 진단)를 만든다.
    //   has 에 narrativeStructure 를 함께 보는 이유(구 run 하위호환): 이 스텝이 도입되기 전에
    //   시작돼 이미 s1 을 지난 run 은 지금 와서 재료를 만들어도 쓸 곳이 없다 — 웹서치 LLM 콜을
    //   태우지 않고 조용히 건너뛴다. 새 run 은 narrativeStructure 가 비어 있으므로 정상 실행된다.
    key: 'dramaturgy',
    has: (s) => s.dramaturgy !== undefined || s.narrativeStructure !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const dramaturgy = await runDramaturgySafe(s.input, s.genre!, s.characters!, logger, models.S);
      await logger.flushRawLlm('dramaturgy');
      return { dramaturgy };
    },
  },
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
        // 채택된 무대 후보의 표시명·설명 보존 — 후보 미전달 시 humanizeSlug 폴백(종전 동작).
      const world = mergeOpenWorld(s.world, scenes, s.dramaturgy?.world_inventory);
        const patch: Partial<WriterRunState> = { narrativeStructure, scenes };
        if (characters !== s.characters) patch.characters = characters;
        if (world !== s.world) patch.world = world;
        return patch;
      }
      const narrativeStructure = await runNarrativeStructure(s.input, s.genre!, logger, models.S, s.dramaturgy ?? null);
      await logger.flushRawLlm('narrativeStructure');
      return { narrativeStructure };
    },
  },
  {
    key: 'scenes',
    has: (s) => s.scenes !== undefined,
    run: async (s, { logger }) => {
      const models = resolveModels(s.input);
      const scenes = await runScenes(s.input, s.genre!, s.narrativeStructure!, s.characters!, s.world, logger, models.S, s._sceneRevisionNotes, s.dramaturgy ?? null);
      await logger.flushRawLlm('scenes');
      // 오픈 캐스트(§4 + V축 재설계): 전개상 필요한 인물/월드를 producer 베이스라인에 append.
      //   producer 전달값(원천)은 불변 — mergeOpen* 가 append-only(아키텍처 §5#2).
      const characters = mergeOpenCast(s.characters!, scenes);
      // 채택된 무대 후보의 표시명·설명 보존 — 후보 미전달 시 humanizeSlug 폴백(종전 동작).
      const world = mergeOpenWorld(s.world, scenes, s.dramaturgy?.world_inventory);
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
      // best-effort 유지하되 침묵 금지(#persist-guard) — 실패를 로그로 드러낸다(shots 0행 사고 교훈).
      await persistAssetsToDb(projectId, s.characters!, s.scenes!, worldVisual, characterVisual, s.world).catch((e) => {
        console.error('[writer] persistAssetsToDb 실패 (best-effort 계속):', e instanceof Error ? e.message : e);
      });
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
        // E8 정식 배선(2026-08-10 act-arc-ablation 채택): v1 막별 아크를 v3 로 전달 —
        //   막 경계의 시각 대비를 살린다. 구 state resume 이면 null 폴백(배선 전과 동일).
        s.actVisualArc ?? null,
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
    run: async (s, { logger, deadlineMs }) => {
      const models = resolveModels(s.input);
      const compact = s.compact === true;
      const result = await runDecoupage(
        s.genre!,
        s.characters!,
        s.scenes!,
        s.worldVisual!, // v2 (로케이션 디자인). artDirection 은 decoupage 미사용 → 드롭
        compact ? null : s.sceneCinematography!,
        logger,
        models.V,
        // 씬 단위 이어달리기(#scene-checkpoint): 부분 진행 재개 + step 예산에서 양보 (shotDesign 계약).
        //   동시성(#scene-parallel)은 env 로만 상향 — 전역 429 방어(설계문서 ② E) 전 기본 1.
        {
          resume: s.decoupagePartial ?? null,
          softDeadlineMs: deadlineMs,
          // #concurrency-gap: 미지정이면 decoupage 자체 기본값(4). env 는 여전히 오버라이드.
          concurrency: Number(process.env.WRITER_SCENE_CONCURRENCY) || undefined,
        },
      );
      await logger.flushRawLlm('decoupage');

      // 부분 진행 — 완료 씬 체크포인트만 남기고 스테이지 미완(has=false 유지).
      //   runWriterSteps 가 이를 감지해 attempt 를 리셋하고 다음 step 에서 이어간다.
      if (!result.done) {
        return { decoupagePartial: result.scenes };
      }
      return { decoupage: result.plan, decoupagePartial: undefined };
    },
  },
  {
    // 2-레인 합성 step(#2lane 2026-08-10) — 옛 shotDesign/shotCheck/renderPrompts/dialogue
    //   4직렬 step 을 대체한다. 두 레인이 한 인보케이션 안에서 동시 진행하고, 예산 초과 시
    //   양 레인의 부분 체크포인트를 함께 저장해 다음 인보케이션이 둘 다 재개한다.
    //   대사 트랙은 여전히 persistShots 앞에서 확정되므로 persist 의 dialogue_lines 매핑 불변.
    key: 'shotsAndDialogue',
    units: 4, // 대체한 옛 step 수 — 진행률(total_units) 하위호환
    has: (s) => s.renderPrompts !== undefined && s.dialogue !== undefined,
    run: async (s, ctx) => {
      // WRITER_LANES=0 은 A/B 대조군 — 같은 레인 함수를 순서만 바꿔 부른다(코드 경로 동일).
      if (!LANES_PARALLEL) {
        const visual = await runLaneVisual(s, ctx);
        const dialogue = await runLaneDialogue(s, ctx);
        return { ...visual, ...dialogue };
      }
      // allSettled(#lane-independent 2026-08-11): 한 레인이 실패해도 반대 레인의 완료분을 버리지 않는다.
      //   Promise.all 은 한쪽이 reject 하는 순간 이미 끝나 있던 반대 레인 산출물까지 통째로 잃고 run 을
      //   failed 로 보냈다 — 대사 레인의 일시적 실패가 shotDesign 수백 초를 날리던 경로.
      const settled = await Promise.allSettled([runLaneVisual(s, ctx), runLaneDialogue(s, ctx)]);
      const patch: Partial<WriterRunState> = {};
      for (const r of settled) if (r.status === 'fulfilled') Object.assign(patch, r.value);
      const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (rejected.length > 0) {
        // 진전이 있으면 그것만 체크포인트하고 양보 — 실패 레인은 다음 인보케이션이 이어받는다.
        //   진전이 0 이면 흡수할 이유가 없다(양보해도 같은 자리) → 종전대로 표면화해 attempt 예산에 태운다.
        if (Object.keys(patch).length === 0) throw rejected[0].reason;
        console.error(
          '[writer] shotsAndDialogue 레인 실패 — 반대 레인 진전만 체크포인트하고 양보:',
          rejected[0].reason instanceof Error ? rejected[0].reason.message : rejected[0].reason,
        );
      }
      return patch;
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
        await persistShotsToDb(projectId, s.shotSequence!, s.dialogue ?? null);
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

export const WRITER_TOTAL_UNITS = WRITER_STEPS.reduce((n, st) => n + (st.units ?? 1), 0);

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
): Promise<{ done?: true; failed?: true; paused?: true; gated?: true }> {
  const run = await getActiveRun(projectId);
  if (!run || run.status !== 'running') return { done: true };

  const state = run.state as WriterRunState;
  // best-effort logger (FS 쓰기는 no-op-safe). raw_collector 그룹화에만 쓰인다.
  const logger = new PipelineLogger(projectId);
  await logger.init();

  let completedUnits = run.completed_units;
  // CAS 토큰(#p2-wiring): 이 인보케이션이 이어받은 state_version. 저장마다 +1로 갱신되고,
  // 매치 실패(=다른 인보케이션이 먼저 씀/run 종결)면 즉시 양보한다 — stale 사본이 최종본을 덮는 것 방지.
  let version = run.state_version ?? 0;

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
      const saved = await saveRunState(
        run.id,
        state,
        { completed_units: completedUnits, current_stage: step.key },
        version,
      );
      if (saved === null) return { paused: true }; // CAS 패배 — 다른 인보케이션이 run 을 소유
      version = saved;
    } catch {
      // 진입 체크포인트 쓰기 실패(아직 stage 미실행)는 영구 실패로 보지 않는다 — 일시적 DB 블립일 수
      //   있으니 paused 로 두고 watchdog/keepalive 가 재시도하게 한다.
      return { paused: true };
    }

    // 단계 실행 (단계별 소요시간 측정 — timing pipeline).
    const stageStartedMs = Date.now();
    // 쿼터 회계(#llm-quota 2026-08-10): 스테이지 전후 델타로 콜/토큰을 잰다. 한 런의
    //   스테이지별 RPM·TPM 프로파일이 여기서 나오고, 그게 동시 실행 가능 수의 분모가 된다.
    const usageBefore = getUsageTotals();
    let patch: Partial<WriterRunState>;
    try {
      patch = await step.run(state, { logger, projectId, deadlineMs: opts.deadlineMs });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // #stage-retry(2026-08-13, 오너 정책): 일시 오류는 **자동 1회 재시도** — paused 로 양보하면
      //   step 라우트의 self-trigger 가 같은 스테이지에 재진입한다(진입 마킹이 이미 attempt 를
      //   올려놨으므로 별도 카운터 불요). 소진되거나 결정 오류(계약/제약/권한/결제)면 표면화
      //   → UI 의 '이어서 재시도'(resume)가 사람 방아쇠. 치유는 _repairs 에 기록해 관측 가능하게.
      if (shouldAutoRetry(e, nextCount)) {
        state._repairs = [
          ...(state._repairs ?? []),
          { stage: step.key, at: new Date().toISOString(), message: message.slice(0, 200) },
        ];
        try {
          const saved = await saveRunState(
            run.id,
            state,
            { completed_units: completedUnits, current_stage: step.key },
            version,
          );
          if (saved === null) return { paused: true }; // CAS 패배 — 다른 인보케이션에 양보
          version = saved;
        } catch {
          // 기록 실패는 재시도를 막지 않는다 — 다음 진입 마킹이 어차피 체크포인트를 쓴다.
        }
        console.warn(
          `[writer steps] ${projectId} · ${step.key} 일시 오류 — 자동 재시도 (${nextCount}/${1 + AUTO_RETRY_PER_STAGE}): ${message}`,
        );
        return { paused: true };
      }
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
        const saved = await saveRunState(
          run.id,
          state,
          { completed_units: completedUnits, current_stage: step.key },
          version,
        );
        if (saved === null) return { paused: true };
        version = saved;
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
    const usageAfter = getUsageTotals();
    const stageCalls = usageAfter.calls - usageBefore.calls;
    const stageInTok = usageAfter.inputTokens - usageBefore.inputTokens;
    const stageOutTok = usageAfter.outputTokens - usageBefore.outputTokens;
    const stage429 = usageAfter.rateLimitHits - usageBefore.rateLimitHits;
    console.log(
      `[writer timing] ${projectId} · ${step.key} ${(stageMs / 1000).toFixed(1)}s (attempt ${nextCount})` +
        ` calls=${stageCalls} in_tok=${stageInTok} out_tok=${stageOutTok}` +
        ` rpm=${stageMs > 0 ? ((stageCalls / stageMs) * 60_000).toFixed(1) : '0'}` +
        ` in_tpm=${stageMs > 0 ? Math.round((stageInTok / stageMs) * 60_000) : 0}` +
        (stage429 > 0 ? ` quota_retries=${stage429}` : ''),
    );
    completedUnits += step.units ?? 1;
    try {
      const saved = await saveRunState(
        run.id,
        state,
        { completed_units: completedUnits, current_stage: step.key },
        version,
      );
      // CAS 패배는 실패가 아니다 — 다른 인보케이션이 run 을 이어받았으니 조용히 양보.
      if (saved === null) return { paused: true };
      version = saved;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await markFailed(run.id, message, captureErrorDetail(step.key, message));
      return { failed: true };
    }

    // #s3-gate: 씬 스토리 확정 게이트 — storyCheck 완료 직후 일시정지. 재개는
    //   /api/writer/scene-gate(confirm) 가 status 를 running 으로 되돌리고 step 을 재발사.
    if (step.key === 'storyCheck' && state.input?.sceneGate === true && state._gateConfirmed !== true) {
      await markAwaiting(run.id);
      return { gated: true };
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
