// L4: 샷 단위 3분할
//   L4a: 연출 의도 (story beat 1:1)
//   L4b: 정적 시각 (Image 생성기 입력 — 풍부)
//   L4c: 동적 시각 (Video 생성기 입력 — 압축)
//
// 입력: L3 SceneVisualPlan으로 씬 디시플린이 잡혀 있어, 자유도가 제한됨.
//        각 샷은 L3 vocabulary 안에서만 결정.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  DecoupagePlan,
  DecoupageShot,
  ArtDirection,
  ProductionDesign,
  SceneCinematography,
  ShotDesign,
  ShotIntent,
  ShotStaticSpec,
  ShotDynamicSpec,
  Genre,
  Characters,
  Scenes,
  StoryScene,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

export async function runShotDesign(
  genre: Genre,
  characters: Characters,
  scenes: Scenes,
  artDirection: ArtDirection,
  productionDesign: ProductionDesign,
  sceneCinematographyPlans: SceneCinematography[] | null,  // null이면 Compact Mode
  decoupage: DecoupagePlan | null,          // 감독 데쿠파주. null이면 L4가 자체적으로 샷 수 결정 (legacy)
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<ShotDesign[]> {
  const compactMode = sceneCinematographyPlans === null;
  await logger.markStage('shotDesign', 'started', { compact_mode: compactMode, decoupage_driven: decoupage !== null });

  // 씬별로 L4 생성 (씬 디시플린 명확하게 적용하기 위해 분리 호출)
  const allShots: ShotDesign[] = [];
  for (const scene of scenes.scenes) {
    const plan = compactMode ? null : sceneCinematographyPlans!.find((p) => p.scene_id === scene.scene_id) ?? null;
    if (!compactMode && !plan) {
      console.warn(`[shotDesign] no sceneCinematography plan for ${scene.scene_id}, skipping`);
      continue;
    }
    const sceneDec = decoupage?.scenes.find((d) => d.scene_id === scene.scene_id)?.shots ?? null;
    const sceneShots = await generateL4ForScene(scene, plan, sceneDec, genre, characters, artDirection, productionDesign, logger, axisConfig);
    allShots.push(...sceneShots);
  }

  await logger.saveStage('11_shotDesign.json', { shots: allShots, compact_mode: compactMode });
  await logger.markStage('shotDesign', 'completed', { shot_count: allShots.length, compact_mode: compactMode });

  return allShots;
}

async function generateL4ForScene(
  scene: StoryScene,
  plan: SceneCinematography | null,    // null = Compact Mode (sceneCinematography 미제공)
  sceneDec: DecoupageShot[] | null,  // 감독 데쿠파주 샷 목록. null이면 자체 결정 (legacy)
  genre: Genre,
  characters: Characters,
  artDirection: ArtDirection,
  productionDesign: ProductionDesign,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<ShotDesign[]> {
  const compactMode = plan === null;
  const decoupageDriven = sceneDec !== null && sceneDec.length > 0;
  const disciplineSection = compactMode
    ? `[Compact Mode — L3 미제공]
짧은 영상(D1~D3)이라 씬 비주얼 플랜 단계가 생략됨.
디시플린을 L4 자체에서 결정한다:
- lens_mm: 50mm 기본, 필요 시 35/85 변주 (씬 내 1~2종으로 제한)
- camera_motion.type: 짧은 영상은 단순/안정 우선 (static or handheld_drift 위주)
- color_temp_kelvin: 씬 시간대/무드에 맞춰 일관 유지
- key_fill_ratio: 4:1 기본 (드라마틱) 또는 2:1 (자연)
- 샷 개수: 액션 예산에 따라 자동
- 시선/180°축: 대화 씬이면 자체적으로 일관 유지`
    : `[일반 모드 — L3 디시플린 준수]
- lens_mm은 반드시 L3.lens_vocabulary 안에서 선택
- camera_motion.type은 L3.camera_mounting + camera_energy에 부합
  · tripod + static → 'static'만
  · handheld + breathing → 'static' or 'handheld_drift'만
  · gimbal + kinetic → 'tracking', 'dolly_in/out' 허용
- color_temp_kelvin은 L3.lighting_arc.start_K~end_K 사이에서 진행
- key_fill_ratio는 L3.lighting_arc.dominant_ratio 기준
- 샷 개수는 L3.shot_count_target ±1
- 시선/180°축은 L3.spatial_axis_180 준수`;

  const systemInstruction = `당신은 V축 L4(샷 실행) 디자이너이다.${decoupageDriven ? `

[데쿠파주 확정 모드]
감독이 이미 샷 분해(데쿠파주)를 확정했다. 아래 [감독 데쿠파주] 목록의 각 샷에 3분할 spec(intent/static/dynamic)을 붙이는 것이 너의 일이다.
- 샷 개수·경계·순서를 바꾸지 마라 (추가/삭제/병합/분할 금지 — 감독의 결정).
- 각 샷의 shot_id, shot_function, shot_size, intended_duration_seconds, source_beats, camera_intent를 존중하라.
- static_spec.shot_type은 데쿠파주의 shot_size를 그대로 사용한다.
- intent.duration_seconds는 데쿠파주의 intended_duration_seconds를 따른다.
- dynamic_spec.camera_motion.type은 camera_intent를 따른다 (static이면 'static').
- intent.shot_id는 데쿠파주 shot_id를 그대로 유지한다.` : ''}
한 씬 안의 모든 샷을 생성한다.

L4는 3분할:
  L4a (Intent): 연출 의도. story_beat_ref로 scene_actions에 1:1 매핑.
  L4b (Static): Image 생성기 입력. 첫 프레임의 모든 정적 요소.
  L4c (Dynamic): Video 생성기 입력. 5~15초의 동적 변화. 압축 필수.

${disciplineSection}

샷 분배 원칙:
- 1 샷 = 5~15초${compactMode ? '' : ' (L3.avg_shot_seconds 기준 ±2)'}
- duration은 story_beat의 무게에 따라 가변 (긴 침묵 = 길게, 빠른 액션 = 짧게)

L4c (Dynamic) 작성 규칙 (가장 중요):
- character_motion.verb: 동사 1~2개 이내, 순차 표현 금지
- 카메라 큰 무브 + 캐릭터 큰 액션 + 환경 변화 동시 금지
- motion_prompt (최종 출력): 50~80자, 동사 1~2개

L4b (Static) 작성 규칙:
- first_frame_prompt: 200~400자 OK. 정적 묘사 풍부하게
- 캐릭터 의상/포즈/시선, 소품 배치, 조명 방향, 색감 모두 명시

asset_version: v1 (기본 상태) | v2+ (의상/감정/외형 변화)
- 같은 씬 내 큰 변화 없으면 같은 버전 유지`;

  const userPrompt = `[씬 정보]
${JSON.stringify(scene, null, 2)}

${compactMode
    ? '[sceneCinematography 미제공 — Compact Mode. shotDesign이 자체적으로 디시플린 결정]'
    : `[이 씬의 sceneCinematography 비주얼 플랜 — 반드시 준수]\n${JSON.stringify(plan, null, 2)}`}

[genre (장르/톤)]
${JSON.stringify(genre)}

[이 씬 등장 캐릭터 상세]
${JSON.stringify(
  characters.characters.filter((c) => scene.characters_in_scene.includes(c.id))
)}

[artDirection (시각 스타일)]
${JSON.stringify(artDirection)}

[productionDesign (글로벌 디자인)]
palette=${JSON.stringify(productionDesign.global_palette)}
locations=${JSON.stringify(productionDesign.locations.filter((loc) => loc.id === scene.location || scene.location.includes(loc.id)))}
costumes=${JSON.stringify(
    Object.fromEntries(
      scene.characters_in_scene
        .map((cid) => [cid, productionDesign.costumes[cid]])
        .filter(([, v]) => v !== undefined)
    )
  )}

${decoupageDriven
    ? `[감독 데쿠파주 — 이 샷들에 정확히 1:1로 spec을 붙여라 (샷 수 = ${sceneDec!.length}개, 추가/삭제 금지)]
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

  const rawResult = await generateJson<unknown>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.6,
  });

  await logger.saveLlmCall(`L4_shots_${scene.scene_id}`, {
    prompt: userPrompt,
    response: JSON.stringify(rawResult, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  // 방어: 모델이 다음 중 하나로 응답할 수 있음
  //   ① { shots: [...] }                  ← 기대 형식
  //   ② [{ shots: [...] }]                ← array 래핑
  //   ③ [ { intent, static_spec, ... } ]  ← shots 배열을 바로 반환
  //   ④ { shots: [{ shots: [...] }] }     ← 이중 중첩 (드물지만)
  let shots: ShotDesign[];
  const r = rawResult as { shots?: unknown } | unknown[];
  if (Array.isArray(r)) {
    if (r.length === 1 && r[0] && typeof r[0] === 'object' && 'shots' in r[0]) {
      shots = (r[0] as { shots: ShotDesign[] }).shots;
    } else if (r.every((x) => x && typeof x === 'object' && 'intent' in (x as object))) {
      shots = r as ShotDesign[];
    } else {
      throw new Error(`L4 unexpected array shape (scene=${scene.scene_id}): ${JSON.stringify(r).slice(0, 200)}`);
    }
  } else if (r && typeof r === 'object' && 'shots' in r && Array.isArray((r as { shots: unknown }).shots)) {
    const inner = (r as { shots: unknown[] }).shots;
    // 케이스 ④: shots가 [{shots:[...]}] 형태
    if (inner.length > 0 && inner[0] && typeof inner[0] === 'object' && 'shots' in (inner[0] as object) && !('intent' in (inner[0] as object))) {
      shots = (inner[0] as { shots: ShotDesign[] }).shots;
    } else {
      shots = inner as ShotDesign[];
    }
  } else {
    throw new Error(`L4 unexpected shape (scene=${scene.scene_id}): ${JSON.stringify(r).slice(0, 200)}`);
  }

  if (!Array.isArray(shots) || shots.length === 0) {
    throw new Error(`L4 empty shots (scene=${scene.scene_id})`);
  }

  // shot_id 표준화. 데쿠파주 구동 시 감독이 정한 shot_id를 index로 정렬해 보존.
  return shots.map((shot, i) => {
    const sid = decoupageDriven && sceneDec![i]
      ? sceneDec![i].shot_id
      : (shot.intent.shot_id ?? `shot_${scene.scene_id}_${String(i + 1).padStart(3, '0')}`);
    return {
      intent: { ...shot.intent, shot_id: sid, scene_id: scene.scene_id },
      static_spec: { ...shot.static_spec, shot_id: sid },
      dynamic_spec: { ...shot.dynamic_spec, shot_id: sid },
    };
  });
}
