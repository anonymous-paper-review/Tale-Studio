// Mid Preview: S↔V 양방향 협상 유일 지점. AI가 V 전체를 한 번에 제안.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  MidPreview,
  Genre,
  NarrativeStructure,
  Characters,
  Scenes,
  StoryCheckReport,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

export async function runMidPreview(
  genre: Genre,
  narrativeStructure: NarrativeStructure,
  characters: Characters,
  scenes: Scenes,
  validation: StoryCheckReport,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<MidPreview> {
  await logger.markStage('midPreview', 'started');

  const systemInstruction = `당신은 S↔V 변환의 첫 협상자이다.
S0~S3와 검증 결과를 보고 V축 전체 방향을 한 번에 제안한다.

각 v_n 층에 줄 "거친 seed"를 한 번에 제안한다 (각 층이 이걸 직접 참고해 정밀화한다):
v0(비주얼 아이덴티티): 매체/해상도/fps/비율/렌더 + 스타일/쉐이프/라인/캐릭터코어/텍스처 (format+style 합본)
v1(막별 비주얼 아크): 막 진행에 따른 팔레트/조명/에너지 변화의 거친 힌트
v2(글로벌 디자인): 팔레트/로케이션/의상 방향
v3(씬 전략): 커버리지/리듬 패턴 힌트
v4(샷 레시피): 정적/동적 강조 힌트

컬러 스크립트: 씬별 dominant 색상과 mood 매핑
감정 곡선: 텍스트로 표현 (예: "긴장↗ → 발견↘ → 추격↗↗ → 반전↓ → 해소→")

production_difficulty:
- low: 단순 로케이션, 적은 캐릭터, 정적 카메라 위주
- medium: 평범한 복잡도
- high: 다중 로케이션, 복잡 캐릭터 동작, VFX 다수

warnings: AI 생성 시 주의할 점 (어두운 씬 품질, 빠른 움직임 아티팩트, 캐릭터 일관성 위험 등)
`;

  const userPrompt = `[genre]
${JSON.stringify(genre, null, 2)}

[narrativeStructure]
${JSON.stringify(narrativeStructure, null, 2)}

[characters]
${JSON.stringify(characters, null, 2)}

[scenes]
${JSON.stringify(scenes, null, 2)}

[C 검증 결과]
${JSON.stringify(validation, null, 2)}

[출력 형식 - JSON]
{
  "v_recommendations": {
    "v0": {
      "format": {"medium": "...", "resolution": {"width": ..., "height": ...}, "fps": ..., "aspect_ratio": "...", "rendering_method": "..."},
      "style": {"art_style": "...", "shape_language": "...", "line_quality": "...", "character_proportion": "...", "texture_philosophy": "..."}
    },
    "v1": "string (1~2 문장: 막별 비주얼 아크 거친 힌트 — 막 진행에 따른 팔레트/조명/에너지 변화)",
    "v2": "string (2~3 문장: 글로벌 디자인 방향)",
    "v3": "string (1~2 문장: 씬 전략 — 커버리지/리듬 패턴)",
    "v4": "string (1~2 문장: 샷 레시피 — 정적/동적 강조)"
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

  await logger.saveStage('07_midPreview.json', result);
  await logger.markStage('midPreview', 'completed');
  return result;
}
