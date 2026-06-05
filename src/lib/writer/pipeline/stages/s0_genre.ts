// S0: 장르/톤/감정/러닝타임 + 깊이 레벨 결정
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/svc/llm/dispatch';
import type { S0Genre, PipelineInput, DepthLevel } from '@/lib/svc/types/pipeline';
import type { PipelineLogger } from '@/lib/svc/logger';

export async function runS0(input: PipelineInput, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<S0Genre> {
  await logger.markStage('S0', 'started');

  const systemInstruction = `당신은 영상 제작의 S0(장르/톤) 디자이너이다.
주어진 스토리에서 장르, 톤, 타겟 감정, 적정 러닝타임을 추출한다.

깊이 레벨 (자동 결정):
- D1 (5~15초,    1~2 샷):     Spark - 한 순간 / 광고 클릭베이트 / 릴 한 컷
- D2 (15~60초,   3~10 샷):    Beat - SNS 숏폼 / 광고 짧은 형태
- D3 (1~5분,     6~30 샷):    Arc - 짧은 단편 / 광고 / 미드폼
- D4 (5~10분,    30~60 샷):   Short - 광고 장편 / 단편 도입
- D5 (10~20분,   60~120 샷):  Featurette - 표준 단편 영화
- D6 (20~30분,   120~180 샷): Episode - 긴 단편 / TV 에피소드
- D7 (30분+,     180+ 샷):    Epic - 장편

규칙:
- 사용자가 runtimeSeconds를 명시했으면 그것에 맞춰 depth_level 결정
  · 5~15s     → D1
  · 15~60s    → D2
  · 60~300s   → D3
  · 300~600s  → D4
  · 600~1200s → D5
  · 1200~1800s→ D6
  · 1800s+    → D7
- 명시하지 않았으면 스토리 복잡도에 따라 D1~D7 중 권장
- 반드시 JSON으로 응답
`;

  const userPrompt = `[스토리]
${input.story}

[사용자 명시 러닝타임]
${input.runtimeSeconds ? input.runtimeSeconds + '초' : '자동 결정'}

[출력 형식 - JSON]
{
  "genre": "string",
  "subGenre": "string (optional)",
  "tone": ["string", ...],
  "targetEmotion": ["string", ...],
  "runtime_seconds": number,
  "depth_level": "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7",
  "format": "horizontal_16:9" | "vertical_9:16" | "cinema_2.39:1"
}`;

  const result = await generateJson<S0Genre>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.5,
  });

  await logger.saveLlmCall('S0_genre', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  // 안전 가드: 지원 범위 밖이면 D3로 끌어올림
  if (!['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].includes(result.depth_level)) {
    result.depth_level = 'D3' as DepthLevel;
  }

  await logger.saveStage('02_S0.json', result);
  await logger.markStage('S0', 'completed', { depth_level: result.depth_level });
  return result;
}
