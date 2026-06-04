// L3: 씬 단위 비주얼 플랜
// 글로벌 L0~L2와 샷 단위 L4 사이의 다리.
// 한 씬을 어떻게 찍을지 — 커버리지/렌즈/카메라/조명 디시플린 설정.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/llm/dispatch';
import { analyzeSceneActionBudget } from '@/lib/pipeline/validators/action_budget';
import type {
  L1Style,
  L2Design,
  L3SceneVisualPlan,
  MidPreview,
  S0Genre,
  S2Block,
  S3Block,
  ValidationIssue,
} from '@/lib/types/pipeline';
import type { PipelineLogger } from '@/lib/logger';

interface L3Result {
  scene_plans: L3SceneVisualPlan[];
  shot_count_total: number;
  budget_issues: ValidationIssue[];
}

export async function runL3SceneVisualPlan(
  s0: S0Genre,
  s2: S2Block,
  s3: S3Block,
  l1: L1Style,
  l2: L2Design,
  midPreview: MidPreview,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<L3Result> {
  await logger.markStage('L3_scene_plan', 'started');

  // 씬별 액션 예산 분석 (shot_count_target 산정 근거)
  const sceneAnalyses = s3.scenes.map((scene) => ({
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

  const systemInstruction = `당신은 V축 L3(씬 비주얼 플랜) 설계자이다.
S3 씬마다 "이 씬을 어떻게 찍을 것인가"의 영상 문법을 결정한다.
글로벌 L0~L2는 이미 정해졌고, 샷 단위 L4는 다음 단계. L3는 그 사이를 메우는 씬 디시플린.

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

  const userPrompt = `[S0]
${JSON.stringify(s0)}

[S2 캐릭터]
${JSON.stringify(s2.characters.map((c) => ({ id: c.id, name: c.name, role: c.role })))}

[S3 씬 (요약)]
${s3.scenes
  .map(
    (sc) =>
      `${sc.scene_id} (${sc.estimated_seconds}s): purpose="${sc.purpose}", emotion=${sc.emotion_beat.start}→${sc.emotion_beat.end}, location=${sc.location}, 인물=[${sc.characters_in_scene.join(', ')}]`
  )
  .join('\n')}

[L1 스타일]
${JSON.stringify(l1)}

[L2 디자인 요약]
palette=${JSON.stringify(l2.global_palette)}
locations=${l2.locations.map((l) => l.id).join(', ')}

[Mid Preview 비주얼 전략 힌트]
${midPreview.v_recommendations.L3_scene_strategy ?? ''}

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
      "silence_intentional": false,
      "sound_motif_hints": ["..."],
      "visual_intent": "한 줄로: 왜 이 씬을 이 패턴으로 찍는가"
    }
  ]
}`;

  const llmResult = await generateJson<{ scene_plans: L3SceneVisualPlan[] }>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.5,
  });

  await logger.saveLlmCall('L3_scene_plan', {
    prompt: userPrompt,
    response: JSON.stringify(llmResult, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  const shotCountTotal = llmResult.scene_plans.reduce(
    (sum, p) => sum + (p.shot_count_target ?? 0),
    0
  );

  await logger.saveStage('10_L3_scene_plans.json', {
    scene_plans: llmResult.scene_plans,
    shot_count_total: shotCountTotal,
    budget_issues: allBudgetIssues,
  });
  await logger.markStage('L3_scene_plan', 'completed', {
    scene_count: llmResult.scene_plans.length,
    shot_count_total: shotCountTotal,
  });

  return {
    scene_plans: llmResult.scene_plans,
    shot_count_total: shotCountTotal,
    budget_issues: allBudgetIssues,
  };
}
