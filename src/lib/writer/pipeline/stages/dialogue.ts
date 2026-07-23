// 대사 스테이지 (#dialogue-v4 2026-07-23) — 샷 확정 후 샷 단위 대사를 후처리로 저작한다.
//
// lab/exp2 블라인드 A/B(F1 추격물·F2 대화극 × codex 심판)에서 확정된 V4 구성:
//   1) 보이스 프로파일 — 캐스트에서 인물별 어투를 먼저 설계 (어투 표류 방지, V2 실측 실패 교정)
//   2) 씬 순차 글로벌 메모리 — 확립 사실/관계 온도/톤/기출 대사 누적 (전개 일관성 저장소)
//   3) 3규율 — 침묵 예산·정보 공개 순서(메모리가 진실)·명대사 제조 금지 (V3 실측 실패 교정)
//
// 위치: renderPrompts 뒤·persistShots 앞. 입력은 scenes(s3) + decoupage(샷 스토리·duration).
// 대사는 향상 기능이지 크리티컬 패스가 아니다 — 씬 호출이 재시도 후에도 실패하면 그 씬만
// 빈 대사로 흡수하고 파이프라인을 살린다 (오늘의 최악치 = 기존과 동일한 "대사 없음").
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  Genre,
  Characters,
  Scenes,
  StoryScene,
  DecoupagePlan,
  DecoupageShot,
  VoiceProfile,
  ShotDialogue,
  SceneShotDialogue,
  DialogueMemory,
  DialogueTrack,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

const EMPTY_MEMORY: DialogueMemory = {
  established_facts: [],
  relationship_state: '(첫 씬 — 아직 관계가 화면에 드러나지 않음)',
  tone_notes: '',
  notable_lines: [],
};

// ---------------------------------------------------------------------
// 보이스 프로파일 (스테이지 첫 호출 1회)
// ---------------------------------------------------------------------

const VOICE_SYSTEM = `당신은 캐릭터 보이스(어투) 디자이너이다.
스토리와 인물 설정에서 각 인물의 *말하는 방식*을 설계한다 — 외모/서사가 아니라 오직 목소리.
원칙:
1. 인물 간 목소리가 서로 뚜렷이 구분되게 (formality/문장 길이/말버릇 중 최소 2축에서 대비).
2. personality·motivation·역할에서 말투를 도출한다 (근거 없는 개성 부여 금지).
3. example_lines는 그 인물이 이 스토리 속에서 실제로 할 법한 문장으로.
4. 집단 인물(예: 병사들)은 집단의 발화 방식(구호/무전/침묵)으로 정의한다.`;

