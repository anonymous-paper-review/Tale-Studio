// V3: 씬 단위 비주얼 플랜
// 글로벌 V0~V2와 샷 단위 V4 사이의 다리.
// 한 씬을 어떻게 찍을지 — 커버리지/렌즈/카메라/조명 디시플린 설정.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import { analyzeSceneActionBudget } from '@/lib/writer/pipeline/validators/action_budget';
import {
  validateSceneCinematography,
  buildCorrectionNote,
} from '@/lib/writer/pipeline/validators/scene_cinematography';
import { outputLanguageClause } from '@/lib/writer/pipeline/util/output-language';
import type {
  VisualIdentity,
  WorldVisual,
  SceneCinematography,
  ActVisualArc,
  Genre,
  Characters,
  Scenes,
  ValidationIssue,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';
import type { AppLocale } from '@/lib/locale';

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
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  // E8 정식 배선 (2026-08-10 채택 — act-arc-ablation 사전 등록 조건 ③).
  //   막 경계 시각 대비 A평균 3.00 vs B평균 1.08 (차이 > 팔 내 최대 편차)로 아크 전달이 유효.
  //   steps.ts·index.ts 양 경로가 전달한다. 미전달(null)은 구 run resume 등 폴백 — 그때는
  //   프롬프트에서 아크 블록과 act 표기가 빠져 배선 전과 동일하게 동작한다.
  actVisualArc?: ActVisualArc | null,
  // #i18n-s5: 미지정(레거시)이면 systemInstruction 절 미주입 — 종전 동작 그대로.
  outputLocale?: AppLocale,
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
- punctuated + decaying → 충격 후 여운

[매체 인지 예산 — 스타일 ↔ 페이싱 (#style-pacing)]
샷 길이는 "관객이 프레임을 다 읽는 시간"이다. [비주얼 스타일]의 매체·화면 밀도가
avg_shot_seconds 의 **허용 구간을 결정한다** — 아래 구간 밖의 값을 쓰지 마라:
- 고밀도 매체 (실사 live_action, 시네마틱 3D, 스톱모션): 질감·조명·구성 독해가 느리다
  → avg_shot_seconds **6~9s**, long_takes/medium 성향, 동작 전후 관조 여백 허용.
- 중밀도 (2d_anime 등): avg_shot_seconds **5~7s**, 표준 캐던스.
- 저밀도/미니멀 (2d_cartoon 등 플랫 스타일): 화면이 즉시 읽힌다 — 여백은 곧 지루함
  → avg_shot_seconds **3.5~5s**, medium/rapid 캐던스, 동작·대화 중심의 촘촘한 진행.
단, 대사 발화 시간은 매체와 무관한 물리량이다 — 캐던스 명목으로 대사 샷을 발화 시간
밑으로 설계하지 마라 (긴 대사 샷은 구간을 초과해도 된다).${outputLanguageClause(outputLocale)}`;

  const userPrompt = `[genre]
${JSON.stringify(genre)}

[characters]
${JSON.stringify(characters.characters.map((c) => ({ id: c.id, name: c.name, role: c.role })))}

[scenes (요약)]
${scenes.scenes
  .map(
    (sc) =>
      `${sc.scene_id} (${sc.estimated_seconds}s${actVisualArc ? `, act=${sc.act_ref}` : ''}): purpose="${sc.purpose}", emotion=${sc.emotion_beat.start}→${sc.emotion_beat.end}, location=${sc.location}, 인물=[${sc.characters_in_scene.join(', ')}]`
  )
  .join('\n')}

[비주얼 스타일 (v0 VisualIdentity — 전역 고정)]
${JSON.stringify(visualIdentity.style)}

[월드 비주얼 요약 (v2 WorldVisual)]
palette=${JSON.stringify(worldVisual.global_palette)}
locations=${worldVisual.locations.map((l) => l.id).join(', ')}

${actVisualArc ? `
[막별 비주얼 아크 (v1) — 각 씬이 속한 막(act)의 팔레트/조명/에너지 방향을 lighting_arc·palette_emphasis에 반영하라]
${JSON.stringify(actVisualArc)}` : ''}

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
      "avg_shot_seconds": 5,
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
