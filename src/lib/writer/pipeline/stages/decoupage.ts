// Découpage: 감독의 beat→shot 분해 (Director's authored shot breakdown)
//   linear_pipeline.md Turn 7 설계 구현. S3 비트(scene_actions)와 샷을 분리.
//   감독(LLM)이 4연산(derived/added/merged/split)으로 샷을 *저작*한다.
//   - 샷 개수는 연출적 결정 (shot_count_target은 힌트일 뿐)
//   - ADD: 스토리에 없는 establishing/reaction/insert/cutaway 추가 = 연출의 핵심
//   - 리듬 저작 (establish→develop→punctuate→breath) = "뇌 아픈 영상" 해독제
//   - 시간 제약은 validator (각 샷 5~15초). action_budget이 후단에서 검증.
//
// 출력 DecoupagePlan은 V4 입력으로 사용됨 (V4가 각 샷에 3분할 spec을 붙임).
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  DecoupagePlan,
  DecoupageShot,
  WorldVisual,
  SceneCinematography,
  Genre,
  Characters,
  Scenes,
  StoryScene,
  SceneDecoupage,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

const SYSTEM_INSTRUCTION = `당신은 영화 감독이다. 한 씬의 내러티브 비트(scene_actions)를 받아 *데쿠파주(découpage)* — 샷 분해 — 를 저작한다.

== 핵심 원칙 ==
1. 비트 ≠ 샷. 비트는 "무슨 일이 일어나는가"(내러티브), 샷은 "어떻게 찍는가"(카메라). 한 비트를 여러 샷으로, 여러 비트를 한 샷으로 자유롭게 매핑한다.
2. 샷 개수는 네가 *연출적으로* 결정한다. shot_count_target은 참고용 힌트일 뿐 제약이 아니다. 필요하면 비트 수보다 많아도 된다.
3. 모든 비트를 커버하라. 의도적으로 생략(REMOVE)할 때만 uncovered_beats에 인덱스를 명시한다.

== 4가지 연산 (적극 사용) ==
- derived: 비트 1:1 매핑. source_beats=[해당 인덱스].
- added: 스토리에 *없는* 샷 추가. **이것이 연출의 본질이다.** source_beats=[]. added_rationale 필수.
  · establishing — 공간/스케일을 먼저 보여줘 관객을 오리엔트 (씬 첫머리 EWS/WS)
  · reaction — 대사/사건에 대한 인물의 반응 (CU). 시선 흐름을 잡고 감정을 전달
  · insert — 서사적으로 중요한 소품 디테일 (ECU). 예: 뽑히는 검, 빛나는 심장
  · cutaway — 긴장을 위한 시선 분산
- merged: 여러 비트를 한 롱테이크로. source_beats=[i,j,...]. 긴장/몰입/실시간감이 필요할 때.
- split: 한 비트를 여러 샷으로. 여러 출력 샷이 같은 source_beats=[i]를 공유. 커버리지/리듬/강조에.

== 리듬 저작 (가장 중요 — "뇌가 아픈" 영상의 해독제) ==
- 모든 샷이 같은 길이·에너지면 안 된다. rhythm_role을 다양하게: establish(느림) → develop(중간) → punctuate(짧고 강함) → breath(정적 쉼).
- 감정 곡선에 컷 템포를 맞춘다: 긴장 고조 = accelerate(점점 짧은 컷), 여운/몰입 = sustain(긴 테이크).
- 정적 비트(breath 또는 static)를 반드시 1개 이상 배치한다 — 관객의 눈이 쉴 곳.

== 쇼트 사이즈 문법 ==
- establishing(EWS/WS) → 전개(MS/MFS) → 강조(CU/ECU)의 흐름. 같은 사이즈를 연속 배치하지 마라(시각 단조 = 집중 저하).

== 카메라 규율 ==
- camera_intent는 'static'이 기본. 'motivated_move'는 *감정적 동기*가 명확할 때만 쓰고 camera_move_motivation에 그 동기를 적는다.
- 이유 없는 카메라 무빙은 금지 (생성 영상이 "둥둥 떠다니며 집중 안 되는" 가장 큰 원인).

== 시간 제약 (validator) ==
- 각 샷 intended_duration_seconds는 2~8초 (짧고 스냅있게). 1개 주요 액션이 들어맞는 길이. 긴 침묵 등 예외만 최대 10초.
- 한 샷에 액션을 몰아넣지 마라. 액션이 크거나 여러 개면 split으로 나눠라.`;

