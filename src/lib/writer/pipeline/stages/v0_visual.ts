// V0: 비주얼 아이덴티티 (전역 고정 스타일) — Mid Preview 제안을 정식 V축 데이터로 확정.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type { MidPreview, Genre, VisualIdentity, PipelineInput } from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

// ── native v0 (V축 재설계): VisualIdentity 를 LLM 으로 직접 생성 ──
//   읽음: genre(s0) + bridge seed.v0(이미 {format,style} shape) + styleAnchor(선택).
//   format(기술 스펙) + style(미학)을 nested VisualIdentity 로 직접 산출.
//
//   styleAnchor 연결(2026-07-14, docs/style-anchor-art-style-authority.md §9-2 후속):
//   유저가 producer 에서 앵커(그림체 견본)를 골랐으면 art_style/매체는 **발명 대상이 아니라 입력**이다.
//   앵커 없이 장르에서 매체를 추론하면(예: post-apocalyptic → dark_cinematic_realism) 앵커와
//   정면 충돌해 매체 전이가 깨진다(d6208bba 실측). 앵커가 있으면 매체 필드를 앵커에 고정한다.
export async function runVisualIdentity(
  genre: Genre,
  midPreview: MidPreview,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  styleAnchor?: PipelineInput['styleAnchor'],
): Promise<VisualIdentity> {
  await logger.markStage('visualIdentity', 'started');

  const systemInstruction = `당신은 V축 V0(비주얼 아이덴티티)를 확정한다 — 전역 고정 스타일.
Mid Preview 제안을 채택하되 누락 필드를 채우고 검증한다. format(기술 스펙)과 style(미학)을 분리한다.
스타일 앵커가 주어지면 매체 관련 필드(art_style·medium·rendering_method·texture_philosophy)는 앵커가 최우선이다 — 장르에서 매체를 추론(발명)하지 않는다.

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

  // 앵커 제약 블록: 유저 확정값이므로 seed 보다 강한 "고정" 지시.
  const anchorBlock = styleAnchor
    ? `

[스타일 앵커 — 유저가 직접 고른 전역 그림체 (최우선, 매체 발명 금지)]
${JSON.stringify(styleAnchor)}
- style.art_style 은 이 앵커의 매체를 그대로 반영한다 (예: medium "2d_cartoon" → art_style "2d_cartoon"). realism/photoreal/3d 등 다른 매체어를 절대 넣지 않는다.
- format.medium 과 rendering_method 도 앵커 매체와 정합하게 정한다 (예: 2d_cartoon → medium "2d_animation", rendering_method "cel_shaded").
- style.texture_philosophy 는 앵커 매체와 정합하게 정한다 (예: 2d_cartoon → "flat").
- 나머지(shape_language / line_quality / character_proportion)는 앵커 매체 안에서 장르·톤에 맞게 채운다.`
    : '';

  const userPrompt = `[genre]
${JSON.stringify(genre, null, 2)}

[Mid Preview 거친 seed (v0 — {format,style})]
${JSON.stringify(midPreview.v_recommendations.v0, null, 2)}${anchorBlock}

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
