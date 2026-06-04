// S2: 캐릭터, 관계, 서브텍스트
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/svc/llm/dispatch';
import type { S0Genre, S1Structure, S2Block, PipelineInput } from '@/lib/svc/types/pipeline';
import type { PipelineLogger } from '@/lib/svc/logger';

export async function runS2(
  input: PipelineInput,
  s0: S0Genre,
  s1: S1Structure,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig
): Promise<S2Block> {
  await logger.markStage('S2', 'started');

  const systemInstruction = `당신은 영상 제작의 S2(캐릭터/관계) 디자이너이다.
주어진 스토리, S0, S1을 바탕으로 캐릭터들의 정의, 관계, 서브텍스트를 결정한다.

캐릭터 아크 유형:
- positive_change: 결함 → 성장 → 강함
- negative_change / fall: 미덕 → 부패 → 추락
- flat / steadfast: 변하지 않지만 세계를 바꿈
- redemption: 타락한 자가 속죄
- corruption: 선한 자가 악으로
- disillusionment: 순진 → 가혹한 진실
- circular: 시작점으로 돌아오지만 변화

캐릭터 동기 (Want vs Need):
- want: 외적 목표 (의식적)
- need: 내적 필요 (무의식적)
- wound: 과거 상처 (선택)

깊이 레벨 ${s0.depth_level} 가이드:
- D1: 1명 (or 0명, 사물/풍경 중심도 OK). arc/want/need/wound 생략 가능
- D2: 1~2명. arc 단순 (전→후 1줄). want만 명시
- D3: 1~2명 (주인공 중심)
- D4: 2~4명 (주조연 진입)
- D5: 3~6명 (조연 확장)
- D6: 5~8명 (앙상블 진입)
- D7: 6명+ (앙상블 / 군상극)
`;

  const userPrompt = `[스토리]
${input.story}

[S0]
${JSON.stringify(s0, null, 2)}

[S1]
${JSON.stringify(s1, null, 2)}

[출력 형식 - JSON]
{
  "characters": [
    {
      "id": "string (snake_case)",
      "name": "string",
      "age": "string (optional)",
      "role": "protagonist" | "antagonist" | "supporting",
      "personality": ["string", ...],
      "arc": {
        "start_state": "string",
        "end_state": "string",
        "arc_type": "string"
      },
      "voice": "string (대사 톤)",
      "appearance_description": "string",
      "motivation": {
        "want": "string",
        "need": "string",
        "wound": "string (optional)"
      }
    }
  ],
  "relationships": [
    {
      "between": ["char_id_1", "char_id_2"],
      "type": "string",
      "state_change": "string (optional)",
      "visible_in_video": boolean
    }
  ],
  "subtext_notes": ["string", ...]
}`;

  const result = await generateJson<S2Block>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.7,
  });

  await logger.saveLlmCall('S2_characters', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('04_S2.json', result);
  await logger.markStage('S2', 'completed', { character_count: result.characters.length });
  return result;
}
