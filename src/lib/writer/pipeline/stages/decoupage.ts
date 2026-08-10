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
import { SHOT_SECONDS_RANGE, SHOT_SECONDS_HARD_MAX } from '@/lib/writer/pipeline/physics';
import { REPRESENTATIVE_DEPTHS, REPRESENTATIVE_SHOT_CAP } from '@/lib/writer/pipeline/budget';
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
- 각 샷 intended_duration_seconds는 ${SHOT_SECONDS_RANGE} (짧고 스냅있게). 1개 주요 액션이 들어맞는 길이. 긴 침묵 등 예외만 최대 ${SHOT_SECONDS_HARD_MAX}.
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
  shotBudgetHint: number | null,
): string {
  const beatList = scene.scene_actions
    .map((a, i) => `  [${i}] ${a}`)
    .join('\n');

  // #p2-pacing 2026-08-04: "참고용 힌트 (제약 아님)" → 협상 규칙 승격. 힌트 시절 실측:
  //   타깃 5샷×6s 설계가 8샷 평균 3.2s 로 압착돼 인지 과부하 컷이 됐다 (lab/previz-quality §7).
  const planHint = plan
    ? `[sceneCinematography 비주얼 플랜 — 협상 규칙 (단순 힌트 아님)]
coverage_pattern=${plan.coverage_pattern}, shot_count_target=${plan.shot_count_target}, rhythm_profile=${plan.rhythm_profile}, cut_pace=${plan.cut_pace}, avg_shot_seconds=${plan.avg_shot_seconds}, lens=${plan.lens_vocabulary.join('/')}mm, energy=${plan.camera_energy}
- shot_count_target ±1 을 상한으로 삼아라. 초과가 필요하면 먼저 인접 샷 병합(merge)으로 되돌리고,
  그래도 초과라면 해당 샷 dramatic_purpose 에 초과 사유를 명시하라.
- avg_shot_seconds 는 시청자의 인지 예산이다. intended_duration_seconds 합이 estimated_seconds 를
  넘는 것은 허용된다(하류가 씬 길이를 증액한다) — 샷 수를 늘리려고 개별 샷을 짧게 압착하지 마라.`
    : `[sceneCinematography 미제공 — Compact Mode. 데쿠파주를 자체 판단으로 저작]`;

  // 사이즈 사다리 규칙 — cine 플랜 유무와 무관한 일반 연출 문법 (급전환 45% 실측의 상류 방어).
  const ladderRule = `[샷 사이즈 연속성]
인접 샷의 shot_size 사다리(ECU-CU-MCU-MS-MFS-WS-EWS)에서 3단계 이상 점프는 인서트(ECU 소품 강조)나
POV 같은 명시적 동기 없이 금지 — 사이즈는 점진적으로 이동시켜 시청자의 공간 감각을 보존하라.`;

  // 대표 스토리보드 모드 (E3b 정책 — budget.ts): 장편은 전역 상한을 씬으로 배분한 예산 안에서 저작.
  const budgetHint = shotBudgetHint !== null
    ? `

[샷 예산 — 대표 스토리보드 모드 (장편 정책)]
이 프로젝트는 대표 샷 스토리보드로 제작된다 (전역 정책 상한 ~${REPRESENTATIVE_SHOT_CAP}샷). 이 씬은 **최대 ~${shotBudgetHint}샷**.
모든 비트 커버 원칙은 유지하되 added(설정/반응/인서트)를 아껴 예산 안에서 리듬을 저작하라.`
    : '';

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

${ladderRule}${budgetHint}

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
  shotBudgetHint: number | null,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<SceneDecoupage> {
  const userPrompt = buildUserPrompt(scene, plan, genre, characters, worldVisual, shotBudgetHint);

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

export interface DecoupageRunResult {
  /** false = 시간 예산으로 일부 씬만 처리 — 다음 step 인보케이션이 resume 으로 이어간다. */
  done: boolean;
  /** 완료 씬 누적 (원래 씬 순서). done=false 면 이대로 decoupagePartial 체크포인트가 된다. */
  scenes: SceneDecoupage[];
  /** done=true 일 때만 — 전역 재인덱싱까지 끝난 최종 플랜. */
  plan?: DecoupagePlan;
}

export async function runDecoupage(
  genre: Genre,
  characters: Characters,
  scenes: Scenes,
  worldVisual: WorldVisual,
  sceneCinematographyPlans: SceneCinematography[] | null,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  opts?: {
    /** 이전 step 이 남긴 완료 씬 체크포인트 (#scene-checkpoint 2026-08-09, shotDesign 과 동일 계약). */
    resume?: SceneDecoupage[] | null;
    /** step 시간 예산 — 씬 하나를 끝낸 뒤 넘었으면 부분 반환. 미지정이면 전 씬 완주(로컬 러너). */
    softDeadlineMs?: number;
    /** 동시 처리 씬 수 (#scene-parallel 2026-08-09). 기본 1(순차). 씬들은 상호 독립이고
     *  전역 재인덱싱이 조립 단계라 순서 무관 — 단 한도(429)와 트레이드라 전역 방어 없이 크게 올리지 말 것. */
    concurrency?: number;
  },
): Promise<DecoupageRunResult> {
  const doneById = new Map((opts?.resume ?? []).map((sd) => [sd.scene_id, sd]));
  const softDeadlineMs = opts?.softDeadlineMs;
  await logger.markStage('decoupage', 'started', {
    scene_count: scenes.scenes.length,
    resumed_scenes: doneById.size,
  });

  // 대표 스토리보드 모드 (E3b): 장편(D6~D7)은 전역 샷 상한을 씬 수로 배분해 씬당 예산 힌트로 준다.
  //   scenes.coverage_mode가 있으면 그것이 진실(코드 설정값), 없으면(구버전 산출) depth로 판정.
  const representative = scenes.coverage_mode
    ? scenes.coverage_mode === 'representative'
    : REPRESENTATIVE_DEPTHS.includes(genre.depth_level);
  const shotBudgetHint = representative
    ? Math.max(3, Math.round(REPRESENTATIVE_SHOT_CAP / Math.max(1, scenes.scenes.length)))
    : null;

  // 씬 처리 워커 풀 (#scene-checkpoint + #scene-parallel) — concurrency=1 이면 순차와 동일.
  //   예산 양보: 씬 수 × 씬당 수십 초가 한 인보케이션 예산을 구조적으로 초과해 재시도 3연속
  //   강제 종료로 run 이 죽던 사고(2026-08-06, 17씬)의 직접 처방. 새 씬 "착수 전"에 예산을
  //   검사하되 첫 착수는 무조건 허용한다 — 패스당 최소 1씬 진행 보장(v4_shots 관용구).
  //   씬 실패는 pass 를 죽이지 않는다: 성공분은 체크포인트로 보존되고 실패 씬은 다음 pass 가
  //   재시도한다. 진전이 0인 pass 에서만 throw — 무진전 반복은 attempt 상한(3)이 끊는다.
  const queue = scenes.scenes.filter((sc) => !doneById.has(sc.scene_id));
  const concurrency = Math.max(1, Math.floor(opts?.concurrency ?? 1));
  let launchedAny = false;
  let progressed = 0;
  // 씬 예상 시간 — 착수 게이트용. 관측되면 이 pass 의 최대 실측 ×1.25 로 갱신(보수적).
  //   v2x8 탐색 실측(2026-08-09): 사후 게이트만으론 동시성이 높을 때 큐가 데드라인 전에
  //   비어버려 게이트가 한 번도 안 걸리고 328s(>300s 하드킬)까지 밀렸다 — 착수 시점에
  //   "끝날 시간"을 예측해 막아야 in-flight 꼬리가 하드킬을 넘지 않는다.
  let estSceneMs = 45_000;
  const sceneErrors: unknown[] = [];
  const worker = async (): Promise<void> => {
    for (;;) {
      const overBudget =
        softDeadlineMs != null && Date.now() + (launchedAny ? estSceneMs : 0) > softDeadlineMs;
      if (overBudget && launchedAny) return;
      const scene = queue.shift();
      if (!scene) return;
      launchedAny = true;
      const plan = sceneCinematographyPlans?.find((p) => p.scene_id === scene.scene_id) ?? null;
      const sceneStartedMs = Date.now();
      try {
        const sceneDec = await decoupageForScene(scene, plan, genre, characters, worldVisual, shotBudgetHint, logger, axisConfig);
        doneById.set(scene.scene_id, sceneDec);
        progressed += 1;
        estSceneMs = Math.max(estSceneMs, Math.round((Date.now() - sceneStartedMs) * 1.25));
      } catch (e) {
        sceneErrors.push(e);
        console.error(
          `[decoupage] scene ${scene.scene_id} failed (checkpointing ${progressed} successes):`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (sceneErrors.length > 0 && progressed === 0) throw sceneErrors[0];

  const ordered = scenes.scenes
    .map((sc) => doneById.get(sc.scene_id))
    .filter((sd): sd is SceneDecoupage => sd !== undefined);
  if (ordered.length < scenes.scenes.length) {
    return { done: false, scenes: ordered };
  }

  // 전역 shot_id 재인덱싱 (씬 경계 넘어 순번) — 체크포인트에 저장된 씬-로컬 id 를 최종 조립에서
  //   통일한다. state 에 병합된 객체를 변형하지 않게 얕은 복제 후 재인덱싱.
  const sceneDecoupages = ordered.map((sd) => ({ ...sd }));
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

  return { done: true, scenes: sceneDecoupages, plan };
}
