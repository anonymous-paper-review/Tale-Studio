// S3: 씬 브레이크다운, 감정 비트, 정보 비대칭
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type { Genre, NarrativeStructure, Characters, Scenes, PipelineInput, StoryCharacter, BackgroundContract } from '@/lib/writer/types/pipeline';
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
    // 서사 속성은 s3 반환값 우선(#opencast-arc 2026-07-21) — 미반환 필드만 빈 기본값.
    fresh.push({
      id: n.id,
      name: n.name,
      role: n.role ?? 'supporting',
      personality: Array.isArray(n.personality) ? n.personality.filter((p) => typeof p === 'string') : [],
      arc: {
        start_state: n.arc?.start_state ?? '',
        end_state: n.arc?.end_state ?? '',
        arc_type: n.arc?.arc_type ?? '',
      },
      appearance_description: n.appearance_description ?? '',
      motivation: { want: n.motivation?.want ?? '', need: n.motivation?.need ?? '' },
    });
  }
  if (!fresh.length) return prev;
  return { ...prev, characters: [...prev.characters, ...fresh] };
}

// 월드 오픈캐스트 (characters 대칭, V축 재설계): s3 씬이 참조하는 로케이션(`scene.location` 문자열) 중
//   producer world(s2.world seed)에 없는 것만 append 한다 — 씬 전개상 필요한 배경.
//   ⚠️ producer 전달값(원천)은 수정·삭제하지 않는다: append-only 시멘틱으로 보장(보호 플래그 불필요, 아키텍처 §5#2).
//   seed 가 없으면(coworker background 전) 빈 world 에 씬 로케이션을 채운다(별도 fallback 불필요).
//   writer-added 의 origin 표기는 persist 단계에서(characters.origin='writer' 와 동일 — 후속 증분).
export function mergeOpenWorld(prev: BackgroundContract | undefined, scenes: Scenes): BackgroundContract {
  const base: BackgroundContract = prev ?? { locations: [] };
  const known = new Set<string>();
  for (const l of base.locations) {
    known.add(l.id.toLowerCase().trim());
    known.add(l.name.toLowerCase().trim());
  }
  const fresh: BackgroundContract['locations'] = [];
  const seen = new Set<string>();
  for (const sc of scenes.scenes) {
    const loc = (sc.location ?? '').trim();
    if (!loc) continue;
    const key = loc.toLowerCase();
    if (known.has(key) || seen.has(key)) continue; // producer/이미추가분에 있음 → skip(불변)
    seen.add(key);
    fresh.push({ id: loc, name: loc, description: '' }); // writer-added, 최소 필드
  }
  if (!fresh.length) return base;
  return { ...base, locations: [...base.locations, ...fresh] };
}

// act 커버리지 검증: narrativeStructure.acts 중 어떤 씬의 act_ref 로도 안 덮인 act_id 목록.
//   비어있으면 모든 막에 ≥1 씬 (정합). #3 — s1 act 설계 ↔ s3 씬 분배 불일치 방지.
function uncoveredActs(scenes: Scenes, ns: NarrativeStructure): string[] {
  const covered = new Set(scenes.scenes.map((s) => s.act_ref));
  return ns.acts.map((a) => a.act_id).filter((id) => !covered.has(id));
}

// 로케이션 참조 정규화 (§3 — 모델은 제안, 검증은 제품): LLM이 오픈 로케이션 규칙을 어기고 기존
//   로케이션의 name(표시명)이나 대소문자 변형으로 답하면 id 로 되돌린다. scenes.location 은
//   locations.location_id 와 조인되는 참조값 — 어긋나면 같은 장소가 이중 생성된다(2026-06-30 한/영 중복 버그).
function normalizeSceneLocations(scenes: Scenes, world: BackgroundContract | undefined): Scenes {
  if (!world?.locations.length) return scenes;
  const idByKey = new Map<string, string>();
  for (const l of world.locations) {
    idByKey.set(l.id.toLowerCase().trim(), l.id);
    if (l.name) idByKey.set(l.name.toLowerCase().trim(), l.id);
  }
  let changed = false;
  const fixed = scenes.scenes.map((sc) => {
    const id = idByKey.get((sc.location ?? '').toLowerCase().trim());
    if (id && id !== sc.location) {
      changed = true;
      return { ...sc, location: id };
    }
    return sc;
  });
  return changed ? { ...scenes, scenes: fixed } : scenes;
}

