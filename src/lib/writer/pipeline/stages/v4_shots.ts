// V4: 샷 단위 3분할
//   V4a: 연출 의도 (story beat 1:1)
//   V4b: 정적 시각 (Image 생성기 입력 — 풍부)
//   V4c: 동적 시각 (Video 생성기 입력 — 압축)
//
// 입력: V3 SceneVisualPlan으로 씬 디시플린이 잡혀 있어, 자유도가 제한됨.
//        각 샷은 V3 vocabulary 안에서만 결정.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import { DURATION_RUBRIC, SHOT_PHYSICS, SHOT_SECONDS_RANGE, SHOT_SECONDS_HARD_MAX, MOTION_PROMPT_CHARS, FIRST_FRAME_CHARS } from '@/lib/writer/pipeline/physics';
// 모션 어휘(#motion-vocab 2026-08-11) — 지시서의 낱말 목록은 여기서만 온다.
//   손으로 다시 적으면 교정기와 갈라진다. 갈라짐이 실제 사고였다: 옛 지시서는 카메라 유형 9종 중
//   3종만 보이고 `...` 로 끝나 있었고, 모델은 못 본 어휘를 지어냈다(`pan_right`).
import {
  MOTION_VOCABULARY_GUIDE,
  CAMERA_MOTION_TYPE_ENUM_TEXT,
  CAMERA_DIRECTION_ENUM_TEXT,
  MOTION_SPEED_ENUM_TEXT,
  CAMERA_MAGNITUDE_ENUM_TEXT,
  CHARACTER_MAGNITUDE_ENUM_TEXT,
  normalizeCameraMotion,
  normalizeCharacterMagnitude,
} from '@/lib/writer/motion-vocabulary';
import type { ShotStaticSpec,
  DecoupagePlan,
  DecoupageShot,
  VisualIdentity,
  WorldVisual,
  CharacterVisual,
  SceneCinematography,
  SceneStage,
  ShotDesign,
  Genre,
  Characters,
  Scenes,
  StoryScene,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';
import { applyStageToShots } from '@/lib/writer/pipeline/stage/apply';

/** 씬 단위 부분 진행 체크포인트(#long-writer-run 2026-07-15) — steps.ts가 state에 영속. */
export interface ShotDesignProgress {
  doneSceneIds: string[];
  shots: ShotDesign[];
}

export interface RunShotDesignResult extends ShotDesignProgress {
  /** false = 시간 예산으로 일부 씬만 처리 — 다음 step 인보케이션이 resume으로 이어간다. */
  done: boolean;
}

// 씬 하나의 데쿠파주 샷이 이 수를 넘으면 청크로 나눠 LLM을 여러 번 호출한다(#B).
//   긴 러닝타임(예: 600s → 씬당 15~20샷)에서 호출당 출력(JSON)이 커져 생기는
//   응답 잘림·초장시간 호출을 출력 크기 상한으로 방어한다.
// #coverage-first(2026-09-02): 8 → 5. 커버리지 샷(반응·리빌)으로 씬당 샷이 늘자 8샷 묶음의 v4 출력이
//   모델 출력 한도를 넘어 JSON 이 잘렸다(회귀 실측: 23.6K자 truncation → 파싱 실패). 묶음을 줄여
//   호출당 출력을 ~15K자 아래로 유지한다(호출 수는 늘지만 병렬이라 벽시계 영향 작음).
export const SHOT_CHUNK_SIZE = 5;

// 씬 단위 동시성(#parallel-shotdesign 2026-07-21). 씬끼리는 상류 산출물(plan·decoupage)만 읽고
//   서로의 출력을 참조하지 않는 data-parallel 작업이라, 순차 실행이 유일 병목인 shotDesign의
//   wall-clock을 워커 풀로 줄인다. Gemini 텍스트 호출이라 fal 쿼터와 무관 — rate-limit 여유 기준값.
//   env(SHOTDESIGN_CONCURRENCY)로 무중단 튜닝, opts.concurrency로 테스트/실험 오버라이드. 1=순차.
//
// 기본값 4→8 (2026-08-11, shotdesign-concurrency HYPOTHESIS_v2 재측정으로 채택).
//   3.6-flash·15씬/157샷 fixture·3팔×3런: c4 235.5s → c8 133.9s(**−43.1%**), 에러 0, 샷 157 불변,
//   count_mismatches 0. 콜 최대 59.4s 로 긴 꼬리 없음 — 여기서는 큐 대기가 벽시계를 정한다
//   (실효 병렬도 3.80 → 6.69, 동시성에 거의 선형).
//   수용량 비용 0: 동시 런 병목은 Gemini 가 아니라 shotCheck 단일 콜의 Claude ITPM(165K) 이라
//   K = min(RPM 2000/34, TPM 3M/75K, ITPM 5M/165K) = 30 으로 c4 와 동일하다. c12 는 −59.8% 로 더
//   빠르지만 Gemini TPM 이 물려 K=26 이 되고 분산도 커져(87.9/89.4/106.8s) env 옵트인으로 남긴다.
const MAX_SHOT_CONCURRENCY = 12;
const DEFAULT_SHOT_CONCURRENCY = (() => {
  const raw = Number(process.env.SHOTDESIGN_CONCURRENCY);
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), MAX_SHOT_CONCURRENCY) : 8;
})();

