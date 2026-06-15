// S3: 씬 브레이크다운, 감정 비트, 정보 비대칭
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type { Genre, NarrativeStructure, Characters, Scenes, PipelineInput, StoryCharacter } from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

// 오픈 캐스트 머지 (producer-story-gate §4): s3 가 반환한 new_characters 중 기존 slug 와 겹치지 않는
//   것만 StoryCharacter 기본값으로 채워 state.characters 에 추가한다. 충돌 slug 는 기존 행 사용(무시).
//   persistAssetsToDb 가 "DB 에 없는 새 slug" 를 origin='writer' 로 insert 하므로 별도 origin 표기 불필요.
//   steps.ts(서버리스)·index.ts(로컬) 양 경로가 공용으로 호출한다.
export function mergeOpenCast(prev: Characters, scenes: Scenes): Characters {
  if (!scenes.new_characters?.length) return prev;
  const existing = new Set(prev.characters.map((c) => c.id));
  const fresh: StoryCharacter[] = [];
  for (const n of scenes.new_characters) {
    if (!n.id || existing.has(n.id)) continue; // 빈 id / 기존 slug 충돌 → 기존 행 사용
    existing.add(n.id);
    fresh.push({
      id: n.id,
      name: n.name,
      role: n.role ?? 'supporting',
      personality: [],
      arc: { start_state: '', end_state: '', arc_type: '' },
      appearance_description: n.appearance_description ?? '',
      motivation: { want: '', need: '' },
    });
  }
  if (!fresh.length) return prev;
  return { ...prev, characters: [...prev.characters, ...fresh] };
}

export async function runScenes(
  input: PipelineInput,
  genre: Genre,
  narrativeStructure: NarrativeStructure,
  characters: Characters,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<Scenes> {
  await logger.markStage('scenes', 'started');

  const totalSecondsTarget = genre.runtime_seconds;
  const sceneCountHintMap: Record<string, string> = {
    D1: '1개 씬 (한 순간, 단일 액션)',
    D2: '1~2개 씬',
    D3: '3~5개 씬',
    D4: '5~10개 씬',
    D5: '10~20개 씬',
    D6: '20~30개 씬',
    D7: '30개+ 씬',
  };
  const sceneCountHint = sceneCountHintMap[genre.depth_level] ?? '5~10개 씬';

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

오픈 캐스트 규칙 (중요):
- 위 [기존 캐스트]는 producer가 이미 확정한 인물/사물이다. 등장시킬 때 **반드시 주어진 slug 그대로**
  characters_in_scene에 쓴다 (새 slug를 만들거나 이름을 바꾸지 않는다).
- 기존 캐스트만으로 스토리를 전개할 수 있으면 새 인물을 만들지 말 것 — new_characters는 빈 배열.
- **스토리 전개상 꼭 필요한 새 인물만** new_characters에 추가하고, 그 새 slug를 등장 씬의
  characters_in_scene에도 쓴다. 새 slug는 기존 캐스트 slug와 절대 중복되지 않게 snake_case로 만든다.
- 카드(기존 캐스트)에 자리가 없는 인물을 억지로 등장시키지 말 것. 등장은 스토리가 결정한다.
`;

  const userPrompt = `[스토리]
${input.story}

[genre]
${JSON.stringify(genre, null, 2)}

[narrativeStructure]
${JSON.stringify(narrativeStructure, null, 2)}

[기존 캐스트] (producer 확정 — slug 그대로 사용)
${
  characters.characters.length
    ? characters.characters
        .map((c) => `- ${c.id} (${c.name}, ${c.role})${c.appearance_description ? `: ${c.appearance_description}` : ''}`)
        .join('\n')
    : '(없음 — 사물/풍경 중심이거나 전개상 인물이 필요하면 new_characters로 추가)'
}

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
  "total_estimated_seconds": number,
  "new_characters": [
    {
      "id": "string (새 slug, snake_case — 기존 캐스트와 중복 금지)",
      "name": "string",
      "role": "protagonist" | "antagonist" | "supporting",
      "appearance_description": "string (간단한 외형 한 줄)"
    }
  ]
}

new_characters는 전개상 새 인물이 정말 필요할 때만 채운다. 기존 캐스트로 충분하면 빈 배열([])로 둔다.`;

  const result = await generateJson<Scenes>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.7,
  });

  await logger.saveLlmCall('scenes', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('05_scenes.json', result);
  await logger.markStage('scenes', 'completed', { scene_count: result.scenes.length });
  return result;
}
