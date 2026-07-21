// S1: 내러티브 구조, POV, 주제, CDQ
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type { Genre, NarrativeStructure, PipelineInput } from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

export async function runNarrativeStructure(input: PipelineInput, genre: Genre, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<NarrativeStructure> {
  await logger.markStage('narrativeStructure', 'started');

  const systemInstruction = `당신은 영상 제작의 S1(내러티브 구조) 디자이너이다.
주어진 스토리와 genre를 바탕으로 구조 유형, POV, 주제, 중심 극적 질문(CDQ)을 결정한다.

구조 유형 (우열이 아니라 서로 다른 형태다 — 스토리의 실제 형태에 맞는 것을 고른다):
- 3-act: 설정→대립→해소의 선형 인과. 목표를 향한 갈등이 세워지고 고조됐다 풀릴 때. (막 3개)
- kishōtenketsu (기승전결): 갈등·악당 없이 도입→전개→전환(예상 밖 국면)→여운. 정적·관조·일상·대비가 핵심일 때(동아시아 전통). (막 4개)
- hero's journey: 평범한 세계→모험의 부름→시련·조력자→최대 시험→변화한 채 귀환. 주인공의 성장·변신 여정이 중심일 때.
- non-linear: 시간순이 아닌 배열(회상·플래시포워드·교차 편집). 과거 사건이 현재의 의미를 결정하거나 시점이 뒤섞일 때.
- circular: 끝이 시작으로 돌아오거나 같은 국면이 반복되는 순환. 시간 루프·반복·데자뷔·수미상관이 핵심 장치일 때.

먼저 스토리의 형태를 판별하라: 선형 인과 / 갈등 없는 대비 / 성장 여정 / 시간 비선형 / 반복·순환. 그 형태에 가장 맞는 구조를 고르고, 억지로 3-act에 끼워 맞추지 마라. acts 수는 고른 구조를 따른다(3-act=3, 기승전결=4 등).

CDQ (Central Dramatic Question):
- yes/no로 답할 수 있는 하나의 질문
- 1막 끝에 제기되고 클라이맥스에서 답해짐
- 5가지 속성 충족: 명확성, 개인적 stakes, 불확실성, 보편성, 긴급성

깊이 레벨 ${genre.depth_level} 권장:
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

[genre]
${JSON.stringify(genre, null, 2)}

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

  const result = await generateJson<NarrativeStructure>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.6,
  });

  await logger.saveLlmCall('narrativeStructure', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('03_s1_narrativeStructure.json', result);
  await logger.markStage('narrativeStructure', 'completed');
  return result;
}
