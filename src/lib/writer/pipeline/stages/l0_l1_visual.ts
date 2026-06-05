// renderFormat + artDirection: Mid Preview 제안을 정식 Visual 축 데이터로 확정
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type { RenderFormat, ArtDirection, MidPreview, Genre } from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

interface RenderFormatArtDirectionResult {
  renderFormat: RenderFormat;
  artDirection: ArtDirection;
}

export async function runRenderFormatArtDirection(
  genre: Genre,
  midPreview: MidPreview,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<RenderFormatArtDirectionResult> {
  await logger.markStage('renderFormat_artDirection', 'started');

  const systemInstruction = `당신은 Visual 축 renderFormat(매체/포맷)과 artDirection(비주얼 스타일)을 확정한다.
Mid Preview 제안을 그대로 채택하되, 누락된 필드를 채우고 검증한다.

renderFormat 필수:
- medium: "live_action_stylized" | "3d_cgi" | "2d_animation" 등
- resolution: width, height
- fps: 24 | 30 | 60
- aspect_ratio: "16:9" | "9:16" | "2.39:1" 등
- rendering_method: "stylized_pbr" | "cel_shaded" | "photorealistic" 등

artDirection 필수:
- art_style: "noir" | "ghibli_like" | "anime" 등
- shape_language: "angular" | "round" | "mixed"
- line_quality: "clean" | "variable_weight" | "rough"
- character_proportion: "7:1" | "8:1" 등
- texture_philosophy: "photorealistic" | "painterly" | "flat" 등
`;

  const userPrompt = `[genre]
${JSON.stringify(genre, null, 2)}

[Mid Preview 제안]
${JSON.stringify(midPreview.v_recommendations, null, 2)}

[출력 형식 - JSON]
{
  "renderFormat": { ...full RenderFormat },
  "artDirection": { ...full ArtDirection }
}`;

  const result = await generateJson<RenderFormatArtDirectionResult>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.4,
  });

  await logger.saveLlmCall('renderFormat_artDirection', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('08_renderFormat_artDirection.json', result);
  await logger.markStage('renderFormat_artDirection', 'completed');
  return result;
}