interface SceneDecoupageResponse {
  shot_count?: number;
  rhythm_profile?: string;
  uncovered_beats?: number[];
  shots: Omit<DecoupageShot, 'scene_id'>[];
}

function buildUserPrompt(
  scene: StoryScene,
  plan: SceneCinematography | null,
  genre: Genre,
  characters: Characters,
  worldVisual: WorldVisual,
): string {
  const beatList = scene.scene_actions
    .map((a, i) => `  [${i}] ${a}`)
    .join('\n');

  const planHint = plan
    ? `[sceneCinematography 비주얼 플랜 — 참고용 힌트 (제약 아님)]
coverage_pattern=${plan.coverage_pattern}, shot_count_target=${plan.shot_count_target} (힌트), rhythm_profile=${plan.rhythm_profile}, cut_pace=${plan.cut_pace}, avg_shot_seconds=${plan.avg_shot_seconds}, lens=${plan.lens_vocabulary.join('/')}mm, energy=${plan.camera_energy}`
    : `[sceneCinematography 미제공 — Compact Mode. 데쿠파주를 자체 판단으로 저작]`;

  return `[씬 정보]
scene_id=${scene.scene_id}, purpose=${scene.purpose}, location=${scene.location}, time=${scene.time_of_day}
감정 곡선: ${scene.emotion_beat.start} → ${scene.emotion_beat.end}
estimated_seconds=${scene.estimated_seconds}
info_asymmetry=${scene.info_asymmetry}
dialogue=${scene.dialogue_summary}
${scene.key_dialogue && scene.key_dialogue.length > 0 ? `key_dialogue=${JSON.stringify(scene.key_dialogue)}` : ''}

[내러티브 비트 (scene_actions) — 인덱스 주목]
${beatList}

${planHint}

[genre 장르/톤]
genre=${genre.genre}, tone=${genre.tone.join('/')}, targetEmotion=${genre.targetEmotion.join('/')}

[등장 캐릭터]
${JSON.stringify(
  characters.characters
    .filter((c) => scene.characters_in_scene.includes(c.id))
    .map((c) => ({ id: c.id, role: c.role, personality: c.personality }))
)}

[로케이션 디자인]
${JSON.stringify(worldVisual.locations.filter((loc) => loc.id === scene.location || scene.location.includes(loc.id)))}

[출력 형식 - JSON]
{
  "shot_count": <샷 수>,
  "rhythm_profile": "이 씬의 정적/동적 에너지 곡선 1줄",
  "uncovered_beats": [],
  "shots": [
    {
      "shot_id": "shot_${scene.scene_id}_001",
      "operation": "derived" | "added" | "merged" | "split",
      "shot_function": "establishing" | "master" | "action" | "reaction" | "insert" | "cutaway" | "detail" | "pov" | "reveal" | "transition",
      "source_beats": [0],
      "added_rationale": "operation=added일 때만",
      "beat_summary": "이 샷이 담는 내용 (영어)",
      "beat_summary_native": "beat_summary와 같은 내용을 씬 텍스트(scene_actions)와 같은 언어로 — 연출 용어 없이 이야기 문장으로",
      "shot_size": "EWS" | "WS" | "FS" | "MFS" | "MS" | "MCU" | "CU" | "ECU" | "OTS" | "2S" | "POV",
      "intended_duration_seconds": 6,
      "rhythm_role": "establish" | "develop" | "punctuate" | "sustain" | "accelerate" | "breath",
      "camera_intent": "static" | "motivated_move",
      "camera_move_motivation": "motivated_move일 때만",
      "dramatic_purpose": "왜 이 샷인가"
    }
  ]
}`;
}