export async function runShotDesign(
  genre: Genre,
  characters: Characters,
  scenes: Scenes,
  visualIdentity: VisualIdentity,
  worldVisual: WorldVisual,
  characterVisual: CharacterVisual,
  sceneCinematographyPlans: SceneCinematography[] | null,  // null이면 Compact Mode
  decoupage: DecoupagePlan | null,          // 감독 데쿠파주. null이면 V4가 자체적으로 샷 수 결정 (legacy)
  seedV4: string,                           // bridge 거친 seed.v4 (샷 레시피 — 전역 참고 힌트)
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  opts?: {
    /** 이전 부분 진행 — 완료된 씬은 건너뛰고 이어서 생성(#A). */
    resume?: ShotDesignProgress | null;
    /** 이 시각(epoch ms)을 넘기면 남은 씬을 다음 step으로 미룬다.
     *  단, 패스당 최소 1씬은 처리한다(정상 반환 = 진행 보장 — steps.ts의 attempt 리셋 계약). */
    softDeadlineMs?: number;
    /** 씬 동시성(#parallel-shotdesign). 미지정 시 DEFAULT_SHOT_CONCURRENCY(env). 1이면 순차. */
    concurrency?: number;
    /** 씬 무대(#stage 2026-09-03) — 있으면 v4 는 camera_setup 을 고르고 화면 배치는 계산으로 확정한다.
     *  null/미지정 = 무대 없는 구 동작(LLM 의 position_in_frame 그대로). */
    sceneStages?: SceneStage[] | null;
  },
): Promise<RunShotDesignResult> {
  const compactMode = sceneCinematographyPlans === null;
  const resume = opts?.resume ?? null;
  const softDeadlineMs = opts?.softDeadlineMs;
  const concurrency = Math.max(
    1,
    Math.min(opts?.concurrency ?? DEFAULT_SHOT_CONCURRENCY, MAX_SHOT_CONCURRENCY),
  );
  const doneSceneIds = new Set(resume?.doneSceneIds ?? []);
  const allShots: ShotDesign[] = [...(resume?.shots ?? [])];
  await logger.markStage('shotDesign', 'started', {
    compact_mode: compactMode,
    decoupage_driven: decoupage !== null,
    resumed_scenes: doneSceneIds.size,
    concurrency,
  });

  // #p4-json-guard: 이번 패스에서 수용된 샷 수 불일치 — 스테이지 산출/마커로 노출한다.
  const countBadges: ShotCountBadge[] = [];

  // 씬 하나 → 3분할 샷 배열. 씬끼리는 상류 산출물(plan·decoupage)만 읽고 서로의 출력을 참조하지
  //   않으므로 병렬 안전(#parallel-shotdesign). 청크는 씬 내부에서 순차 유지 — 청크 shot_id index
  //   매핑이 호출 내부에서 닫히기 때문. plan 없으면 빈 배열(스킵, 재방문 방지용으로 완료 처리됨).
  const processScene = async (scene: StoryScene): Promise<ShotDesign[]> => {
    const plan = compactMode ? null : sceneCinematographyPlans!.find((p) => p.scene_id === scene.scene_id) ?? null;
    if (!compactMode && !plan) {
      console.warn(`[shotDesign] no sceneCinematography plan for ${scene.scene_id}, skipping`);
      return [];
    }
    const sceneDec = decoupage?.scenes.find((d) => d.scene_id === scene.scene_id)?.shots ?? null;
    const stage = opts?.sceneStages?.find((st) => st.scene_id === scene.scene_id) ?? null;
    const sceneShots: ShotDesign[] = [];
    if (sceneDec && sceneDec.length > SHOT_CHUNK_SIZE) {
      const totalChunks = Math.ceil(sceneDec.length / SHOT_CHUNK_SIZE);
      for (let i = 0; i < sceneDec.length; i += SHOT_CHUNK_SIZE) {
        const chunk = sceneDec.slice(i, i + SHOT_CHUNK_SIZE);
        const chunkNote = `(씬 전체 데쿠파주 ${sceneDec.length}개 중 ${i + 1}~${i + chunk.length}번째 묶음 — ${Math.floor(i / SHOT_CHUNK_SIZE) + 1}/${totalChunks}. 이 묶음의 샷들만 출력하라)`;
        // #n-1: 직전 청크의 확정 스펙 꼬리를 다음 청크에 계약으로 — 청크 경계 연속성.
        const part = await generateL4ForScene(scene, plan, chunk, genre, characters, visualIdentity, worldVisual, characterVisual, seedV4, logger, axisConfig, chunkNote, sceneShots, countBadges, stage);
        sceneShots.push(...part);
      }
    } else {
      sceneShots.push(
        ...(await generateL4ForScene(scene, plan, sceneDec, genre, characters, visualIdentity, worldVisual, characterVisual, seedV4, logger, axisConfig, undefined, undefined, countBadges, stage)),
      );
    }
    // #stage: 무대가 있으면 씬 전체를 한 번에 적용 — 샷 순서대로 비트를 잇고(added 샷은 직전 비트),
    //   카메라를 풀어 화면 배치를 확정한다. LLM 의 position_in_frame 은 여기서 덮어쓴다.
    if (stage && sceneShots.length) {
      const applied = applyStageToShots(sceneShots, stage, sceneDec, { format: genre.format ?? null });
      if (applied.issues.length) {
        await logger.saveText(
          `L4_stage_layout_${scene.scene_id}.txt`,
          applied.issues.map((i) => `[${i.severity}] ${i.location}: ${i.message}${i.suggestion ? ` → ${i.suggestion}` : ''}`).join('\n'),
        );
      }
      return applied.shots;
    }
    return sceneShots;
  };

  // 이번 패스 대상 = 아직 완료 안 된 씬(원래 순서 보존 → 병합 결정론적).
  const pending = scenes.scenes.filter((s) => !doneSceneIds.has(s.scene_id));
  const resultsByScene = new Map<string, ShotDesign[]>();
  let cursor = 0;
  let startedThisPass = 0;
  let firstError: unknown = null;
  // 씬 예상 시간 — 착수 게이트용(decoupage 와 동일 관용구). 관측되면 이 패스의 최대 실측 ×1.25.
  //   사후 게이트(Date.now() > deadline)만으로는 동시성이 높을 때 큐가 데드라인 전에 비어
  //   게이트가 한 번도 안 걸리고, in-flight 웨이브 꼬리가 함수 하드킬을 넘겼다(decoupage 실측).
  //   "끝날 시간"을 착수 시점에 예측해 막는다.
  let estSceneMs = 45_000;

  // 동기 claim: 예산 초과 시 남은 씬을 다음 step으로 양보하되, 패스당 최소 1씬은 시작한다
  //   (정상 반환 = 진행 보장 계약). 여러 워커가 동시에 claim해도 JS 단일 스레드라 원자적.
  //   "started"(완료 아님) 기준 게이팅 — in-flight 웨이브가 있어도 예산을 정확히 지킨다.
  const claimNext = (): StoryScene | null => {
    if (startedThisPass > 0 && softDeadlineMs != null && Date.now() + estSceneMs > softDeadlineMs) {
      return null;
    }
    if (cursor >= pending.length) return null;
    const scene = pending[cursor];
    cursor += 1;
    startedThisPass += 1;
    return scene;
  };

  const worker = async (): Promise<void> => {
    let scene: StoryScene | null;
    while ((scene = claimNext()) !== null) {
      const sceneStartedMs = Date.now();
      try {
        resultsByScene.set(scene.scene_id, await processScene(scene));
        estSceneMs = Math.max(estSceneMs, Math.round((Date.now() - sceneStartedMs) * 1.25));
      } catch (e) {
        // 씬 실패는 패스를 죽이지 않는다(decoupage 계약): 성공분은 체크포인트로 보존되고
        //   실패 씬은 다음 패스가 재시도한다. 진전 0 인 패스에서만 표면화.
        if (firstError === null) firstError = e;
        console.error(
          `[shotDesign] scene ${scene.scene_id} failed (checkpointing ${resultsByScene.size} successes):`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()),
  );
  // 로컬 러너(softDeadlineMs 미지정)는 부분 반환 경로가 없다(index.ts 가 done 을 보지 않고
  //   result.shots 를 그대로 확정한다) — 씬 실패를 조용히 누락시키지 않도록 종전대로 표면화한다.
  if (firstError !== null && (resultsByScene.size === 0 || softDeadlineMs == null)) throw firstError;

  // 결정론적 병합: 씬 원래 순서로 이번 패스 완료 씬만 doneSceneIds/allShots에 확장.
  for (const scene of scenes.scenes) {
    const shots = resultsByScene.get(scene.scene_id);
    if (shots === undefined) continue; // resume 완료 씬 또는 예산 양보로 미처리
    allShots.push(...shots);
    doneSceneIds.add(scene.scene_id);
  }

  // 남은 씬이 있으면 부분 반환 — 다음 step 인보케이션이 resume으로 이어간다.
  if (!scenes.scenes.every((s) => doneSceneIds.has(s.scene_id))) {
    console.log(
      `[shotDesign] checkpoint: ${doneSceneIds.size}/${scenes.scenes.length} scenes done (concurrency=${concurrency}) — 다음 step에서 이어감`,
    );
    return { done: false, doneSceneIds: [...doneSceneIds], shots: allShots };
  }

  await logger.saveStage('11_v4_shotDesign.json', {
    shots: allShots,
    compact_mode: compactMode,
    ...(countBadges.length ? { count_badges: countBadges } : {}),
  });
  await logger.markStage('shotDesign', 'completed', {
    shot_count: allShots.length,
    compact_mode: compactMode,
    ...(countBadges.length ? { count_mismatches: countBadges.length } : {}),
  });

  return { done: true, doneSceneIds: [...doneSceneIds], shots: allShots };
}

/** 샷 객체 판별 — 3분할 스펙의 핵심 키(intent) 보유 여부. */
/**
 * 사물 캐스트가 character_blocking 에 들어와 있으면 prop_placement 로 옮긴다 (#g4).
 *
 * 왜 코드로 강제하나: v4 프롬프트가 "character_blocking 은 사람만, 사물은 prop_placement 로"를
 *   명시하는데도 모델이 사물을 blocking 에 넣는 일이 반복됐다(실측: 화개장터 sh_04_20 엿판).
 *   그 결과 그리드 직렬화가 "figure 2 …, blank head" 로 찍었고 아기를 안은 그림이 나왔다.
 *   지시는 확률이고 이 변환은 결정론이다 — 확률에 안전을 맡기지 않는다.
 *
 * 순수 함수(테스트 대상). 사물이 없으면 원본을 그대로 돌려준다.
 */
export function moveObjectsToProps(
  spec: ShotStaticSpec,
  objectIds: ReadonlySet<string>,
): ShotStaticSpec {
  if (objectIds.size === 0) return spec;
  const blocking = spec.character_blocking;
  if (!Array.isArray(blocking) || blocking.length === 0) return spec;

  const moved = blocking.filter((b) => objectIds.has(b?.character_id ?? ''));
  if (moved.length === 0) return spec;

  const stays = blocking.filter((b) => !objectIds.has(b?.character_id ?? ''));
  const existing = Array.isArray(spec.prop_placement) ? spec.prop_placement : [];
  // 이미 prop_placement 에 있는 사물은 중복해 넣지 않는다(모델이 양쪽에 쓴 경우).
  const already = new Set(existing.map((p) => p?.prop ?? ''));
  const added = moved
    .filter((b) => !already.has(b.character_id ?? ''))
    .map((b) => ({
      prop: b.character_id ?? '',
      position_in_frame: b.position_in_frame ?? 'center',
      significance: 'carried',
    }));

  return {
    ...spec,
    character_blocking: stays,
    prop_placement: [...existing, ...added],
  };
}

function isShotLike(v: unknown): v is ShotDesign {
  return !!v && typeof v === 'object' && 'intent' in (v as object);
}

/** 케이스 ⑤: 샷 id를 키로 한 맵 { "shot_1": {intent...}, ... } → 값 배열(입력 순서 보존). */
function shotsFromIdMap(obj: object): ShotDesign[] | null {
  const values = Object.values(obj);
  if (values.length > 0 && values.every(isShotLike)) return values as ShotDesign[];
  return null;
}

// 방어: 모델이 다음 중 하나로 응답할 수 있음
//   ① { shots: [...] }                  ← 기대 형식
//   ② [{ shots: [...] }]                ← array 래핑
//   ③ [ { intent, static_spec, ... } ]  ← shots 배열을 바로 반환
//   ④ { shots: [{ shots: [...] }] }     ← 이중 중첩 (드물지만)
//   ⑤ { "shot_1": {...}, ... } 또는 [{ "shot_1": {...}, ... }] ← 샷 id 키 맵 (2026-07-15 실측)
export function parseL4Shots(rawResult: unknown, sceneId: string): ShotDesign[] {
  let shots: ShotDesign[];
  const r = rawResult as { shots?: unknown } | unknown[];
  if (Array.isArray(r)) {
    if (r.length === 1 && r[0] && typeof r[0] === 'object' && 'shots' in r[0]) {
      shots = (r[0] as { shots: ShotDesign[] }).shots;
    } else if (r.every(isShotLike)) {
      shots = r as ShotDesign[];
    } else {
      // 케이스 ⑤(배열 래핑): 각 원소가 샷이거나 샷 id 맵이면 순서대로 평탄화.
      const flattened: ShotDesign[] = [];
      let ok = r.length > 0;
      for (const el of r) {
        if (isShotLike(el)) {
          flattened.push(el);
          continue;
        }
        const fromMap = el && typeof el === 'object' ? shotsFromIdMap(el) : null;
        if (fromMap) {
          flattened.push(...fromMap);
          continue;
        }
        ok = false;
        break;
      }
      if (!ok) {
        throw new Error(`L4 unexpected array shape (scene=${sceneId}): ${JSON.stringify(r).slice(0, 200)}`);
      }
      shots = flattened;
    }
  } else if (r && typeof r === 'object' && 'shots' in r && Array.isArray((r as { shots: unknown }).shots)) {
    const inner = (r as { shots: unknown[] }).shots;
    // 케이스 ④: shots가 [{shots:[...]}] 형태
    if (inner.length > 0 && inner[0] && typeof inner[0] === 'object' && 'shots' in (inner[0] as object) && !('intent' in (inner[0] as object))) {
      shots = (inner[0] as { shots: ShotDesign[] }).shots;
    } else {
      shots = inner as ShotDesign[];
    }
  } else if (r && typeof r === 'object') {
    // 케이스 ⑤(단일 객체): 샷 id 키 맵
    const fromMap = shotsFromIdMap(r);
    if (!fromMap) {
      throw new Error(`L4 unexpected shape (scene=${sceneId}): ${JSON.stringify(r).slice(0, 200)}`);
    }
    shots = fromMap;
  } else {
    throw new Error(`L4 unexpected shape (scene=${sceneId}): ${JSON.stringify(r).slice(0, 200)}`);
  }

  if (!Array.isArray(shots) || shots.length === 0) {
    throw new Error(`L4 empty shots (scene=${sceneId})`);
  }
  return shots;
}

// ── 샷 개수 가드 (#p4-json-guard 2026-08-11 — Q6 원문 처방 "재시도/배지") ─────────────────────
// 왜 필요한가: 아래 shot_id 표준화가 `sceneDec[i]` index 매핑이라 개수가 어긋나면 조용히 어긋난
//   데이터가 확정된다 — 모자라면 뒤쪽 데쿠파주 샷이 통째로 소실되고, 넘치면 초과분이 fallback id
//   를 받는다. 그런데 손실 복구(repairJson 전략2·3)는 아이템을 버리고도 파싱을 성립시키므로
//   에러가 0 이다. 이 조합이 "8샷→2샷이 에러 없이 통과"한 실사고의 기제(flash-ab, Q6).
// 기대치 출처: 데쿠파주 구동이면 sceneDec.length(정확 일치 요구) / 아니면 plan.shot_count_target
//   (프롬프트 계약이 "±1 허용"이라 tolerance 1) / Compact Mode 는 프롬프트도 "자동 ±2"라 기대치가
//   없다 — 이 경우 하한만 본다(빈 배열은 parseL4Shots 가 이미 거부).

export interface ShotCountBadge {
  scene_id: string;
  expected: number;
  got: number;
  source: 'decoupage' | 'plan';
  chunk?: string;
}

export type ShotCountVerdict =
  | { kind: 'ok' }
  | { kind: 'retry'; reason: string }
  | { kind: 'fatal'; reason: string }
  | { kind: 'accept'; reason: string };

/** 재시도까지 했는데 기대의 절반 이하만 돌아오면 수용하지 않는다 — 씬 실패로 넘긴다.
 *  씬 실패는 패스를 죽이지 않는다(성공분은 체크포인트로 보존, 실패 씬은 다음 패스가 재시도).
 *  Q6 시나리오(8→2, 25%)가 여기 걸린다. 경미한 어긋남(예: 8→6)은 종전대로 수용 + 배지. */
const CATASTROPHIC_LOSS_RATIO = 0.5;

export function judgeShotCount(
  got: number,
  expected: number | null,
  opts: { tolerance: number; isFinalAttempt: boolean },
): ShotCountVerdict {
  if (expected === null) return { kind: 'ok' };
  if (Math.abs(got - expected) <= opts.tolerance) return { kind: 'ok' };
  const reason = `샷 수 불일치 (got ${got}, expected ${expected}${opts.tolerance ? ` ±${opts.tolerance}` : ''})`;
  if (!opts.isFinalAttempt) return { kind: 'retry', reason };
  if (got < expected * CATASTROPHIC_LOSS_RATIO) {
    return { kind: 'fatal', reason: `${reason} — 절반 이하만 반환됨(대량 소실 의심)` };
  }
  return { kind: 'accept', reason };
}

/**
 * 직전 확정 샷들의 연속성 계약 블록(#n-1 2026-08-05). 같은 씬의 앞선 청크가 설계를 마친
 * 샷 꼬리(K개)를 다음 청크 프롬프트에 주입한다 — 의상·소품·조명·공간이 청크 경계에서
 * 리셋되던 단절의 봉합. 씬 간에는 쓰지 않는다(씬 병렬 설계 보존).
 */
export function buildV4ContinuityBlock(prevDesigned: ShotDesign[], k = 2): string {
  const tail = prevDesigned.slice(-k);
  if (!tail.length) return '';
  const lines = tail.map(
    (d) =>
      `  ${d.intent.shot_id} [${d.static_spec.shot_type}]\n    first_frame: ${d.static_spec.first_frame_prompt}\n    motion: ${d.dynamic_spec.motion_prompt}`,
  );
  return `[직전 확정 샷 스펙 — 연속성 계약]
같은 씬에서 바로 앞서 확정된 샷들이다. 의상·소품·조명·공간 배치를 모순 없이 이어가고,
인물의 위치·시선은 이 종료 상태에서 자연스럽게 이어지게 설계하라 (동일 구도 복제 금지 — 이어지되 새 프레임).
${lines.join('\n')}

`;
}

/** #stage: v4 지시서의 무대 절 — 좌표·축·비트별 인물 상태와 camera_setup 계약. */
export function buildStageInstructionBlock(stage: SceneStage): string {
  const st = (list: SceneStage['beats'][number]['characters']) =>
    list.map((c) => `${c.character_id}@(${c.x},${c.y}) facing ${c.facing_deg}° ${c.posture}${c.note ? ` (${c.note})` : ''}`).join('; ');
  const beats = stage.beats
    .map((b) => `  beat ${b.beat}${b.summary ? ` — ${b.summary}` : ''}\n    start: ${st(b.characters)}${b.end_characters ? `\n    end:   ${st(b.end_characters)}` : ''}`)
    .join('\n');
  const landmarks = stage.landmarks.map((l) => `${l.id}@(${l.x},${l.y}) ${l.label}`).join('; ') || '(없음)';
  return `[씬 무대 — 세계 좌표 (#stage). 화면 안 위치는 여기서 계산된다]
좌표 단위 m. x = 동(+)/서(−), y = 북(+)/남(−). facing 0 = 북, 90 = 동, 180 = 남, 270 = 서.
180° 축: ${stage.axis ? `${stage.axis.from} → ${stage.axis.to}, 카메라는 그 ${stage.camera_side === 'left' ? '왼쪽' : '오른쪽'}(camera_side=${stage.camera_side})` : '없음'}
표지: ${landmarks}
비트별 인물 상태(그 비트 시작 순간 / 끝):
${beats}

이 무대 위에서 샷마다 **static_spec.camera_setup** 을 정하라 — 카메라 위치·화면 안 위치·깊이·크기·향은
코드가 이 값과 무대에서 계산한다. 네가 적는 position_in_frame 은 참고값일 뿐 계산값으로 덮어쓴다.
- subject: 이 샷의 피사체 — character_id 하나, 여러 명이면 배열, 전원이면 "group", 표지 id 도 가능.
- from_direction: 카메라가 **피사체 기준 어느 쪽에 서는가**(세계 나침반 N/NE/E/SE/S/SW/W/NW).
  예: "S" = 피사체의 남쪽에 서서 북쪽을 본다. 축의 camera_side 쪽에 있는 방향을 골라라 — 반대편을 고르면
  코드가 축 안쪽으로 되돌린다(관객의 좌우가 뒤집히지 않게). 동기 있는 축 이동만 axis_cross:"motivated".
- height: eye | low | high | overhead. lens_mm: V3 lens_vocabulary 안에서.
- over_shoulder_of: OTS 면 어깨 너머 인물 id, 아니면 null.
- end: 달리·트래킹으로 카메라가 이동하면 { "from_direction"?: 끝 방향, "distance_scale"?: 끝 거리 배율(0.5=반으로 접근, 2=두 배로 후퇴) }. 없으면 null(camera_motion 에서 추정).
- 거리는 shot_type(샷 사이즈)과 lens_mm 에서 계산된다 — 클로즈업이면 가까이, 와이드면 멀리.
- character_blocking 에는 이 카메라에서 **보이길 의도한** 인물을 적어라. 기하상 프레임에 들어온 무대 인물은
  코드가 추가하고, 타이트한 샷(ECU/CU/MCU)에서 프레임 밖인 비피사체는 코드가 뺀다.
- 인물의 자세·이동은 무대의 비트 상태와 맞아야 한다(무대가 lying 이면 START 도 누워 있다).

`;
}

async function generateL4ForScene(
  scene: StoryScene,
  plan: SceneCinematography | null,    // null = Compact Mode (sceneCinematography 미제공)
  sceneDec: DecoupageShot[] | null,  // 감독 데쿠파주 샷 목록(청크일 수 있음). null이면 자체 결정 (legacy)
  genre: Genre,
  characters: Characters,
  visualIdentity: VisualIdentity,
  worldVisual: WorldVisual,
  characterVisual: CharacterVisual,
  seedV4: string,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  chunkNote?: string, // 청크 분할 호출(#B) 시 "전체 N개 중 i~j" 안내 — 프롬프트에 병기
  // #n-1 2026-08-05: 같은 씬의 직전 청크가 확정한 스펙 — 청크 경계의 연속성 단절 봉합.
  //   씬 간에는 전달하지 않는다(씬 병렬 처리 #parallel-shotdesign 보존).
  prevDesigned?: ShotDesign[],
  // #p4-json-guard: 최종 시도에서 수용한 개수 불일치를 모으는 수집기(런 스코프 배열).
  badges?: ShotCountBadge[],
  // #stage(2026-09-03): 씬 무대 — 있으면 camera_setup 을 요구하고 무대 좌표를 지시서에 싣는다.
  stage?: SceneStage | null,
): Promise<ShotDesign[]> {
  const compactMode = plan === null;
  const decoupageDriven = sceneDec !== null && sceneDec.length > 0;
  const disciplineSection = compactMode
    ? `[Compact Mode — V3 미제공]
짧은 영상(D1~D3)이라 씬 비주얼 플랜 단계가 생략됨.
디시플린을 V4 자체에서 결정한다:
- lens_mm: 50mm 기본, 필요 시 35/85 변주 (씬 내 1~2종으로 제한)
- camera_motion.type: 동기가 있으면 움직인다 — 시선 리빌(pan/tilt/zoom_out)·인물 이동 동반(tracking)·긴장 축적(느린 dolly_in). static 은 사건이 프레임 안에서 완결될 때의 선택이지 기본값이 아니다(#static-bias 2026-09-02 실측: 샷의 54~68% 가 static).
- color_temp_kelvin: 씬 시간대/무드에 맞춰 일관 유지
- key_fill_ratio: 4:1 기본 (드라마틱) 또는 2:1 (자연)
- 샷 개수: 액션 예산에 따라 자동
- 시선/180°축: 대화 씬이면 자체적으로 일관 유지`
    : `[일반 모드 — V3 디시플린 준수]
- **static 은 기본값이 아니다** (#static-bias 2026-09-02 실측: 샷의 54~68% 가 static): 샷마다 "카메라가
  움직일 동기가 있는가"를 먼저 묻고, 시선 리빌·인물 이동·공간 드러내기·긴장 축적은 동기다. 데쿠파주
  camera_intent=motivated_move 는 실제 무브 타입으로 옮긴다 — 아래 V3 표는 마운팅의 **기본값**이고 리빌
  동기가 있으면 표의 예외가 우선한다.
- lens_mm은 반드시 V3.lens_vocabulary 안에서 선택
- camera_motion.type은 V3.camera_mounting + camera_energy에 부합
  · tripod + static → 'static' 기본 — 단 시선 리빌·공간 드러내기는 pan/tilt/zoom_out 허용(#static-bias)
  · handheld + breathing → 'static'·'handheld_drift' 기본 — 리빌 시 pan/tilt/zoom_out 허용(#static-bias)
  · gimbal + kinetic → 'tracking', 'dolly_in/out' 허용
- color_temp_kelvin은 V3.lighting_arc.start_K~end_K 사이에서 진행
- key_fill_ratio는 V3.lighting_arc.dominant_ratio 기준
- 시선/180°축은 V3.spatial_axis_180 준수`;

  const systemInstruction = `당신은 V축 V4(샷 실행) 디자이너이다.${decoupageDriven ? `

[데쿠파주 확정 모드]
감독이 이미 샷 분해(데쿠파주)를 확정했다. 아래 [감독 데쿠파주] 목록의 각 샷에 3분할 spec(intent/static/dynamic)을 붙이는 것이 너의 일이다.
- 샷 개수·경계·순서를 바꾸지 마라 (추가/삭제/병합/분할 금지 — 감독의 결정).
- 각 샷의 shot_id, shot_function, shot_size, intended_duration_seconds, source_beats, camera_intent를 존중하라.
- static_spec.shot_type은 데쿠파주의 shot_size를 그대로 사용한다.
- intent.duration_seconds는 데쿠파주의 intended_duration_seconds를 따른다.
- dynamic_spec.camera_motion.type은 camera_intent를 따른다 (static이면 'static').
- intent.shot_id는 데쿠파주 shot_id를 그대로 유지한다.` : ''}
한 씬 안의 모든 샷을 생성한다.

V4는 3분할:
  V4a (Intent): 연출 의도와 리듬.
  V4b (Static): Image 생성기 입력. 첫 프레임의 모든 정적 요소.
  V4c (Dynamic): Video 생성기 입력. 샷 길이(${SHOT_SECONDS_RANGE}) 안의 동적 변화. 압축 필수.

[샷 사슬의 감정·상태 연속성 (#story-2/3/4 2026-09-01 오너 확정)]
- 각 샷 intent.emotion_arc 에 그 샷의 감정 아치를 적어라: { "from": "...", "to": "..." } —
  한두 단어의 영어(예: warmth, unease, dread). 감정 변화가 없는 샷은 from=to.
- **한 샷의 전이는 인접 한 걸음까지만** (#story-3): warmth→fading smile 은 되고
  warmth→dread 는 안 된다. 극단 전이가 필요하면 샷을 나눠 각 샷이 한 걸음씩 맡는다.
  (실측: '반가움→공포'를 8초 한 샷에 요구해 후반 표정이 급락 붕괴.)
- **연쇄** (#story-2): 같은 씬에서 다음 샷의 from 은 직전 샷의 to 에서 출발한다.
  건너뛰면 발전 비트가 생략된 것이다 — 중간 비트 샷을 넣어라.
  (실측: 플래시백이 만남 샷→이별 샷으로 직행, 관계 발전 비트 0.)
- **서사 상태 연속** (#story-4): 직전 샷이 확정한 서사 상태(이별했다·떠났다·죽었다)를
  역행하는 구도·배치 금지 — 상태를 바꾸려면 그 변화 자체가 이 샷의 액션이어야 한다.
  (실측: 이별 확정 직후 샷에서 두 사람이 나란히 동행하는 구도로 회귀.)

[비시각 연출의 시각 번역 (#story-5 2026-08-31 오너 확정)]
씬 텍스트의 소리·시간감 연출("소음이 사라진다", "시간이 멈춘 듯", "심장 소리만 들린다")은
이미지·영상 생성기가 실행할 수 없다 — 반드시 카메라 문법으로 번역해서 spec 에 써라:
주변 소거 = 얕은 심도(배경 소프트 블러) 또는 타이트한 클로즈업 / 시간 정지감 = 정지 카메라 +
micro 모션만 / 내면 강조 = 느린 푸시인. 원문 표현을 first_frame_prompt·motion_prompt 에
그대로 옮겨 적지 마라 — 번역 결과만 쓴다. 배경의 사람·사물을 물리적으로 지우는 것은 번역이
아니다(같은 공간, 다른 프레이밍).
(실측 결함: "소음이 사라지며"가 번역 없이 흘러 이미지가 배경 인파를 통째로 지워버렸다 —
공간 연속성 붕괴.)

${stage ? buildStageInstructionBlock(stage) : ''}[공간 앵커 — 같은 씬 연속성 (FIX-B #space-anchor)]
같은 씬의 인접 샷은 프레이밍(사이즈·각도)이 크게 바뀌어도 직전 샷의 공간 앵커(배경 지형지물·
구조물·환경 요소)를 framing.layers 중 최소 한 레이어에 유지하라. 원경 비스타·인서트로 빠지는
샷도 전경/중경에 직전 공간의 요소를 남겨 관객의 공간 감각을 보존한다. 공간 앵커를 제거해도
되는 유일한 경우는 데쿠파주 content 가 공간 이동을 명시했을 때뿐이다.
(실측 결함: 폐허 도시 한가운데 씬에서 비스타 샷 하나만 도시가 통째로 사라져 연속성이 깨졌다.)

[출력 언어 — 전 필드 영어 고정 (2026-07-22 제품 오너 판정 E11)]
아래 자유서술 텍스트 필드는 예외 없이 영어(English)로 작성한다. 한국어 등 다른 언어 절대 금지 —
이 값들은 번역 없이 그대로 이미지/영상 생성기 프롬프트가 되거나(first_frame_prompt, motion_prompt),
다른 영어 문장에 그대로 삽입된다(스토리보드/디렉터 프롬프트 렌더 템플릿).
- intent: dramatic_purpose, duration_justification, audience_focus
- static_spec: framing.focal_point, framing.layers.foreground/midground/background,
  lighting.quality, lighting.key_direction, character_blocking[].pose/gaze/position_in_frame,
  prop_placement[].position_in_frame/significance, texture_notes, color_grading_intent, first_frame_prompt
- character_blocking 에는 **화면에 보이는 사람 캐스트 전원**을 넣는다 — 연기하지 않는 인물
  (원경에서 발견당하는 사람, 지나가는 조연 등)도 포함하고 pose 를 정적으로 적어라(예: "standing
  in the far background"). 이 목록이 곧 이미지 생성의 캐릭터 레퍼런스 명부다 — 여기서 빠지면
  그 인물은 익명으로 그려진다(실측: 원경의 남주가 아무 여인으로 렌더). 단 **사람(person) 캐스트만** 넣는다. 사물(object) 캐스트·소품(들고 다니는
  물건 포함)은 반드시 prop_placement 로 — blocking 에 넣으면 스토리보드가 그 사물을 목각
  인형(사람)으로 그린다(실측: 가슴에 멘 엿판이 '안긴 아기'로 렌더된 사고).
- static_spec 은 **모션 시작 직전의 순간**이다. dynamic_spec 의 motion_prompt/character_motion 이
  만들 도착 상태를 first_frame_prompt·framing·character_blocking[].pose 에 미리 쓰지 마라 —
  액션이 "들어와 무릎 꿇는다"면 START 는 문간에 선 순간(무릎 꿇기 전)이고, "주걱을 내려놓는다"면
  START 는 아직 주걱을 든 손이다. START 가 이미 도착해 있으면 모션이 놀 공간이 없어 START=END
  정지 샷이 된다(실측 9d562ada: '들어와 무릎 꿇는' 샷의 START 가 이미 꿇은 자세 — 전수 감사
  14샷 중 3샷이 이 결함으로 previz 에서 동작 소멸).
- dynamic_spec: character_motion[].verb, gaze_arc[].from/to, environmental_change[].type, motion_prompt
(shot_type/camera_angle/depth_of_field/camera_motion.type/transition_in/out 등 고정 enum 필드는
 원래부터 영어 vocabulary라 이 지시의 대상이 아님 — 그대로 유지)

${MOTION_VOCABULARY_GUIDE}

${disciplineSection}

샷 분배 원칙:
- 1 샷 = ${SHOT_SECONDS_RANGE} (짧고 스냅있게)${compactMode ? '' : ' (V3.avg_shot_seconds 기준 ±2)'}. 긴 침묵 등 예외만 최대 ${SHOT_SECONDS_HARD_MAX}.
- ${DURATION_RUBRIC}
- duration_justification 에는 위 규칙의 **산수를 그대로 적어라** (예: "base 1.2 + medium 2.0 = 3.2 → 4s"). 산수 없는 정성 서술 금지.

V4c (Dynamic) 작성 규칙 (가장 중요):
- character_motion.verb: 동사 1~${SHOT_PHYSICS.verbsPerShotMax}개 이내. **같은 인물의 2동사는 순차 허용**
  (#coverage-first 2026-09-02): 자연스러운 몸의 연쇄(눈을 뜬다 → 몸을 일으킨다)는 순서대로 적고
  duration 이 그 합을 담아야 한다(루브릭). 3동사 이상은 분할. 짧은 샷(≤3s)은 1동사.
- **몸의 전이를 생략하지 마라**: 비트가 "깨어난다/일어선다/들어온다/돌아선다"를 담으면 그 전 과정
  (눈 뜸 → 몸 일으킴 → 둘러봄)이 character_motion 에 있어야 한다. 결과 상태만 적은 정지 샷은
  생략이다(실측: '눈을 뜨며 주위를 살핀다' 비트가 opens eyes(small) 하나·정지 카메라로 나가
  수장이 일어나 대치 중인 둘을 보는 흐름이 통째로 사라졌다).
- **시선의 대상이 프레임 밖이면 리빌이다**: gaze_arc 로 시선을 적고 camera_motion 을 pan/tilt/
  zoom_out 으로 그 대상을 드러내라(데쿠파주 camera_intent=motivated_move 를 따른다). 정지
  카메라로 두려면 그 대상을 담는 다음 샷이 있어야 한다.
- 카메라 큰 무브 + 캐릭터 큰 액션 + 환경 변화 동시 금지
- motion_prompt (최종 출력): ${MOTION_PROMPT_CHARS}, 동사 1~${SHOT_PHYSICS.verbsPerShotMax}개

V4b (Static) 작성 규칙:
- first_frame_prompt: ${FIRST_FRAME_CHARS} OK. 정적 묘사 풍부하게
- 캐릭터 의상/포즈/시선, 소품 배치, 조명 방향, 색감 모두 명시

asset_version: v1 (기본 상태) | v2+ (의상/감정/외형 변화)
- 같은 씬 내 큰 변화 없으면 같은 버전 유지`;

  const userPrompt = `[씬 정보]
${JSON.stringify(scene, null, 2)}

${compactMode
    ? '[sceneCinematography 미제공 — Compact Mode. shotDesign이 자체적으로 디시플린 결정]'
    : `[이 씬의 sceneCinematography 비주얼 플랜 — 반드시 준수]\n${JSON.stringify(plan, null, 2)}`}

[bridge 거친 seed (v4 샷 레시피 — 전역 참고 힌트, 제약 아님)]
${seedV4 || '(없음)'}

[genre (장르/톤)]
${JSON.stringify(genre)}

[이 씬 등장 캐릭터 상세]
${JSON.stringify(
  characters.characters.filter((c) => scene.characters_in_scene.includes(c.id))
)}

[비주얼 스타일 (v0 VisualIdentity — 전역 고정)]
${JSON.stringify(visualIdentity.style)}

[월드 디자인 (v2 WorldVisual)]
palette=${JSON.stringify(worldVisual.global_palette)}
locations=${JSON.stringify(worldVisual.locations.filter((loc) => loc.id === scene.location || scene.location.includes(loc.id)))}

[인물 의상 (v2 CharacterVisual)]
costumes=${JSON.stringify(
    Object.fromEntries(
      characterVisual.characters
        .filter((cv) => scene.characters_in_scene.includes(cv.character_id) && cv.costume?.length)
        .map((cv) => [cv.character_id, cv.costume])
    )
  )}

${prevDesigned?.length ? buildV4ContinuityBlock(prevDesigned) : ''}${decoupageDriven
    ? `[감독 데쿠파주 — 이 샷들에 정확히 1:1로 spec을 붙여라 (샷 수 = ${sceneDec!.length}개, 추가/삭제 금지)]${chunkNote ? `\n${chunkNote}` : ''}
${sceneDec!
        .map(
          (d) =>
            `  ${d.shot_id} [${d.operation}/${d.shot_function}] size=${d.shot_size} dur=${d.intended_duration_seconds}s beats=[${d.source_beats.join(',')}] camera=${d.camera_intent} rhythm=${d.rhythm_role}\n    purpose: ${d.dramatic_purpose}\n    content: ${d.beat_summary}${d.added_rationale ? `\n    added_rationale: ${d.added_rationale}` : ''}`
        )
        .join('\n')}`
    : `[샷 목표 수]
${compactMode ? `씬 길이(${scene.estimated_seconds}초)와 액션 수에 따라 자동 결정 (보통 ${Math.max(1, Math.round((scene.estimated_seconds ?? 30) / 8))}개 ±2)` : `${plan!.shot_count_target}개 (±1 허용)`}`}

[출력 형식 - JSON]
{
  "shots": [
    {
      "intent": {
        "shot_id": "shot_<scene>_<NNN>",
        "scene_id": "${scene.scene_id}",
        "story_beat_ref": 0,
        "dramatic_purpose": "...",
        "duration_seconds": 4,
        "duration_justification": "base 1.2 + medium 2.0 + camera 0.5 = 3.7 → 4s",
        "emotion_arc": { "from": "calm", "to": "unease" },
        "audience_focus": "...",
        "shot_position_in_scene": "opening" | "developing" | "climax" | "resolution" | "transition"
      },
      "static_spec": {
        "shot_id": "shot_<scene>_<NNN>",
        "lens_mm": 50,
        "shot_type": "MS",
        "camera_angle": "eye_level",
        "depth_of_field": "shallow" | "medium" | "deep",
        "framing": {
          "rule": "thirds",
          "layers": { "foreground": "...", "midground": "...", "background": "..." },
          "focal_point": "..."
        },
        "lighting": {
          "key_fill_ratio": "4:1",
          "color_temp_kelvin": 3200,
          "quality": "soft",
          "key_direction": "top_left"
        },
${stage ? `        "camera_setup": {
          "subject": "character_id | [ids] | 'group' | landmark_id",
          "from_direction": "S",
          "height": "eye",
          "lens_mm": 35,
          "over_shoulder_of": null,
          "axis_cross": "none",
          "end": null
        },
` : ''}        "character_blocking": [
          {
            "character_id": "...",
            "position_in_frame": "left_third",
            "pose": "...",
            "gaze": "toward_camera",
            "asset_version": "v1"
          }
        ],
        "prop_placement": [
          { "prop": "...", "position_in_frame": "...", "significance": "..." }
        ],
        "palette_emphasis": ["#..."],
        "texture_notes": "...",
        "color_grading_intent": "...",
        "first_frame_prompt": "${FIRST_FRAME_CHARS} 정적 묘사"
      },
      "dynamic_spec": {
        "shot_id": "shot_<scene>_<NNN>",
        "camera_motion": {
          "type": ${CAMERA_MOTION_TYPE_ENUM_TEXT},
          "direction": ${CAMERA_DIRECTION_ENUM_TEXT},
          "speed": ${MOTION_SPEED_ENUM_TEXT},
          "magnitude": ${CAMERA_MAGNITUDE_ENUM_TEXT}
        },
        "character_motion": [
          { "character_id": "char", "verb": "opens eyes", "magnitude": "small" },
          { "character_id": "char", "verb": "pushes himself up to sitting and turns toward the voices", "magnitude": "medium" }
        ],
        "_character_motion_note": "같은 character_id 의 2동사 = 순차 연쇄(순서대로). magnitude ∈ ${CHARACTER_MAGNITUDE_ENUM_TEXT}. character_id 를 반드시 채워라 — 비면 순서 계약이 붙지 않는다.",
        "gaze_arc": [
          { "character_id": "...", "from": "down", "to": "toward_camera" }
        ],
        "environmental_change": [],
        "transition_in": "cut",
        "transition_out": "cut",
        "motion_prompt": "${MOTION_PROMPT_CHARS}, 동사 1~${SHOT_PHYSICS.verbsPerShotMax}개"
      }
    }
  ]
}`;

  // 씬/청크 단위 재시도(#shape-resilience 2026-07-15): 모델의 비정형 응답 한 번에 스테이지
  //   전체를 죽이지 않는다 — 파싱/검증 실패 시 같은 호출을 1회 재시도, 최종 실패만 throw.
  const MAX_SCENE_TRIES = 2;
  let shots: ShotDesign[] | null = null;
  let lastParseError: unknown = null;
  for (let attempt = 1; attempt <= MAX_SCENE_TRIES && !shots; attempt++) {
    const rawResult = await generateJson<unknown>(userPrompt, axisConfig, {
      systemInstruction,
      temperature: 0.6,
    });

    // 청크 호출은 로그 키가 겹치지 않게 청크 첫 shot_id를, 재시도는 _retryN을 붙인다.
    await logger.saveLlmCall(
      `L4_shots_${scene.scene_id}${chunkNote ? `_${sceneDec?.[0]?.shot_id ?? 'chunk'}` : ''}${attempt > 1 ? `_retry${attempt}` : ''}`,
      {
        prompt: userPrompt,
        response: JSON.stringify(rawResult, null, 2),
        model: describeAxisConfig(axisConfig),
        provider: axisConfig.provider,
      },
    );

    try {
      const parsed = parseL4Shots(rawResult, scene.scene_id);
      // 개수 검증(#p4-json-guard) — 데쿠파주 구동뿐 아니라 plan 구동에도 건다(종전엔 후자가 무검증
      //   이라 대량 소실이 그대로 통과했다). 판정 규칙은 judgeShotCount 참조.
      const expected = decoupageDriven ? sceneDec!.length : plan?.shot_count_target ?? null;
      const tolerance = decoupageDriven ? 0 : 1; // plan 은 프롬프트 계약이 "±1 허용"
      const verdict = judgeShotCount(parsed.length, expected, {
        tolerance,
        isFinalAttempt: attempt === MAX_SCENE_TRIES,
      });
      if (verdict.kind === 'retry' || verdict.kind === 'fatal') {
        throw new Error(`L4 ${verdict.reason} (scene=${scene.scene_id}${chunkNote ? ' 청크' : ''})`);
      }
      if (verdict.kind === 'accept') {
        // 수용하되 흔적을 남긴다 — console.warn 은 흘러가므로 스테이지 산출/마커에도 배지로 박는다.
        console.warn(`[shotDesign] ${scene.scene_id}: ${verdict.reason} — 최종 시도라 수용(배지 기록)`);
        badges?.push({
          scene_id: scene.scene_id,
          expected: expected!,
          got: parsed.length,
          source: decoupageDriven ? 'decoupage' : 'plan',
          ...(chunkNote ? { chunk: chunkNote } : {}),
        });
      }
      shots = parsed;
    } catch (e) {
      lastParseError = e;
      console.warn(
        `[shotDesign] ${scene.scene_id} 응답 파싱/검증 실패 (try ${attempt}/${MAX_SCENE_TRIES}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  if (!shots) {
    throw lastParseError instanceof Error
      ? lastParseError
      : new Error(`L4 parse failed (scene=${scene.scene_id})`);
  }

  // 모션 어휘 교정(#motion-vocab 2026-08-11) — **여기가 유일한 강제 지점**이다.
  //   architecture.md §3: "모델은 제안만 한다 / 검증은 제품 레이어(화이트리스트 → 명시적 apply).
  //   프롬프트의 가드는 보조 방어일 뿐 최종 방어가 아니다."
  //   위 지시서 개정이 1차 방어(어휘를 전부 보여준다)이고, 이 교정이 2차 방어다.
  //   여기서 정본 낱말로 만들어 저장하므로 하류 소비처(계약문·6축·검수·씬 역추론)는
  //   깨끗한 값을 받는다. 소비처의 개별 정규화는 이미 저장된 옛 행을 위한 안전망으로 남긴다.
  const vocabRepairs: string[] = [];
  const normalized = shots.map((shot) => {
    const dyn = shot.dynamic_spec;
    if (!dyn) return shot;
    const { motion, repairs } = normalizeCameraMotion(dyn.camera_motion);
    const characterMotion = (dyn.character_motion ?? []).map((m) => {
      const magnitude = normalizeCharacterMagnitude(m?.magnitude);
      if (m?.magnitude && m.magnitude !== magnitude) {
        repairs.push(`character_motion["${m.verb}"].magnitude "${m.magnitude}" → "${magnitude}"`);
      }
      return { ...m, magnitude };
    });
    if (repairs.length) {
      vocabRepairs.push(`${shot.intent?.shot_id ?? '(id 없음)'}: ${repairs.join(' / ')}`);
    }
    return {
      ...shot,
      dynamic_spec: {
        ...dyn,
        // 매핑 실패(mapped:false)는 원문이 그대로 남는다 — 조용히 static 으로 접지 않는다.
        camera_motion: {
          type: motion.type,
          direction: motion.direction,
          speed: motion.speed,
          magnitude: motion.magnitude,
        },
        character_motion: characterMotion,
      },
    } as ShotDesign;
  });
  // 교정은 조용히 하지 않는다 — 조용한 열화가 이번 사고의 본체였다.
  //   이 파일이 계속 쌓이면 지시서(1차 방어)가 아직 새고 있다는 신호로 읽는다.
  //   saveLlmCall 이 아니라 saveText 인 이유: LLM 호출이 아니라 결정론 후처리 기록이다.
  if (vocabRepairs.length) {
    await logger.saveText(
      `L4_vocab_repair_${scene.scene_id}.txt`,
      vocabRepairs.join('\n'),
    );
  }

  // shot_id 표준화. 데쿠파주 구동 시 감독이 정한 shot_id를 index로 정렬해 보존.
  // #g4(2026-08-27): 사물이 character_blocking 에 섞이면 스토리보드가 "얼굴 없는 인물"로
  //   그린다('엿판이 안긴 아기로' 실사고). 프롬프트로 "사물은 prop_placement 로"라고 지시하지만
  //   모델이 지키지 않는다 — 실측에서 반복 관측됐다. 지시에 의존하지 말고 여기서 바로잡는다.
  //   하류(러프 그리드)의 걸러내기는 이 강제가 자리잡으면 지울 수 있다.
  const objectIds = new Set(
    characters.characters.filter((c) => c.entity_type === 'object').map((c) => c.id),
  );

  return normalized.map((shot, i) => {
    const dec = decoupageDriven && sceneDec![i] ? sceneDec![i] : null;
    const sid = dec
      ? dec.shot_id
      : (shot.intent.shot_id ?? `shot_${scene.scene_id}_${String(i + 1).padStart(3, '0')}`);
    return {
      intent: {
        ...shot.intent,
        shot_id: sid,
        scene_id: scene.scene_id,
        // 데쿠파주 출처를 결정론적으로 보존 (LLM echo 의존 X) — beat→shot 추적성 (#8)
        ...(dec && {
          operation: dec.operation,
          source_beats: dec.source_beats,
          shot_function: dec.shot_function,
          rhythm_role: dec.rhythm_role,
        }),
      },
      static_spec: { ...moveObjectsToProps(shot.static_spec, objectIds), shot_id: sid },
      dynamic_spec: { ...shot.dynamic_spec, shot_id: sid },
    };
  });
}
