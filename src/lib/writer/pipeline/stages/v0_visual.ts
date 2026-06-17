// V0: 비주얼 아이덴티티 (전역 고정 스타일) — Mid Preview 제안을 정식 V축 데이터로 확정.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type { MidPreview, Genre, VisualIdentity } from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

// ── native v0 (V축 재설계): VisualIdentity 를 LLM 으로 직접 생성 ──
//   읽음: genre(s0) + bridge seed.v0(이미 {format,style} shape). format(기술 스펙) + style(미학)을
//   nested VisualIdentity 로 직접 산출 — 옛 renderFormat/artDirection flat 중간산물 없음.
export async function runVisualIdentity(
  genre: Genre,
  midPreview: MidPreview,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<VisualIdentity> {
  await logger.markStage('visualIdentity', 'started');

  const systemInstruction = `당신은 V축 V0(비주얼 아이덴티티)를 확정한다 — 전역 고정 스타일.
Mid Preview 제안을 채택하되 누락 필드를 채우고 검증한다. format(기술 스펙)과 style(미학)을 분리한다.

format 필수:
- medium: "live_action_stylized" | "3d_cgi" | "2d_animation" 등
- resolution: { width, height }
- fps: 24 | 30 | 60
- aspect_ratio: "16:9" | "9:16" | "2.39:1" 등
- rendering_method: "stylized_pbr" | "cel_shaded" | "photorealistic" 등

style 필수:
- art_style: "noir" | "ghibli_like" | "anime" 등
- shape_language: "angular" | "round" | "mixed"
- line_quality: "clean" | "variable_weight" | "rough"
- character_proportion: "7:1" | "8:1" 등
- texture_philosophy: "photorealistic" | "painterly" | "flat" 등`;

  const userPrompt = `[genre]
${JSON.stringify(genre, null, 2)}

[Mid Preview 거친 seed (v0 — {format,style})]
${JSON.stringify(midPreview.v_recommendations.v0, null, 2)}

[출력 형식 - JSON]
{
  "format": { "medium": "...", "resolution": { "width": 1920, "height": 1080 }, "fps": 24, "aspect_ratio": "...", "rendering_method": "..." },
  "style": { "art_style": "...", "shape_language": "...", "line_quality": "...", "character_proportion": "...", "texture_philosophy": "..." }
}`;

  const result = await generateJson<VisualIdentity>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.4,
  });

  await logger.saveLlmCall('visualIdentity', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('08_v0_visualIdentity.json', result);
  await logger.markStage('visualIdentity', 'completed');
  return result;
}
