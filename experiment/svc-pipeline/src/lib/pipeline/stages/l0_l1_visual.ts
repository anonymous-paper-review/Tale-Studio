// L0 + L1: Mid Preview 제안을 정식 V축 데이터로 확정
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/llm/dispatch';
import type { L0Visual, L1Style, MidPreview, S0Genre } from '@/lib/types/pipeline';
import type { PipelineLogger } from '@/lib/logger';

interface L0L1Result {
  L0: L0Visual;
  L1: L1Style;
}

export async function runL0L1(
  s0: S0Genre,
  midPreview: MidPreview,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<L0L1Result> {
  await logger.markStage('L0_L1', 'started');

  const systemInstruction = `당신은 V축 L0(매체/포맷)과 L1(비주얼 스타일)을 확정한다.
Mid Preview 제안을 그대로 채택하되, 누락된 필드를 채우고 검증한다.

L0 필수:
- medium: "live_action_stylized" | "3d_cgi" | "2d_animation" 등
- resolution: width, height
- fps: 24 | 30 | 60
- aspect_ratio: "16:9" | "9:16" | "2.39:1" 등
- rendering_method: "stylized_pbr" | "cel_shaded" | "photorealistic" 등

L1 필수:
- art_style: "noir" | "ghibli_like" | "anime" 등
- shape_language: "angular" | "round" | "mixed"
- line_quality: "clean" | "variable_weight" | "rough"
- character_proportion: "7:1" | "8:1" 등
- texture_philosophy: "photorealistic" | "painterly" | "flat" 등
`;

  const userPrompt = `[S0]
${JSON.stringify(s0, null, 2)}

[Mid Preview 제안]
${JSON.stringify(midPreview.v_recommendations, null, 2)}

[출력 형식 - JSON]
{
  "L0": { ...full L0Visual },
  "L1": { ...full L1Style }
}`;

  const result = await generateJson<L0L1Result>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.4,
  });

  await logger.saveLlmCall('L0_L1', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('08_L0_L1.json', result);
  await logger.markStage('L0_L1', 'completed');
  return result;
}
