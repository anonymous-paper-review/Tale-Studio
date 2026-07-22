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

// v0 seed 최적화판 (WRITER_MIDPREVIEW_V2, E6b): E6에서 밑그림 ON이 v0(visualIdentity)의 표준 단어
// 필드(rendering_method 등)를 문장형 자유 서술로 오염시켜 매체/스타일 명칭이 실행마다 흔들린 실패
// 모드를 겨냥. v0_visual.ts가 실제로 쓰는 표준 토큰 어휘를 그대로 반복해 seed 단계부터 같은 어휘로
// 고르게 하고, 분위기·모티프 같은 자유 서술은 mood_note로 격리해 표준 필드를 오염시키지 않는다.
// 기본 경로(env 미설정) 는 위 V1 문자열과 완전히 동일 — 신규 분기만 추가.
const V0_VOCAB_GUIDANCE = `v0(비주얼 아이덴티티): 매체/해상도/fps/비율/렌더 + 스타일/쉐이프/라인/캐릭터코어/텍스처 (format+style 합본)
  - v0.format/v0.style의 각 필드는 뒤에 오는 V0 확정 단계(visualIdentity)가 실제로 쓰는 것과 같은, 짧은 스네이크케이스 표준 토큰 하나만 골라서 쓴다. 문장·형용사 나열·설명형 구문은 절대 넣지 않는다:
    - format.medium: "live_action_stylized" | "3d_cgi" | "2d_animation" 등 — 짧은 토큰 하나
    - format.rendering_method: "stylized_pbr" | "cel_shaded" | "photorealistic" 등 — 짧은 토큰 하나
    - style.art_style: "noir" | "ghibli_like" | "anime" 등 — 짧은 토큰 하나
    - style.shape_language: "angular" | "round" | "mixed" 중 하나만
    - style.line_quality: "clean" | "variable_weight" | "rough" 중 하나만
    - style.character_proportion: "7:1" | "8:1" 형식의 비율 토큰 하나
    - style.texture_philosophy: "photorealistic" | "painterly" | "flat" 등 — 짧은 토큰 하나
  - 목록에 없는 개념이 필요해도 이 형식(짧은 영문 스네이크케이스 1~3단어)을 유지한다 — 절대 문장으로 풀어 쓰지 않는다.
  - 분위기·모티프·질감 느낌 같은 자유 서술은 위 표준 필드에 섞지 말고 v0.mood_note(문장 1~2개)로 분리해서 담는다.`;

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

  const v2 = process.env.WRITER_MIDPREVIEW_V2 === '1';

  const systemInstruction = `당신은 S↔V 변환의 첫 협상자이다.
S0~S3와 검증 결과를 보고 V축 전체 방향을 한 번에 제안한다.

각 v_n 층에 줄 "거친 seed"를 한 번에 제안한다 (각 층이 이걸 직접 참고해 정밀화한다):
${v2 ? V0_VOCAB_GUIDANCE : 'v0(비주얼 아이덴티티): 매체/해상도/fps/비율/렌더 + 스타일/쉐이프/라인/캐릭터코어/텍스처 (format+style 합본)'}
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

  const v0Schema = v2
    ? `    "v0": {
      "format": {"medium": "...", "resolution": {"width": ..., "height": ...}, "fps": ..., "aspect_ratio": "...", "rendering_method": "..."},
      "style": {"art_style": "...", "shape_language": "...", "line_quality": "...", "character_proportion": "...", "texture_philosophy": "..."},
      "mood_note": "string (선택, 1~2문장: 분위기·모티프 등 자유 서술 — format/style 표준 필드에는 절대 넣지 않는다)"
    },`
    : `    "v0": {
      "format": {"medium": "...", "resolution": {"width": ..., "height": ...}, "fps": ..., "aspect_ratio": "...", "rendering_method": "..."},
      "style": {"art_style": "...", "shape_language": "...", "line_quality": "...", "character_proportion": "...", "texture_philosophy": "..."}
    },`;

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
${v0Schema}
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

  await logger.saveStage('07_bridge_midPreview.json', result);
  await logger.markStage('midPreview', 'completed');
  return result;
}
