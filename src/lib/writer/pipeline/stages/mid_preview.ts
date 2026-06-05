// Mid Preview: S↔V 양방향 협상 유일 지점. AI가 V 전체를 한 번에 제안.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  MidPreview,
  S0Genre,
  S1Structure,
  S2Block,
  S3Block,
  CValidation1Report,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

export async function runMidPreview(
  s0: S0Genre,
  s1: S1Structure,
  s2: S2Block,
  s3: S3Block,
  validation: CValidation1Report,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<MidPreview> {
  await logger.markStage('mid_preview', 'started');

  const systemInstruction = `당신은 S↔V 변환의 첫 협상자이다.
S0~S3와 검증 결과를 보고 V축 전체 방향을 한 번에 제안한다.

L0: 매체, 해상도, fps, 비율, 렌더 방식
L1: 스타일, 쉐이프, 라인, 캐릭터 코어, 텍스처

컬러 스크립트: 씬별 dominant 색상과 mood 매핑
감정 곡선: 텍스트로 표현 (예: "긴장↗ → 발견↘ → 추격↗↗ → 반전↓ → 해소→")

production_difficulty:
- low: 단순 로케이션, 적은 캐릭터, 정적 카메라 위주
- medium: 평범한 복잡도
- high: 다중 로케이션, 복잡 캐릭터 동작, VFX 다수

warnings: AI 생성 시 주의할 점 (어두운 씬 품질, 빠른 움직임 아티팩트, 캐릭터 일관성 위험 등)
`;

  const userPrompt = `[S0]
${JSON.stringify(s0, null, 2)}

[S1]
${JSON.stringify(s1, null, 2)}

[S2]
${JSON.stringify(s2, null, 2)}

[S3]
${JSON.stringify(s3, null, 2)}

[C 검증 결과]
${JSON.stringify(validation, null, 2)}

[출력 형식 - JSON]
{
  "v_recommendations": {
    "L0": {"medium": "...", "resolution": {"width": ..., "height": ...}, "fps": ..., "aspect_ratio": "...", "rendering_method": "..."},
    "L1": {"art_style": "...", "shape_language": "...", "line_quality": "...", "character_proportion": "...", "texture_philosophy": "..."},
    "L2_summary": "string (2~3 문장: 글로벌 디자인 방향)",
    "L3_scene_strategy": "string (1~2 문장: 씬 단위 영상 문법 힌트 — 어떤 커버리지/리듬 패턴이 이 스토리에 맞는가)",
    "L4_shot_recipe": "string (1~2 문장: 샷 단위 분배 힌트 — 정적/동적 강조 방향)"
  },
  "color_script": [
    {"scene_id": "scene_1", "dominant": "color_name", "mood": "string"}
  ],
  "emotional_arc_visualization": "string (감정 곡선 텍스트)",
  "production_difficulty": "low" | "medium" | "high",
  "warnings": ["string", ...]
}`;

  const result = await generateJson<MidPreview>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.6,
  });

  await logger.saveLlmCall('mid_preview', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('07_mid_preview.json', result);
  await logger.markStage('mid_preview', 'completed');
  return result;
}
