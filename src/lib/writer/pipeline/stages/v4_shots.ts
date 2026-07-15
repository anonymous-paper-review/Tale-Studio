// V4: 샷 단위 3분할
//   V4a: 연출 의도 (story beat 1:1)
//   V4b: 정적 시각 (Image 생성기 입력 — 풍부)
//   V4c: 동적 시각 (Video 생성기 입력 — 압축)
//
// 입력: V3 SceneVisualPlan으로 씬 디시플린이 잡혀 있어, 자유도가 제한됨.
//        각 샷은 V3 vocabulary 안에서만 결정.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  DecoupagePlan,
  DecoupageShot,
  VisualIdentity,
  WorldVisual,
  CharacterVisual,
  SceneCinematography,
  ShotDesign,
  Genre,
  Characters,
  Scenes,
  StoryScene,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

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
const SHOT_CHUNK_SIZE = 8;

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
  },
): Promise<RunShotDesignResult> {
  const compactMode = sceneCinematographyPlans === null;
  const resume = opts?.resume ?? null;
  const doneSceneIds = new Set(resume?.doneSceneIds ?? []);
  const allShots: ShotDesign[] = [...(resume?.shots ?? [])];
  await logger.markStage('shotDesign', 'started', {
    compact_mode: compactMode,
    decoupage_driven: decoupage !== null,
    resumed_scenes: doneSceneIds.size,
  });

  // 씬별로 V4 생성 (씬 디시플린 명확하게 적용하기 위해 분리 호출)
  let processedThisPass = 0;
  for (const scene of scenes.scenes) {
    if (doneSceneIds.has(scene.scene_id)) continue;
    // 시간 예산 체크는 씬 "사이"에서만 — 이번 패스에서 1씬도 못 하고 미루지는 않는다.
    if (
      processedThisPass > 0 &&
      opts?.softDeadlineMs != null &&
      Date.now() > opts.softDeadlineMs
    ) {
      console.log(
        `[shotDesign] checkpoint: ${doneSceneIds.size}/${scenes.scenes.length} scenes done — 다음 step에서 이어감`,
      );
      return { done: false, doneSceneIds: [...doneSceneIds], shots: allShots };
    }

    const plan = compactMode ? null : sceneCinematographyPlans!.find((p) => p.scene_id === scene.scene_id) ?? null;
    if (!compactMode && !plan) {
      console.warn(`[shotDesign] no sceneCinematography plan for ${scene.scene_id}, skipping`);
      doneSceneIds.add(scene.scene_id); // 재방문 방지 — resume 시에도 동일하게 스킵되게 기록
      continue;
    }
    const sceneDec = decoupage?.scenes.find((d) => d.scene_id === scene.scene_id)?.shots ?? null;

    // 샷이 많은 씬은 청크 분할 호출(#B) — sceneDec를 청크로 넘기면 출력·id 매핑이 청크 단위로 닫힌다.
    const sceneShots: ShotDesign[] = [];
    if (sceneDec && sceneDec.length > SHOT_CHUNK_SIZE) {
      const totalChunks = Math.ceil(sceneDec.length / SHOT_CHUNK_SIZE);
      for (let i = 0; i < sceneDec.length; i += SHOT_CHUNK_SIZE) {
        const chunk = sceneDec.slice(i, i + SHOT_CHUNK_SIZE);
        const chunkNote = `(씬 전체 데쿠파주 ${sceneDec.length}개 중 ${i + 1}~${i + chunk.length}번째 묶음 — ${Math.floor(i / SHOT_CHUNK_SIZE) + 1}/${totalChunks}. 이 묶음의 샷들만 출력하라)`;
        const part = await generateL4ForScene(scene, plan, chunk, genre, characters, visualIdentity, worldVisual, characterVisual, seedV4, logger, axisConfig, chunkNote);
        sceneShots.push(...part);
      }
    } else {
      sceneShots.push(
        ...(await generateL4ForScene(scene, plan, sceneDec, genre, characters, visualIdentity, worldVisual, characterVisual, seedV4, logger, axisConfig)),
      );
    }

    allShots.push(...sceneShots);
    doneSceneIds.add(scene.scene_id);
    processedThisPass += 1;
  }

  await logger.saveStage('11_v4_shotDesign.json', { shots: allShots, compact_mode: compactMode });
  await logger.markStage('shotDesign', 'completed', { shot_count: allShots.length, compact_mode: compactMode });

  return { done: true, doneSceneIds: [...doneSceneIds], shots: allShots };
}