export async function runVoiceProfiles(
  story: string,
  characters: Characters,
  genre: Genre,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<VoiceProfile[]> {
  const userPrompt = `[스토리]
${story}

[genre]
${JSON.stringify({ genre: genre.genre, tone: genre.tone, targetEmotion: genre.targetEmotion })}

[인물]
${JSON.stringify(characters.characters, null, 2)}

[출력 형식 - JSON]
{
  "profiles": [
    {
      "character_id": "인물 id 그대로",
      "name": "이름",
      "speech_style": "말투 한 줄",
      "formality": "반말/존댓말/혼용 — 상대·상황별 변화 포함",
      "sentence_length": "짧다/길다/상황따라 + 근거",
      "verbal_tics": ["말버릇1", "말버릇2"],
      "emotional_expression": "감정을 말로 드러내는 방식 (직접/우회/침묵/과장)",
      "taboo": "이 인물이 절대 쓰지 않을 말투·어휘",
      "example_lines": ["예시 대사 1", "예시 대사 2"]
    }
  ]
}`;

  const raw = await generateJson<{ profiles?: VoiceProfile[] } | VoiceProfile[]>(userPrompt, axisConfig, {
    systemInstruction: VOICE_SYSTEM,
    temperature: 0.7,
  });
  await logger.saveLlmCall('voice_profiles', {
    prompt: userPrompt,
    response: JSON.stringify(raw, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });
  const profiles = Array.isArray(raw) ? raw : raw.profiles;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error(`voice profiles unexpected shape: ${JSON.stringify(raw).slice(0, 200)}`);
  }
  return profiles;
}

// ---------------------------------------------------------------------
// 씬 단위 대사 저작 (V4 규율 포함 단일 시스템 프롬프트)
// ---------------------------------------------------------------------

const DIALOGUE_SYSTEM = `당신은 영상 대본의 대사 작가이다. 이미 확정된 샷 분해 위에 샷 단위 대사를 쓴다.

== 절대 규칙 ==
1. dialogue.line은 인물이 *입으로 말하는 문장*만. 상황 설명·행동 지문·분위기 서술 금지
   ("소녀가 놀란다" ❌ / "이게... 뭐야?" ⭕). 지문은 delivery에 짧게.
2. 모든 샷에 대사를 강요하지 마라 — 침묵이 옳은 샷은 dialogue를 빈 배열로 둔다.
   대사 없는 영상 구간은 정상이다. 샷의 이야기가 대사를 요구할 때만 쓴다.
3. 분량 = 샷 길이: 한국어 발화 속도 초당 4~6음절 기준, 샷 duration 안에 실제로 말할 수 있는 분량만.
   (4초 샷에 두 문장 ❌)
4. 대사는 씬을 *전진*시킨다: 정보를 주거나, 관계를 바꾸거나, 감정을 밀어올린다.
   있어 보이는 "명대사"를 위한 대사 금지 — 상황이 만든 말만.
5. 화자는 반드시 그 샷/씬에 등장하는 인물(characters_in_scene). 화면 밖 목소리는 delivery에 "(O.S.)" 표기.
6. narration은 보이스오버가 서사적으로 필요할 때만, 아니면 null.
7. 연속성: 같은 씬 안 대사는 하나의 대화 흐름으로 이어진다 (샷 경계는 컷일 뿐, 대화는 이어진다).

== 추가 규율 (V4) ==
A. 침묵 우선: 각 샷에서 "여기서 말이 필요한가"를 먼저 물어라. 행동이 말하는 샷(추격·발견·조작·이동)은
   침묵이 기본값이다. 씬 전체 대사 라인 수 상한 ≈ ceil(씬 estimated_seconds / 10).
   상한을 넘길 때는 그 씬이 대화 씬이라는 명확한 근거가 있어야 한다.
B. 정보 공개 순서: 원 스토리에는 결말까지 다 적혀 있지만, 인물은 *이 씬 시점까지 화면에 공개된 것*만 안다.
   [전개 메모리]의 "확립된 사실"이 지금까지 공개된 것의 전부다 — 거기 없는 미래 정보를 인물이
   먼저 입에 올리게 하지 마라. 복선 대사도 인물의 현재 지식 범위 안에서만 가능하다.
C. 명대사 제조 금지 강화: 주제를 요약·선언하는 문장("진실은 ~하지 않아", "이제 나는 ~다") 금지.
   콜백은 [이미 나온 주요 대사]의 짧은 재사용만 허용 — 새로운 선언문을 만들지 마라.`;

function shotLine(s: DecoupageShot): string {
  return `  - ${s.shot_id} (${s.intended_duration_seconds}s, ${s.shot_size}, ${s.shot_function}): ${s.beat_summary_native ?? s.beat_summary}`;
}

function memorySection(memory: DialogueMemory): string {
  return `
[전개 메모리 — 지금까지의 흐름 (일관성 유지, 모순 금지)]
- 확립된 사실: ${memory.established_facts.length ? memory.established_facts.join(' / ') : '(없음)'}
- 관계 상태: ${memory.relationship_state}
- 톤 노트: ${memory.tone_notes || '(없음)'}
- 이미 나온 주요 대사(반복 금지, 콜백 재료): ${
    memory.notable_lines.length
      ? memory.notable_lines.map((l) => `${l.character_id}: "${l.line}"`).join(' / ')
      : '(없음)'
  }
`;
}

interface SceneDialogueResponse extends SceneShotDialogue {
  memory_update?: {
    new_facts?: string[];
    relationship_state?: string;
    tone_notes?: string;
    notable_lines?: { character_id: string; line: string }[];
  };
}

export interface SceneDialogueResult {
  scene: SceneShotDialogue;
  memory: DialogueMemory;
}

/** 메모리 갱신 — 순수 함수 (테스트 대상). 사실 12개·기출 대사 10개 슬라이딩 유지. */
export function applyMemoryUpdate(
  memory: DialogueMemory,
  update: SceneDialogueResponse['memory_update'],
): DialogueMemory {
  return {
    established_facts: [...memory.established_facts, ...(update?.new_facts ?? [])].slice(-12),
    relationship_state: update?.relationship_state ?? memory.relationship_state,
    tone_notes: update?.tone_notes ?? memory.tone_notes,
    notable_lines: [...memory.notable_lines, ...(update?.notable_lines ?? [])].slice(-10),
  };
}

/** 샷 집합 계약 강제 — 응답을 decoupage 샷 목록 순서로 정규화(누락 샷은 침묵, 여분 샷은 폐기). */
export function normalizeSceneDialogue(
  raw: unknown,
  sceneId: string,
  shots: DecoupageShot[],
): SceneDialogueResponse {
  const obj = (Array.isArray(raw) ? raw[0] : raw) as SceneDialogueResponse | null;
  if (!obj || !Array.isArray(obj.shots)) {
    throw new Error(`dialogue unexpected shape (${sceneId}): ${JSON.stringify(raw).slice(0, 200)}`);
  }
  const byId = new Map(obj.shots.map((s) => [s.shot_id, s]));
  const normalized: ShotDialogue[] = shots.map((s) => {
    const found = byId.get(s.shot_id);
    return found
      ? {
          shot_id: s.shot_id,
          dialogue: Array.isArray(found.dialogue)
            ? found.dialogue.filter((d) => d && typeof d.line === 'string' && d.line.trim().length > 0)
            : [],
          narration:
            typeof found.narration === 'string' && found.narration.trim().length > 0
              ? found.narration
              : null,
        }
      : { shot_id: s.shot_id, dialogue: [], narration: null };
  });
  return { scene_id: sceneId, shots: normalized, memory_update: obj.memory_update };
}

export async function dialogueForScene(
  story: string,
  scene: StoryScene,
  shots: DecoupageShot[],
  characters: Characters,
  profiles: VoiceProfile[],
  memory: DialogueMemory,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<SceneDialogueResult> {
  const userPrompt = `[원 스토리]
${story}

[이 씬]
scene_id=${scene.scene_id}, purpose=${scene.purpose}, location=${scene.location}
감정 곡선: ${scene.emotion_beat?.start ?? ''} → ${scene.emotion_beat?.end ?? ''}
등장 인물: ${(scene.characters_in_scene ?? []).join(', ')}
estimated_seconds=${scene.estimated_seconds}
dialogue_summary(참고): ${scene.dialogue_summary ?? ''}
${scene.key_dialogue?.length ? `key_dialogue(참고 — 그대로 쓸 필요 없음): ${JSON.stringify(scene.key_dialogue)}` : ''}

[이 씬의 샷 분해 — 이 샷들 위에 대사를 얹는다 (샷 추가/변경 금지, 전부 포함)]
${shots.map(shotLine).join('\n')}

[캐릭터 보이스 프로파일 — 반드시 이 어투를 지켜라]
${JSON.stringify(
    profiles.filter((p) => (scene.characters_in_scene ?? []).includes(p.character_id)),
    null,
    2,
  )}
${memorySection(memory)}
[인물 정보]
${JSON.stringify(
    characters.characters
      .filter((c) => (scene.characters_in_scene ?? []).includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, personality: c.personality, motivation: c.motivation })),
  )}

[출력 형식 - JSON]
{
  "scene_id": "${scene.scene_id}",
  "shots": [
    {
      "shot_id": "위 샷 목록의 id 그대로 (순서 유지, 전부 포함)",
      "dialogue": [
        {"character_id": "화자 id", "line": "실제 발화 문장 (씬 텍스트와 같은 언어)", "delivery": "말하는 방식 짧게"}
      ],
      "narration": null
    }
  ],
  "memory_update": {
    "new_facts": ["이 씬으로 관객이 새로 알게 된 사실"],
    "relationship_state": "이 씬 이후 관계 온도 한 줄",
    "tone_notes": "다음 씬 대사 톤을 위한 노트 한 줄",
    "notable_lines": [{"character_id": "...", "line": "이 씬에서 나온 기억할 대사"}]
  }
}`;

  const raw = await generateJson<SceneDialogueResponse>(userPrompt, axisConfig, {
    systemInstruction: DIALOGUE_SYSTEM,
    temperature: 0.7,
  });
  await logger.saveLlmCall(`dialogue_${scene.scene_id}`, {
    prompt: userPrompt,
    response: JSON.stringify(raw, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  const normalized = normalizeSceneDialogue(raw, scene.scene_id, shots);
  return {
    scene: { scene_id: normalized.scene_id, shots: normalized.shots },
    memory: applyMemoryUpdate(memory, normalized.memory_update),
  };
}

// ---------------------------------------------------------------------
// 스테이지 러너 — 씬 순차 + 부분 진행 체크포인트 (shotDesign #long-writer-run 패턴 미러)
// ---------------------------------------------------------------------

export interface DialogueProgress {
  doneSceneIds: string[];
  scenes: SceneShotDialogue[];
  memory: DialogueMemory;
  profiles: VoiceProfile[];
}

export interface RunDialogueResult extends DialogueProgress {
  /** false = 시간 예산으로 일부 씬만 처리 — 다음 step 인보케이션이 resume으로 이어간다. */
  done: boolean;
}

export async function runDialogue(
  story: string,
  genre: Genre,
  characters: Characters,
  scenes: Scenes,
  decoupage: DecoupagePlan,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  opts?: {
    resume?: DialogueProgress | null;
    softDeadlineMs?: number;
  },
): Promise<RunDialogueResult> {
  const resume = opts?.resume ?? null;
  const doneSceneIds = new Set(resume?.doneSceneIds ?? []);
  const out: SceneShotDialogue[] = [...(resume?.scenes ?? [])];
  let memory: DialogueMemory = resume?.memory ?? { ...EMPTY_MEMORY };
  await logger.markStage('dialogue', 'started', {
    scene_count: scenes.scenes.length,
    resumed_scenes: doneSceneIds.size,
  });

  // 프로파일은 스테이지 1회 — resume이 이미 갖고 있으면 재사용.
  let profiles = resume?.profiles ?? null;
  if (!profiles) {
    profiles = await runVoiceProfiles(story, characters, genre, logger, axisConfig);
  }

  let processedThisPass = 0;
  for (const scene of scenes.scenes) {
    if (doneSceneIds.has(scene.scene_id)) continue;
    // 시간 예산 체크는 씬 "사이"에서만 — 패스당 최소 1씬은 처리 (진행 보장 계약).
    if (processedThisPass > 0 && opts?.softDeadlineMs != null && Date.now() > opts.softDeadlineMs) {
      console.log(
        `[dialogue] checkpoint: ${doneSceneIds.size}/${scenes.scenes.length} scenes done — 다음 step에서 이어감`,
      );
      return { done: false, doneSceneIds: [...doneSceneIds], scenes: out, memory, profiles };
    }

    const shots = decoupage.scenes.find((d) => d.scene_id === scene.scene_id)?.shots ?? [];
    if (shots.length === 0) {
      doneSceneIds.add(scene.scene_id);
      continue;
    }

    // 씬 단위 1회 재시도 후 실패 흡수 — 대사는 향상 기능, 파이프라인을 죽이지 않는다.
    let result: SceneDialogueResult | null = null;
    for (let attempt = 1; attempt <= 2 && !result; attempt++) {
      try {
        result = await dialogueForScene(story, scene, shots, characters, profiles, memory, logger, axisConfig);
      } catch (e) {
        console.warn(
          `[dialogue] ${scene.scene_id} 실패 (try ${attempt}/2):`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    if (result) {
      out.push(result.scene);
      memory = result.memory;
    } else {
      // 흡수: 이 씬은 침묵으로 (오늘의 최악치와 동일) — 진행은 계속.
      out.push({ scene_id: scene.scene_id, shots: shots.map((s) => ({ shot_id: s.shot_id, dialogue: [], narration: null })) });
      await logger.markStage('dialogue', 'failed', { scene_id: scene.scene_id, absorbed: true });
    }
    doneSceneIds.add(scene.scene_id);
    processedThisPass += 1;
  }

  await logger.saveStage('14b_dialogue.json', { profiles, scenes: out });
  await logger.markStage('dialogue', 'completed', {
    scene_count: out.length,
    line_count: out.reduce((a, s) => a + s.shots.reduce((b, sh) => b + sh.dialogue.length, 0), 0),
  });
  return { done: true, doneSceneIds: [...doneSceneIds], scenes: out, memory, profiles };
}

/** RunDialogueResult → state.dialogue 저장 형태 */
export function toDialogueTrack(result: Pick<RunDialogueResult, 'profiles' | 'scenes'>): DialogueTrack {
  return { profiles: result.profiles, scenes: result.scenes };
}