export async function runScenes(
  input: PipelineInput,
  genre: Genre,
  narrativeStructure: NarrativeStructure,
  characters: Characters,
  world: BackgroundContract | undefined,
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

act 커버리지 (필수):
- S1.acts의 모든 act_id가 최소 1개 씬의 act_ref로 등장해야 한다 (빠지는 막 금지).
- 따라서 씬 수는 최소 S1.acts 개수 이상. 권장 씬 수와 충돌하면 act 커버리지를 우선한다.
- 가능하면 각 act.proportion 비율로 씬을 분배한다 (proportion 큰 막에 더 많은 씬).
- act_ref는 S1.acts의 act_id를 그대로 쓴다.

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

오픈 로케이션 규칙 (중요 — 캐스트와 동일 원칙):
- 씬이 [기존 로케이션] 중 한 곳에서 벌어지면 scene.location에 **반드시 그 id를 글자 그대로** 쓴다
  (번역·의역·새 이름 금지. 같은 장소를 다른 이름으로 다시 만들면 배경 이미지가 이중 생성된다).
- 기존 로케이션만으로 전개 가능하면 새 장소를 만들지 말 것.
- 전개상 꼭 필요한 새 장소만 새 이름으로 쓰되, **스토리와 같은 언어**로 짧고 구체적인 장소명을 짓는다
  (스토리가 한국어면 한국어 지명 — 임의로 영어 이름을 만들지 않는다).
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

[기존 로케이션] (producer 확정 — scene.location에 id 그대로 사용)
${
  world?.locations.length
    ? world.locations
        .map((l) => `- ${l.id}${l.name && l.name !== l.id ? ` (${l.name})` : ''}${l.description ? `: ${l.description}` : ''}`)
        .join('\n')
    : '(없음 — 씬 전개에 필요한 장소명을 스토리와 같은 언어로 새로 만든다)'
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
      "appearance_description": "string (간단한 외형 한 줄)",
      "personality": ["string", ...],
      "arc": {"start_state": "string", "end_state": "string", "arc_type": "string"},
      "motivation": {"want": "string (표면적 욕구)", "need": "string (내면의 필요)"}
    }
  ]
}

new_characters는 전개상 새 인물이 정말 필요할 때만 채운다. 기존 캐스트로 충분하면 빈 배열([])로 둔다.
new_characters에도 기존 캐스트와 같은 깊이의 서사 속성(personality/arc/motivation)을 채운다 —
이 인물이 전개상 왜 필요한지(어떤 변화를 겪고 무엇을 원하는지)를 스토리에 근거해 구체적으로.
집단 인물(예: 추적자들)이면 집단의 목적/상태 변화로 쓴다.`;

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

  // act 커버리지 자기검증 (#3): S1.acts 의 모든 막이 어떤 씬의 act_ref 로 덮였는가.
  //   누락 막이 있으면 위반 목록을 첨부해 1회 교정 재생성하고, 커버리지가 더 나은 쪽을 채택 (v3 validator 패턴).
  let scenes = normalizeSceneLocations(result, world);
  let uncovered = uncoveredActs(scenes, narrativeStructure);
  if (uncovered.length) {
    const repairPrompt = `${userPrompt}

[규칙 위반 — S1.acts 중 다음 막에 씬이 없음: ${uncovered.join(', ')}.
 각 막에 최소 1개 씬(act_ref = 해당 act_id)을 포함하도록 동일 JSON 형식으로 다시 출력하라. 씬 수가 늘어도 된다.]`;
    const repaired = await generateJson<Scenes>(repairPrompt, axisConfig, {
      systemInstruction,
      temperature: 0.6,
    });
    await logger.saveLlmCall('scenes_repair', {
      prompt: repairPrompt,
      response: JSON.stringify(repaired, null, 2),
      model: describeAxisConfig(axisConfig),
      provider: axisConfig.provider,
    });
    if (uncoveredActs(repaired, narrativeStructure).length < uncovered.length) {
      scenes = normalizeSceneLocations(repaired, world);
      uncovered = uncoveredActs(scenes, narrativeStructure);
    }
  }

  await logger.saveStage('05_s3_scenes.json', scenes);
  await logger.markStage('scenes', 'completed', {
    scene_count: scenes.scenes.length,
    uncovered_acts: uncovered, // 비어있어야 정상 (남으면 막 수 > 가능 씬 수 등 구조적 한계)
  });
  return scenes;
}
