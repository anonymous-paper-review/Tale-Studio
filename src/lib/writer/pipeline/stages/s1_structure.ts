// S1: 내러티브 구조, POV, 주제, CDQ
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type { S0Genre, S1Structure, PipelineInput } from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

export async function runS1(input: PipelineInput, s0: S0Genre, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<S1Structure> {
  await logger.markStage('S1', 'started');

  const systemInstruction = `당신은 영상 제작의 S1(내러티브 구조) 디자이너이다.
주어진 스토리와 S0를 바탕으로 구조 유형, POV, 주제, 중심 극적 질문(CDQ)을 결정한다.

구조 유형 가이드:
- 3-act: 가장 일반적, 명확한 갈등-해소
- kishōtenketsu (기승전결): 갈등 없이 대비/전환 중심, 동아시아
- hero's journey: 영웅 여정, 12단계
- non-linear: 시간 비선형, 회상/플래시포워드
- circular: 순환 구조

CDQ (Central Dramatic Question):
- yes/no로 답할 수 있는 하나의 질문
- 1막 끝에 제기되고 클라이맥스에서 답해짐
- 5가지 속성 충족: 명확성, 개인적 stakes, 불확실성, 보편성, 긴급성

깊이 레벨 ${s0.depth_level} 권장:
- D1: 구조 없음 — 한 순간/한 비트. CDQ 생략 가능, theme 한 단어
- D2: 미니 구조 — setup → action → result 1줄씩. CDQ 약식
- D3: 단순 구조 (3-act 또는 기승전결, 서브플롯 0)
- D4: 표준 구조 + 가벼운 서브플롯 1개
- D5: 표준 구조 + 서브플롯 1~2개
- D6: 다층 구조 + 서브플롯 2~3개
- D7: 다층 구조 + 서브플롯 다수 + 에피소드 연속성 가능
`;

  const userPrompt = `[스토리]
${input.story}

[S0]
${JSON.stringify(s0, null, 2)}

[출력 형식 - JSON]
{
  "structure_type": "string",
  "acts": [
    {"act_id": "string", "purpose": "string", "proportion": number}
  ],
  "pov": "string",
  "theme": "string",
  "central_dramatic_question": "string (yes/no question)",
  "turning_point_position": number (0~1)
}

acts의 proportion 합은 1.0이어야 함.`;

  const result = await generateJson<S1Structure>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.6,
  });

  await logger.saveLlmCall('S1_structure', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('03_S1.json', result);
  await logger.markStage('S1', 'completed');
  return result;
}