/** 샷 객체 판별 — 3분할 스펙의 핵심 키(intent) 보유 여부. */
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
): Promise<ShotDesign[]> {
  const compactMode = plan === null;
  const decoupageDriven = sceneDec !== null && sceneDec.length > 0;
  const disciplineSection = compactMode
    ? `[Compact Mode — V3 미제공]
짧은 영상(D1~D3)이라 씬 비주얼 플랜 단계가 생략됨.
디시플린을 V4 자체에서 결정한다:
- lens_mm: 50mm 기본, 필요 시 35/85 변주 (씬 내 1~2종으로 제한)
- camera_motion.type: 짧은 영상은 단순/안정 우선 (static or handheld_drift 위주)
- color_temp_kelvin: 씬 시간대/무드에 맞춰 일관 유지
- key_fill_ratio: 4:1 기본 (드라마틱) 또는 2:1 (자연)
- 샷 개수: 액션 예산에 따라 자동
- 시선/180°축: 대화 씬이면 자체적으로 일관 유지`
    : `[일반 모드 — V3 디시플린 준수]
- lens_mm은 반드시 V3.lens_vocabulary 안에서 선택
- camera_motion.type은 V3.camera_mounting + camera_energy에 부합
  · tripod + static → 'static'만
  · handheld + breathing → 'static' or 'handheld_drift'만
  · gimbal + kinetic → 'tracking', 'dolly_in/out' 허용
- color_temp_kelvin은 V3.lighting_arc.start_K~end_K 사이에서 진행
- key_fill_ratio는 V3.lighting_arc.dominant_ratio 기준
- 샷 개수는 V3.shot_count_target ±1
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
  V4a (Intent): 연출 의도. story_beat_ref로 scene_actions에 1:1 매핑.
  V4b (Static): Image 생성기 입력. 첫 프레임의 모든 정적 요소.
  V4c (Dynamic): Video 생성기 입력. 5~15초의 동적 변화. 압축 필수.

${disciplineSection}

샷 분배 원칙:
- 1 샷 = 2~8초 (짧고 스냅있게)${compactMode ? '' : ' (V3.avg_shot_seconds 기준 ±2)'}. 긴 침묵 등 예외만 최대 10초.
- duration은 story_beat의 무게에 따라 가변 (긴 침묵 = 길게, 빠른 액션 = 짧게)

V4c (Dynamic) 작성 규칙 (가장 중요):
- character_motion.verb: 동사 1~2개 이내, 순차 표현 금지
- 카메라 큰 무브 + 캐릭터 큰 액션 + 환경 변화 동시 금지
- motion_prompt (최종 출력): 50~80자, 동사 1~2개

V4b (Static) 작성 규칙:
- first_frame_prompt: 200~400자 OK. 정적 묘사 풍부하게
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

${decoupageDriven
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
        "duration_seconds": 8,
        "duration_justification": "...",
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
        "character_blocking": [
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
        "first_frame_prompt": "200~400자 정적 묘사"
      },
      "dynamic_spec": {
        "shot_id": "shot_<scene>_<NNN>",
        "camera_motion": {
          "type": "static" | "handheld_drift" | "dolly_in" | ...,
          "direction": "forward",
          "speed": "slow",
          "magnitude": "minimal"
        },
        "character_motion": [
          { "character_id": "...", "verb": "고개를 든다", "magnitude": "small" }
        ],
        "gaze_arc": [
          { "character_id": "...", "from": "down", "to": "toward_camera" }
        ],
        "environmental_change": [],
        "transition_in": "cut",
        "transition_out": "cut",
        "motion_prompt": "50~80자, 동사 1~2개"
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
      // 데쿠파주 구동 시 개수 검증 — index 기반 shot_id 매핑이라 개수가 어긋나면 오귀속된다.
      //   재시도로 교정 시도, 최종 시도는 기존 동작(경고 후 수용)으로 파이프라인을 살린다.
      if (decoupageDriven && parsed.length !== sceneDec!.length) {
        if (attempt < MAX_SCENE_TRIES) {
          throw new Error(
            `L4 shot count mismatch (scene=${scene.scene_id}: got ${parsed.length}, expected ${sceneDec!.length})`,
          );
        }
        console.warn(
          `[shotDesign] ${scene.scene_id}: 샷 수 불일치(got ${parsed.length}, expected ${sceneDec!.length}) — 최종 시도라 수용`,
        );
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

  // shot_id 표준화. 데쿠파주 구동 시 감독이 정한 shot_id를 index로 정렬해 보존.
  return shots.map((shot, i) => {
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
      static_spec: { ...shot.static_spec, shot_id: sid },
      dynamic_spec: { ...shot.dynamic_spec, shot_id: sid },
    };
  });
}