function coerceSceneShots(raw: unknown): SceneDecoupageResponse {
  // 모델 응답 shape 방어: { shots:[...] } | [...] | [{shots:[...]}]
  let obj: Record<string, unknown> | null = null;
  if (Array.isArray(raw)) {
    if (raw.length === 1 && raw[0] && typeof raw[0] === 'object' && 'shots' in (raw[0] as object)) {
      obj = raw[0] as Record<string, unknown>;
    } else if (raw.every((x) => x && typeof x === 'object' && 'operation' in (x as object))) {
      obj = { shots: raw };
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }
  if (!obj || !Array.isArray(obj.shots)) {
    throw new Error(`Découpage unexpected shape: ${JSON.stringify(raw).slice(0, 200)}`);
  }
  return {
    shot_count: typeof obj.shot_count === 'number' ? obj.shot_count : undefined,
    rhythm_profile: typeof obj.rhythm_profile === 'string' ? obj.rhythm_profile : undefined,
    uncovered_beats: Array.isArray(obj.uncovered_beats) ? (obj.uncovered_beats as number[]) : [],
    shots: obj.shots as Omit<DecoupageShot, 'scene_id'>[],
  };
}

async function decoupageForScene(
  scene: StoryScene,
  plan: SceneCinematography | null,
  genre: Genre,
  characters: Characters,
  worldVisual: WorldVisual,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<SceneDecoupage> {
  const userPrompt = buildUserPrompt(scene, plan, genre, characters, worldVisual);

  const raw = await generateJson<unknown>(userPrompt, axisConfig, {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.7, // 연출 창의성 (V4보다 약간 높게)
  });

  await logger.saveLlmCall(`decoupage_${scene.scene_id}`, {
    prompt: userPrompt,
    response: JSON.stringify(raw, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  const parsed = coerceSceneShots(raw);

  // shot_id 표준화 + scene_id 주입
  const shots: DecoupageShot[] = parsed.shots.map((s, i) => {
    const sid = s.shot_id ?? `shot_${scene.scene_id}_${String(i + 1).padStart(3, '0')}`;
    return {
      ...s,
      shot_id: sid,
      scene_id: scene.scene_id,
      source_beats: Array.isArray(s.source_beats) ? s.source_beats : [],
    };
  });

  if (shots.length === 0) {
    throw new Error(`Découpage empty shots (scene=${scene.scene_id})`);
  }

  const beatCount = scene.scene_actions.length;
  return {
    scene_id: scene.scene_id,
    beat_count: beatCount,
    shot_count: shots.length,
    coverage_ratio: beatCount > 0 ? Number((shots.length / beatCount).toFixed(2)) : 0,
    rhythm_profile: parsed.rhythm_profile ?? '',
    uncovered_beats: parsed.uncovered_beats ?? [],
    shots,
  };
}

export async function runDecoupage(
  genre: Genre,
  characters: Characters,
  scenes: Scenes,
  worldVisual: WorldVisual,
  sceneCinematographyPlans: SceneCinematography[] | null,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<DecoupagePlan> {
  await logger.markStage('decoupage', 'started', { scene_count: scenes.scenes.length });

  const sceneDecoupages: SceneDecoupage[] = [];
  for (const scene of scenes.scenes) {
    const plan = sceneCinematographyPlans?.find((p) => p.scene_id === scene.scene_id) ?? null;
    const sceneDec = await decoupageForScene(scene, plan, genre, characters, worldVisual, logger, axisConfig);
    sceneDecoupages.push(sceneDec);
  }

  // 전역 shot_id 재인덱싱 (씬 경계 넘어 순번)
  let globalIdx = 0;
  for (const sd of sceneDecoupages) {
    sd.shots = sd.shots.map((shot) => {
      globalIdx += 1;
      return { ...shot, shot_id: `shot_${globalIdx}` };
    });
  }

  const allShots = sceneDecoupages.flatMap((s) => s.shots);
  const plan: DecoupagePlan = {
    scenes: sceneDecoupages,
    total_shots: allShots.length,
    total_added: allShots.filter((s) => s.operation === 'added').length,
    total_merged: allShots.filter((s) => s.operation === 'merged').length,
    total_split: allShots.filter((s) => s.operation === 'split').length,
    director_notes: sceneDecoupages.map((s) => `${s.scene_id}: ${s.beat_count}beats→${s.shot_count}shots (${s.rhythm_profile})`).join(' | '),
  };

  await logger.saveStage('10b_c_decoupage.json', plan);
  await logger.markStage('decoupage', 'completed', {
    total_shots: plan.total_shots,
    total_added: plan.total_added,
    total_merged: plan.total_merged,
    total_split: plan.total_split,
  });

  return plan;
}
