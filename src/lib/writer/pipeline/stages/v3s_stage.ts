// V3.5: 씬 무대(Scene stage) — decoupage 뒤, shotDesign 앞 (#stage 2026-09-03, 무대 진단서 1번).
//   씬의 공간을 평면 좌표로 세운다: 표지(지형·소품), 인물의 비트별 위치·향·자세, 180° 축과 카메라 쪽.
//   v4 는 이 무대 위에서 카메라만 고르고(camera_setup), 화면 안 위치·깊이·크기·향은 stage/apply 가 계산한다.
//   실측 근거(겨울_4 2026-09-02): 작가가 샷마다 화면 위치를 새로 골라 30샷 중 8쌍이 좌우 뒤집힘,
//   11쌍이 화면 밖 자세 변화 — 세계 좌표를 적는 자리가 없어서였다.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import { outputLanguageClause } from '@/lib/writer/pipeline/util/output-language';
import {
  extractSceneStage,
  validateSceneStage,
  sanitizeSceneStage,
  buildStageCorrectionNote,
} from '@/lib/writer/pipeline/stage/validate';
import { normalizeStageTransitions } from '@/lib/writer/pipeline/stage/ledger';
import type {
  Characters,
  DecoupagePlan,
  DecoupageShot,
  SceneCinematography,
  SceneStage,
  Scenes,
  StoryScene,
  ValidationIssue,
  WorldVisual,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';
import type { AppLocale } from '@/lib/locale';

const DEFAULT_SCENE_CONCURRENCY = 4;

export interface SceneStageRunResult {
  /** false = 시간 예산으로 일부 씬만 처리 — 다음 step 인보케이션이 resume 으로 이어간다. */
  done: boolean;
  /** 완료 씬 누적(원래 씬 순서). done=false 면 이대로 sceneStagePartial 체크포인트. */
  stages: SceneStage[];
  issues: ValidationIssue[];
}

function personIdsOf(characters: Characters): Set<string> {
  return new Set(characters.characters.filter((c) => c.entity_type !== 'object').map((c) => c.id));
}

function buildSystemInstruction(outputLocale?: AppLocale): string {
  return `당신은 영화의 블로킹(무대 배치) 담당이다. 한 씬의 공간을 평면 좌표로 세운다 — 이 좌표가 이후 모든 샷의
카메라 위치와 화면 안 인물 위치의 진실이 된다. 샷마다 화면 위치를 따로 정하지 않는다.

[좌표계]
- 단위 미터. x = 동(+)/서(−), y = 북(+)/남(−). 씬의 중심 근처가 (0,0). |x|,|y| ≤ 30.
- facing_deg = 인물이 몸을 향한 방향. 0 = 북(+y), 90 = 동(+x), 180 = 남, 270 = 서.
- 인물 키 height_m 은 알 때만(기본 1.75).

[규칙]
1. 첫 비트에 **씬의 사람 인물 전원**을 놓아라. 화면 밖에 있어도 어딘가에 있다.
2. scene_actions 의 인덱스마다(그 비트가 시작되는 순간) 인물 전원의 위치·향·자세를 적어라. 비트 안에서
   이동·자세 변화가 일어나면 end_characters 에 끝 상태를 적어라. 변화가 없는 비트도 적어라(직전과 같아도) —
   샷이 참조하는 모든 비트에 상태가 있어야 한다.
3. 마주 보는 상대(대화·대치)는 서로를 향하게(facing) 하고 1.5~4m 떨어뜨려라. 같은 자리 금지(0.5m 이상).
   화면에 함께 잡힐 인물들은 서로 10m 안에 두어라.
4. 180° 축(axis): 씬의 두 주요 인물 id(sceneCinematography.spatial_axis_180 이 있으면 그것). camera_side 는
   from 에서 to 를 바라볼 때 관객(카메라)이 머무는 쪽 — left | right. 씬 내내 이 쪽에서 본다.
5. landmarks: 로케이션의 지형·소품 중 배치의 기준이 되는 것 3~6개(id 는 snake_case, label 은 영어 한 구절).
   출구·목적지(다음 씬으로 가는 방향)가 있으면 반드시 넣어라.
6. posture ∈ standing | sitting | kneeling | crouching | lying | walking | running | floating | other.
   note 에는 발판·상태 한 구절(영어, 예: "lying on a floating dirt mound", "arms crossed").
7. 이야기 텍스트가 말하지 않은 상태 변화(누워 있다가 나중에 서 있는 인물 등)는 **그 변화가 일어나는 비트를 정해**
   end_characters 로 적어라. 어느 비트에서 일어났는지 없으면 관객은 그 인물이 언제 일어났는지 모른다.
8. 인물 id 는 주어진 것만 쓴다. 사물(object) 캐스트는 무대에 올리지 않는다(필요하면 landmark 로).
9. 데쿠파주의 added 샷(beats=[] — 설정·리액션 등)의 content 도 상태의 근거다. 예: 씬 첫머리의 설정 샷이
   "세 인물이 흩어져 누워 있다"면 beat 0 의 시작 상태는 셋 다 lying 이고, 일어나는 순간은 그 뒤 비트의
   end_characters 로 적는다. 첫 비트 전의 상황(오프닝)을 beat 0 시작 상태에 반영하라.

[출력 — JSON 하나]
{
  "scene_id": "scene_X",
  "landmarks": [ { "id": "forest_gate", "label": "gap between the inverted trees", "x": 0, "y": 30 } ],
  "axis": { "from": "char_a", "to": "char_b" },
  "camera_side": "right",
  "beats": [
    {
      "beat": 0,
      "summary": "three leaders lie scattered",
      "characters": [
        { "character_id": "char_a", "x": -4, "y": 0, "facing_deg": 90, "posture": "lying", "note": "on a floating rock" }
      ],
      "end_characters": [ ... 비트 안에서 바뀌면 끝 상태 (없으면 생략) ... ]
    }
  ],
  "notes": "한 줄: 왜 이렇게 놓았나"
}${outputLanguageClause ? `\n\n${outputLanguageClause(outputLocale)}` : ''}`;
}

function buildUserPrompt(
  scene: StoryScene,
  plan: SceneCinematography | null,
  sceneDec: DecoupageShot[] | null,
  characters: Characters,
  worldVisual: WorldVisual,
): string {
  const people = characters.characters
    .filter((c) => scene.characters_in_scene.includes(c.id) && c.entity_type !== 'object')
    .map((c) => ({ id: c.id, name: c.name, role: c.role }));
  const location = worldVisual.locations.filter((l) => l.id === scene.location || scene.location.includes(l.id));
  const beats = scene.scene_actions.map((a, i) => `  [${i}] ${a}`).join('\n');
  const shots = (sceneDec ?? [])
    .map((d) => `  ${d.shot_id} size=${d.shot_size} function=${d.shot_function} beats=[${d.source_beats.join(',')}] — ${d.beat_summary}`)
    .join('\n');
  return `[씬]
scene_id=${scene.scene_id} location=${scene.location} time=${scene.time_of_day}
purpose=${scene.purpose} emotion=${scene.emotion_beat.start}→${scene.emotion_beat.end}
characters_in_scene(사람만)=${JSON.stringify(people)}

[내러티브 비트 (scene_actions) — 인덱스 주목]
${beats}

[로케이션 (v2 WorldVisual)]
${JSON.stringify(location)}

${plan ? `[씬 비주얼 플랜 (v3) — 축·시점·커버리지]\nspatial_axis_180=${JSON.stringify(plan.spatial_axis_180 ?? null)} dominant_pov=${plan.dominant_pov} coverage=${plan.coverage_pattern} lens=${JSON.stringify(plan.lens_vocabulary)}` : '[씬 비주얼 플랜 없음 — 축은 스스로 정하라]'}

${shots ? `[감독 데쿠파주 — 이 샷들이 이 무대 위에서 찍힌다. 각 샷이 참조하는 비트에 상태가 있어야 한다]\n${shots}` : '[데쿠파주 없음]'}

위 규칙대로 이 씬의 무대 JSON 을 출력하라.`;
}

async function stageForScene(
  scene: StoryScene,
  plan: SceneCinematography | null,
  sceneDec: DecoupageShot[] | null,
  characters: Characters,
  worldVisual: WorldVisual,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  outputLocale?: AppLocale,
): Promise<{ stage: SceneStage; issues: ValidationIssue[] }> {
  const systemInstruction = buildSystemInstruction(outputLocale);
  const userPrompt = buildUserPrompt(scene, plan, sceneDec, characters, worldVisual);
  const personIds = personIdsOf(characters);
  const ctx = { scene_id: scene.scene_id, characters_in_scene: scene.characters_in_scene, scene_actions: scene.scene_actions };

  const call = async (prompt: string, label: string, temperature: number) => {
    const raw = await generateJson<unknown>(prompt, axisConfig, { systemInstruction, temperature });
    await logger.saveLlmCall(label, {
      prompt,
      response: JSON.stringify(raw, null, 2),
      model: describeAxisConfig(axisConfig),
      provider: axisConfig.provider,
    });
    return extractSceneStage(raw, scene.scene_id);
  };

  let stage = await call(userPrompt, `stage_${scene.scene_id}`, 0.4);
  if (!stage) throw new Error(`sceneStage: unreadable response (scene=${scene.scene_id})`);
  let validation = validateSceneStage(stage, ctx, personIds, sceneDec);
  const critCount = (v: typeof validation) => v.issues.filter((i) => i.severity === 'CRITICAL').length;

  if (!validation.valid) {
    const repairPrompt = `${userPrompt}

[규칙 위반 — 아래 항목을 반드시 고쳐 동일 JSON 형식으로 다시 출력]
${buildStageCorrectionNote(validation.issues)}`;
    const repaired = await call(repairPrompt, `stage_${scene.scene_id}_repair`, 0.3);
    if (repaired) {
      const rv = validateSceneStage(repaired, ctx, personIds, sceneDec);
      if (critCount(rv) <= critCount(validation)) {
        stage = repaired;
        validation = rv;
      }
    }
  }
  if (!validation.valid) {
    // 최종 방어: 알 수 없는 id·빠진 인물을 걷어내고 진행 — 이슈는 그대로 남겨 보인다.
    stage = sanitizeSceneStage(stage, ctx, personIds);
    validation = {
      issues: [
        ...validation.issues,
        { category: 'cinematography', severity: 'WARNING', location: scene.scene_id, message: '무대를 교정 재생성 뒤에도 규칙 위반이 남아 자동 정리(sanitize)로 진행했다', suggestion: '무대(scenes.stage)를 확인하라' },
        ...validateSceneStage(stage, ctx, personIds, sceneDec).issues,
      ],
      valid: true,
    };
  }
  // #ledger: 비트 사이의 설명 없는 변화를 직전 비트 끝으로 옮겨(정규화) 보여줄 자리를 만든 상태로 기록한다.
  return { stage: normalizeStageTransitions(stage), issues: validation.issues };
}

export async function runSceneStage(
  characters: Characters,
  scenes: Scenes,
  worldVisual: WorldVisual,
  sceneCinematographyPlans: SceneCinematography[] | null,
  decoupage: DecoupagePlan | null,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  opts?: {
    /** 이전 step 이 남긴 완료 씬 체크포인트(decoupage 와 같은 계약). */
    resume?: SceneStage[] | null;
    /** step 시간 예산 — 씬 하나를 끝낸 뒤 넘었으면 부분 반환. */
    softDeadlineMs?: number;
    concurrency?: number;
    outputLocale?: AppLocale;
  },
): Promise<SceneStageRunResult> {
  const doneById = new Map((opts?.resume ?? []).map((s) => [s.scene_id, s]));
  const softDeadlineMs = opts?.softDeadlineMs;
  await logger.markStage('sceneStage', 'started', {
    scene_count: scenes.scenes.length,
    resumed_scenes: doneById.size,
  });

  const queue = scenes.scenes.filter((sc) => !doneById.has(sc.scene_id));
  const concurrency = Math.max(1, Math.floor(opts?.concurrency ?? DEFAULT_SCENE_CONCURRENCY));
  const issues: ValidationIssue[] = [];
  let launchedAny = false;
  let progressed = 0;
  let estSceneMs = 30_000;
  const sceneErrors: unknown[] = [];
  const worker = async (): Promise<void> => {
    for (;;) {
      const overBudget = softDeadlineMs != null && Date.now() + (launchedAny ? estSceneMs : 0) > softDeadlineMs;
      if (overBudget && launchedAny) return;
      const scene = queue.shift();
      if (!scene) return;
      launchedAny = true;
      const plan = sceneCinematographyPlans?.find((p) => p.scene_id === scene.scene_id) ?? null;
      const sceneDec = decoupage?.scenes.find((d) => d.scene_id === scene.scene_id)?.shots ?? null;
      const startedMs = Date.now();
      try {
        const r = await stageForScene(scene, plan, sceneDec, characters, worldVisual, logger, axisConfig, opts?.outputLocale);
        doneById.set(scene.scene_id, r.stage);
        issues.push(...r.issues);
        progressed += 1;
        estSceneMs = Math.max(estSceneMs, Math.round((Date.now() - startedMs) * 1.25));
      } catch (e) {
        sceneErrors.push(e);
        console.error(`[sceneStage] scene ${scene.scene_id} failed (checkpointing ${progressed} successes):`, e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (sceneErrors.length > 0 && progressed === 0) throw sceneErrors[0];

  const ordered = scenes.scenes.map((sc) => doneById.get(sc.scene_id)).filter((s): s is SceneStage => s !== undefined);
  if (ordered.length < scenes.scenes.length) {
    return { done: false, stages: ordered, issues };
  }

  await logger.saveStage('10c_v3s_sceneStage.json', { stages: ordered, issues });
  await logger.markStage('sceneStage', 'completed', {
    scene_count: ordered.length,
    issues: issues.length,
    critical: issues.filter((i) => i.severity === 'CRITICAL').length,
  });
  return { done: true, stages: ordered, issues };
}
