// V3: 씬 단위 비주얼 플랜
// 글로벌 V0~V2와 샷 단위 V4 사이의 다리.
// 한 씬을 어떻게 찍을지 — 커버리지/렌즈/카메라/조명 디시플린 설정.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import { analyzeSceneActionBudget } from '@/lib/writer/pipeline/validators/action_budget';
import {
  validateSceneCinematography,
  buildCorrectionNote,
} from '@/lib/writer/pipeline/validators/scene_cinematography';
import type {
  VisualIdentity,
  WorldVisual,
  SceneCinematography,
  MidPreview,
  Genre,
  Characters,
  Scenes,
  ValidationIssue,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

interface L3Result {
  scene_plans: SceneCinematography[];
  shot_count_total: number;
  budget_issues: ValidationIssue[];
}

// Gemini 응답 shape 비결정성 방어: 기대형 { scene_plans: [...] } 와 최상위 배열 [...] 둘 다 수용.
//   (둘째 형태를 못 받으면 멀쩡한 플랜 전체가 []로 버려져 shot_count=0 → 샷 붕괴, 2026-06-28 사고.)
export function extractScenePlans(raw: unknown): SceneCinematography[] {
  if (Array.isArray(raw)) return raw as SceneCinematography[];
  const sp = (raw as { scene_plans?: unknown } | null)?.scene_plans;
  return Array.isArray(sp) ? (sp as SceneCinematography[]) : [];
}

export async function runSceneCinematography(
  genre: Genre,
  characters: Characters,
  scenes: Scenes,
  visualIdentity: VisualIdentity,
  worldVisual: WorldVisual,
  midPreview: MidPreview,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<L3Result> {
  await logger.markStage('sceneCinematography', 'started');

  // 씬별 액션 예산 분석 (shot_count_target 산정 근거)
  const sceneAnalyses = scenes.scenes.map((scene) => ({
    scene,
    analysis: analyzeSceneActionBudget(scene),
  }));
  const allBudgetIssues = sceneAnalyses.flatMap((sa) => sa.analysis.issues);

  const sceneToShotHint = sceneAnalyses
    .map(
      (sa) =>
        `${sa.scene.scene_id} (${sa.scene.estimated_seconds}s, "${sa.scene.purpose}"): 액션 분석 권장 샷 ${sa.analysis.recommended_shots.length}개`
    )
    .join('\n');

  const systemInstruction = `당신은 V축 V3(씬 비주얼 플랜) 설계자이다.
S3 씬마다 "이 씬을 어떻게 찍을 것인가"의 영상 문법을 결정한다.
글로벌 V0~V2는 이미 정해졌고, 샷 단위 V4는 다음 단계. V3는 그 사이를 메우는 씬 디시플린.

핵심 원칙:
- 씬 단위 일관성: 한 씬 내 lens / mount / energy는 일관되어야 함
- 패턴 선택: 씬 톤과 목적에 따라 coverage_pattern 선택
- 180° 축 명시: 대화 씬은 spatial_axis_180 설정 필수
- POV 결정: 씬마다 dominant_pov (보통 1명)

coverage_pattern 가이드:
- master_inserts: 정보 전달 씬, 전체 → 디테일
- shot_reverse: 대화 씬 (2명 이상)
- developing: 점진 접근 (긴장 상승)
- handheld_continuous: 액션/혼란/친밀감
- montage: 시간 압축/감정 압축
- single_take: 침묵 강조/긴장 유지

lens_vocabulary 가이드:
- [50]: 친밀/표준 (대화, 인물 중심)
- [35]: 환경 포함 (씬 설정)
- [85]: 분리/주관성 (소외, 관찰)
- [35, 85]: 와이드와 클로즈 cross
- [24, 50, 85]: 다양성 (액션, 몽타주)

camera_energy:
- static: 명상/관조 (트라이포드, 단일 컷)
- breathing: 자연스러운 미세 흔들림 (핸드헬드 톤)
- kinetic: 적극적 움직임 (액션/혼란)

cut_pace ↔ rhythm_profile:
- long_takes + sustained → 명상/긴장
- medium + accelerating → 표준 드라마
- rapid + accelerating → 액션 클라이맥스
- punctuated + decaying → 충격 후 여운`;

  const userPrompt = `[genre]
${JSON.stringify(genre)}

[characters]
${JSON.stringify(characters.characters.map((c) => ({ id: c.id, name: c.name, role: c.role })))}

[scenes (요약)]
${scenes.scenes
  .map(
    (sc) =>
      `${sc.scene_id} (${sc.estimated_seconds}s): purpose="${sc.purpose}", emotion=${sc.emotion_beat.start}→${sc.emotion_beat.end}, location=${sc.location}, 인물=[${sc.characters_in_scene.join(', ')}]`
  )
  .join('\n')}

[비주얼 스타일 (v0 VisualIdentity — 전역 고정)]
${JSON.stringify(visualIdentity.style)}

[월드 비주얼 요약 (v2 WorldVisual)]
palette=${JSON.stringify(worldVisual.global_palette)}
locations=${worldVisual.locations.map((l) => l.id).join(', ')}

[Mid Preview 거친 seed (v3 씬 전략)]
${midPreview.v_recommendations.v3 ?? ''}

[액션 예산 분석]
${sceneToShotHint}

[출력 형식 - JSON]
{
  "scene_plans": [
    {
      "scene_id": "scene_X",
      "coverage_pattern": "shot_reverse",
      "shot_count_target": 6,
      "lens_vocabulary": [50],
      "camera_mounting": "handheld",
      "camera_energy": "breathing",
      "lighting_arc": {
        "start_K": 3200, "end_K": 3200,
        "dominant_ratio": "4:1", "quality": "soft"
      },
      "palette_emphasis": ["#color1", "#color2"],
      "dominant_pov": "character_id",
      "spatial_axis_180": { "from_char": "id_a", "to_char": "id_b" },
      "rhythm_profile": "sustained",
      "cut_pace": "medium",
      "avg_shot_seconds": 8,
      "visual_intent": "한 줄로: 왜 이 씬을 이 패턴으로 찍는가"
    }
  ]
}`;

  const llmResult = await generateJson<{ scene_plans: SceneCinematography[] }>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.5,
  });

  await logger.saveLlmCall('sceneCinematography', {
    prompt: userPrompt,
    response: JSON.stringify(llmResult, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  // rule-base 자기 검증 (V3 내용을 V3에서 확인) — enum/수치/상류(V2 팔레트·씬 등장인물) 정합.
  //   CRITICAL 위반 시 위반 목록을 첨부해 1회 교정 재생성하고, CRITICAL 이 더 적은 쪽을 채택한다.
  let scenePlans = extractScenePlans(llmResult);
  let validation = validateSceneCinematography(scenePlans, scenes, worldVisual);
  const criticalCount = (v: typeof validation) =>
    v.issues.filter((i) => i.severity === 'CRITICAL').length;

  if (!validation.valid) {
    const repairPrompt = `${userPrompt}

[규칙 위반 — 아래 항목을 반드시 고쳐 동일 JSON 형식으로 다시 출력]
${buildCorrectionNote(validation.issues)}`;
    const repaired = await generateJson<{ scene_plans: SceneCinematography[] }>(repairPrompt, axisConfig, {
      systemInstruction,
      temperature: 0.4,
    });
    await logger.saveLlmCall('sceneCinematography_repair', {
      prompt: repairPrompt,
      response: JSON.stringify(repaired, null, 2),
      model: describeAxisConfig(axisConfig),
      provider: axisConfig.provider,
    });
    const repairedPlans = extractScenePlans(repaired);
    const repairedValidation = validateSceneCinematography(repairedPlans, scenes, worldVisual);
    // malformed/빈 repair 는 채택 안 함(원본 유지) — "not iterable" 크래시·퇴화 방지.
    if (repairedPlans.length > 0 && criticalCount(repairedValidation) <= criticalCount(validation)) {
      scenePlans = repairedPlans;
      validation = repairedValidation;
    }
  }

  const shotCountTotal = scenePlans.reduce(
    (sum, p) => sum + (p.shot_count_target ?? 0),
    0
  );

  // action_budget 이슈 + 자기 검증 이슈 합본 영속(둘 다 ValidationIssue).
  const allIssues = [...allBudgetIssues, ...validation.issues];

  await logger.saveStage('10_v3_sceneCinematography.json', {
    scene_plans: scenePlans,
    shot_count_total: shotCountTotal,
    budget_issues: allIssues,
    validation_passed: validation.valid,
  });
  await logger.markStage('sceneCinematography', 'completed', {
    scene_count: scenePlans.length,
    shot_count_total: shotCountTotal,
    validation_passed: validation.valid,
    cinematography_issues: validation.issues.length,
  });

  return {
    scene_plans: scenePlans,
    shot_count_total: shotCountTotal,
    budget_issues: allIssues,
  };
}
