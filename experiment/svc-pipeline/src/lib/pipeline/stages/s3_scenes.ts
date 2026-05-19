// S3: 씬 브레이크다운, 감정 비트, 정보 비대칭
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/llm/dispatch';
import type { S0Genre, S1Structure, S2Block, S3Block, PipelineInput } from '@/lib/types/pipeline';
import type { PipelineLogger } from '@/lib/logger';

export async function runS3(
  input: PipelineInput,
  s0: S0Genre,
  s1: S1Structure,
  s2: S2Block,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<S3Block> {
  await logger.markStage('S3', 'started');

  const totalSecondsTarget = s0.runtime_seconds;
  const sceneCountHintMap: Record<string, string> = {
    D1: '1개 씬 (한 순간, 단일 액션)',
    D2: '1~2개 씬',
    D3: '3~5개 씬',
    D4: '5~10개 씬',
    D5: '10~20개 씬',
    D6: '20~30개 씬',
    D7: '30개+ 씬',
  };
  const sceneCountHint = sceneCountHintMap[s0.depth_level] ?? '5~10개 씬';

  const systemInstruction = `당신은 영상 제작의 S3(씬 브레이크다운) 디자이너이다.
주어진 S0/S1/S2 위에서 씬 단위 분해를 한다.

씬 목적 분류:
- exposition: 정보 전달 (세계/캐릭터 소개)
- conflict: 갈등 (캐릭터 간 충돌)
- decision: 결정 (캐릭터의 선택)
- revelation: 폭로/발견 (진실 공개)
- transformation: 변환 (캐릭터/상황 변화)
- transition: 전환 (다음 비트로 연결)
- setup: 셋업 (나중을 위한 심기)
- payoff: 페이오프 (이전 셋업의 결실)
- climax: 클라이맥스 (최대 긴장)
- resolution: 해소 (새 균형)

정보 비대칭 (Hitchcock):
- "audience=character": 동시 발견
- "audience>character": 드라마틱 아이러니
- "character>audience": 미스터리

각 씬에 estimated_seconds를 추정 (총합 ≈ ${totalSecondsTarget}초).
${sceneCountHint} 권장.

scene_actions:
- 씬에서 일어나는 주요 액션을 텍스트로 (예: "카이가 일어선다", "편지를 펼친다", "문을 연다")
- 5초 한 샷에 한 액션이 들어가도록 분리해서 작성
- 너무 많은 액션을 한 씬에 몰지 말 것 (한 씬은 보통 1~3 액션)
`;

  const userPrompt = `[스토리]
${input.story}

[S0]
${JSON.stringify(s0, null, 2)}

[S1]
${JSON.stringify(s1, null, 2)}

[S2 캐릭터 ID들]
${s2.characters.map((c) => `${c.id} (${c.name})`).join(', ')}

[출력 형식 - JSON]
{
  "scenes": [
    {
      "scene_id": "scene_1",
      "act_ref": "act_id (S1.acts 중 하나)",
      "location": "string",
      "time_of_day": "string",
      "weather": "string (optional)",
      "characters_in_scene": ["char_id", ...],
      "purpose": "string (씬 목적 분류 중)",
      "emotion_beat": {"start": "string", "end": "string"},
      "dialogue_summary": "string",
      "key_dialogue": [
        {"character_id": "string", "line": "string", "delivery": "string"}
      ],
      "info_asymmetry": "string",
      "estimated_seconds": number,
      "scene_actions": ["action 1", "action 2", ...]
    }
  ],
  "total_estimated_seconds": number
}`;

  const result = await generateJson<S3Block>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.7,
  });

  await logger.saveLlmCall('S3_scenes', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('05_S3.json', result);
  await logger.markStage('S3', 'completed', { scene_count: result.scenes.length });
  return result;
}
