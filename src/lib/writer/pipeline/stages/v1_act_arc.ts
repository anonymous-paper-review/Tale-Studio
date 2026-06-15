// v1 (막별 비주얼 아크): narrativeStructure(s1)의 막 진행에 맞춰 비주얼이 어떻게 진화하는가.
//   같은-계층 참조(V축 재설계 2026-06-13): [s1 narrativeStructure] + [직전 v0 renderFormat/artDirection].
//   genre(s0)는 v0를 통해 간접 반영 — v1은 s0를 직접 읽지 않는다.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  ActVisualArc,
  NarrativeStructure,
  VisualIdentity,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

export async function runActVisualArc(
  narrativeStructure: NarrativeStructure,
  visualIdentity: VisualIdentity, // v0 번들 (format+style) — 직전 단계
  bridgeHint: string, // bridge(midPreview) v_recommendations.v1 — 거친 seed (skip 시 '')
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<ActVisualArc> {
  await logger.markStage('actVisualArc', 'started');

  const systemInstruction = `당신은 Visual 축 v1(막별 비주얼 아크) 설계자이다.
s1(서사 구조)의 각 막을 거치며 "비주얼이 어떻게 진화하는가"를 설계한다.
v0(비주얼 아이덴티티: 매체·스타일)는 이미 확정 — 그 전역 스타일 *안에서* 막마다의 변화만 정한다.

핵심 원칙:
- 전역 스타일(art_style/shape_language/line_quality/texture)은 막마다 바뀌지 않는다.
  변하는 건 팔레트 방향 · 조명 무드 · 에너지 · 톤.
- 각 막은 s1.acts[].act_id 와 1:1. 배열 순서 = 시간 진행.
- turning_point / theme / central_dramatic_question 을 시각 변화의 동기로 삼는다
  (예: 전환점 막에서 팔레트·조명 급변).
- 과하지 않게: ≤10분 영상 전제. 막 수만큼만, 막당 1~2문장.

energy: "low" | "rising" | "high" | "falling" — 그 막의 시각적 긴장/운동 에너지.`;

  const userPrompt = `[s1 narrativeStructure]
${JSON.stringify(narrativeStructure, null, 2)}

[v0 비주얼 아이덴티티 — 이 스타일 안에서만 변화]
${JSON.stringify(visualIdentity, null, 2)}

[bridge 거친 힌트(v1) — 있으면 참고, 없으면 무시]
${bridgeHint || '(없음)'}

[출력 형식 - JSON]
{
  "acts": [
    {
      "act_id": "<s1.acts 의 act_id 그대로>",
      "palette_shift": "이 막의 색 방향(전역 팔레트 내에서)",
      "lighting_mood": "조명/톤",
      "energy": "rising",
      "visual_note": "한 줄: 왜 이 막을 이렇게 보이게 하는가"
    }
  ],
  "global_arc_intent": "전체 비주얼 진행을 한 줄로"
}`;

  const result = await generateJson<ActVisualArc>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.5,
  });

  await logger.saveLlmCall('actVisualArc', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('08b_actVisualArc.json', result);
  await logger.markStage('actVisualArc', 'completed', { act_count: result.acts?.length ?? 0 });
  return result;
}
