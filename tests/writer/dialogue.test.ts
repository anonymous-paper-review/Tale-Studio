// 대사를 만들면 장면마다 빠짐없이 이어지고, 일부 문제가 생겨도 나머지 내용은 계속 만든다 (#dialogue-v4)
// 대사 스테이지(#dialogue-v4) 단위 테스트 — 샷 집합 계약·메모리 누적·부분 진행·장애 흡수.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateJsonMock = vi.fn()
vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: (...args: unknown[]) => generateJsonMock(...args),
  describeAxisConfig: () => 'test/model',
  DEFAULT_MODELS: { S: { provider: 'gemini' }, V: { provider: 'gemini' }, C: { provider: 'claude' } },
}))

import {
  applyMemoryUpdate,
  deriveLedger,
  normalizeSceneDialogue,
  runDialogue,
} from '@/lib/writer/pipeline/stages/dialogue'
import { normalizeWriterTab } from '@/stores/writer-ui-store'
import type { PipelineLogger } from '@/lib/writer/logger'
import type {
  Characters,
  DecoupagePlan,
  DecoupageShot,
  Genre,
  Scenes,
  DialogueMemory,
} from '@/lib/writer/types/pipeline'

const stubLogger = {
  markStage: async () => {},
  saveLlmCall: async () => '',
  saveStage: async () => '',
  flushRawLlm: async () => 0,
} as unknown as PipelineLogger

const S = { provider: 'gemini' } as never

function decShot(id: string, extra?: Partial<DecoupageShot>): DecoupageShot {
  return {
    shot_id: id,
    scene_id: 'scene_1',
    operation: 'derived',
    shot_function: 'action',
    source_beats: [0],
    beat_summary: 'beat',
    beat_summary_native: '비트',
    shot_size: 'MS',
    intended_duration_seconds: 4,
    rhythm_role: 'develop',
    camera_intent: 'static',
    dramatic_purpose: 'p',
    ...extra,
  } as DecoupageShot
}

const genre = { genre: 'drama', tone: [], targetEmotion: [], runtime_seconds: 90 } as unknown as Genre
const characters = {
  characters: [
    { id: 'a', name: 'A', role: 'protagonist', personality: [], motivation: { want: '', need: '' } },
    { id: 'b', name: 'B', role: 'supporting', personality: [], motivation: { want: '', need: '' } },
  ],
  relationships: [],
} as unknown as Characters

function makeScenes(ids: string[]): Scenes {
  return {
    scenes: ids.map((id) => ({
      scene_id: id,
      act_ref: 'act1',
      location: 'loc',
      time_of_day: 'day',
      characters_in_scene: ['a', 'b'],
      purpose: 'conflict',
      emotion_beat: { start: 's', end: 'e' },
      dialogue_summary: '',
      key_dialogue: [],
      info_asymmetry: '',
      estimated_seconds: 20,
      scene_actions: ['act'],
    })),
    total_estimated_seconds: 90,
    new_characters: [],
  } as unknown as Scenes
}

function makeDecoupage(sceneIds: string[], shotsPerScene = 2): DecoupagePlan {
  let n = 0
  return {
    scenes: sceneIds.map((sid) => ({
      scene_id: sid,
      beat_count: 1,
      shot_count: shotsPerScene,
      coverage_ratio: 1,
      rhythm_profile: '',
      uncovered_beats: [],
      shots: Array.from({ length: shotsPerScene }, () => decShot(`shot_${++n}`, { scene_id: sid })),
    })),
    total_shots: sceneIds.length * shotsPerScene,
    total_added: 0,
    total_merged: 0,
    total_split: 0,
    director_notes: '',
  } as unknown as DecoupagePlan
}

const PROFILES_RESPONSE = {
  profiles: [
    { character_id: 'a', name: 'A', speech_style: 's', formality: 'f', sentence_length: 'l', verbal_tics: [], emotional_expression: 'e', taboo: 't', example_lines: [] },
  ],
}

beforeEach(() => {
  generateJsonMock.mockReset()
})

describe('normalizeWriterTab — 대사탭 활성화 회귀 가드', () => {
  it('대사 화면을 선택하면 해당 화면으로 이동한다 (준비 중 시절 탭 클릭 무시 사고)', () => {
    expect(normalizeWriterTab('dialogue')).toBe('dialogue')
    expect(normalizeWriterTab('script')).toBe('script')
    expect(normalizeWriterTab('unknown')).toBe('storyboard')
  })
})

describe('normalizeSceneDialogue — 샷 집합 계약', () => {
  const shots = [decShot('shot_1'), decShot('shot_2')]

  it('빠진 장면은 말없이 채우고 넘친 장면은 버린다 (원래 순서 유지)', () => {
    const out = normalizeSceneDialogue(
      { scene_id: 'scene_1', shots: [
        { shot_id: 'shot_2', dialogue: [{ character_id: 'a', line: '안녕', delivery: 'd' }], narration: null },
        { shot_id: 'shot_999', dialogue: [{ character_id: 'a', line: '유령', delivery: '' }], narration: null },
      ] },
      'scene_1',
      shots,
    )
    expect(out.shots.map((s) => s.shot_id)).toEqual(['shot_1', 'shot_2'])
    expect(out.shots[0].dialogue).toEqual([])
    expect(out.shots[1].dialogue[0].line).toBe('안녕')
  })

  it('빈 대사와 잘못 감싼 목록, 공백 내레이션을 알아보기 쉽게 정리한다', () => {
    const out = normalizeSceneDialogue(
      [{ scene_id: 'scene_1', shots: [
        { shot_id: 'shot_1', dialogue: [{ character_id: 'a', line: '  ' }, { character_id: 'a', line: '말' }], narration: '  ' },
      ] }],
      'scene_1',
      shots.slice(0, 1),
    )
    expect(out.shots[0].dialogue).toHaveLength(1)
    expect(out.shots[0].narration).toBeNull()
  })

  it('장면 목록이 없는 답변은 거부한다', () => {
    expect(() => normalizeSceneDialogue({ scene_id: 'x' }, 'x', shots)).toThrow(/unexpected shape/)
  })

  // #p4-json-guard: 침묵으로 채우고 나면 "모델이 침묵을 골랐다"와 "답이 잘려 사라졌다"가
  //   결과물에서 똑같이 생긴다. 응답에 아예 없던 샷만 여기서 구분할 수 있다.
  it('답변에서 빠진 장면을 따로 드러내 침묵과 누락을 구분한다', () => {
    const out = normalizeSceneDialogue(
      { scene_id: 'scene_1', shots: [{ shot_id: 'shot_1', dialogue: [], narration: null }] },
      'scene_1',
      shots,
    )
    expect(out.missing_shot_ids).toEqual(['shot_2'])
    // shot_1 은 응답에 있었고 모델이 침묵을 골랐다 — 누락이 아니다.
    expect(out.shots[0].dialogue).toEqual([])
  })

  it('모든 장면이 답변에 있으면 누락 표시를 남기지 않는다', () => {
    const out = normalizeSceneDialogue(
      {
        scene_id: 'scene_1',
        shots: [
          { shot_id: 'shot_1', dialogue: [], narration: null },
          { shot_id: 'shot_2', dialogue: [{ character_id: 'a', line: '말' }], narration: null },
        ],
      },
      'scene_1',
      shots,
    )
    expect(out.missing_shot_ids).toBeUndefined()
  })
})

describe('applyMemoryUpdate — 전개 메모리', () => {
  const base: DialogueMemory = {
    established_facts: ['f1'],
    relationship_state: 'r',
    tone_notes: 't',
    notable_lines: [{ character_id: 'a', line: 'l1' }],
  }

  it('새 내용이 없어도 이전 내용을 그대로 이어 간다', () => {
    const next = applyMemoryUpdate(base, { new_facts: ['f2'] })
    expect(next.established_facts).toEqual(['f1', 'f2'])
    expect(next.relationship_state).toBe('r')
    expect(next.notable_lines).toHaveLength(1)
  })

  it('새 내용이 많아도 최근 사실 12개와 대사 10개만 이어 간다', () => {
    const next = applyMemoryUpdate(base, {
      new_facts: Array.from({ length: 20 }, (_, i) => `n${i}`),
      notable_lines: Array.from({ length: 20 }, (_, i) => ({ character_id: 'a', line: `n${i}` })),
    })
    expect(next.established_facts).toHaveLength(12)
    expect(next.notable_lines).toHaveLength(10)
  })
})

// 기본값은 2026-08-11부터 'parallel' — 이 블록은 킬스위치(WRITER_DIALOGUE_PARALLEL=0) 경로의
//   계약을 계속 지킨다. 그래서 mode 를 명시 고정한다(기본값 변화에 흔들리지 않게).
describe('runDialogue — 장면을 차례로 이어 만드는 경우', () => {
  it('인물 말투를 한 번 정하면 다음 장면의 대사에 이어서 반영한다', async () => {
    const scenes = makeScenes(['scene_1', 'scene_2'])
    const dec = makeDecoupage(['scene_1', 'scene_2'])
    generateJsonMock
      .mockResolvedValueOnce(PROFILES_RESPONSE)
      .mockResolvedValueOnce({
        scene_id: 'scene_1',
        shots: [
          { shot_id: 'shot_1', dialogue: [{ character_id: 'a', line: '첫 대사' }], narration: null },
          { shot_id: 'shot_2', dialogue: [], narration: null },
        ],
        memory_update: { new_facts: ['A가 말함'], notable_lines: [{ character_id: 'a', line: '첫 대사' }] },
      })
      .mockResolvedValueOnce({
        scene_id: 'scene_2',
        shots: [
          { shot_id: 'shot_3', dialogue: [], narration: null },
          { shot_id: 'shot_4', dialogue: [], narration: null },
        ],
      })

    const result = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S, {
      mode: 'sequential',
    })
    expect(result.done).toBe(true)
    expect(result.scenes).toHaveLength(2)
    expect(generateJsonMock).toHaveBeenCalledTimes(3) // profiles + 씬 2
    // 씬2 프롬프트에 씬1 메모리(확립 사실·기출 대사)가 들어간다
    const scene2Prompt = generateJsonMock.mock.calls[2][0] as string
    expect(scene2Prompt).toContain('A가 말함')
    expect(scene2Prompt).toContain('첫 대사')
  })

  it('한 장면을 만들지 못해도 그 장면만 말없이 두고 나머지는 계속 만든다', async () => {
    const scenes = makeScenes(['scene_1', 'scene_2'])
    const dec = makeDecoupage(['scene_1', 'scene_2'])
    generateJsonMock
      .mockResolvedValueOnce(PROFILES_RESPONSE)
      .mockRejectedValueOnce(new Error('llm down'))
      .mockRejectedValueOnce(new Error('llm down'))
      .mockResolvedValueOnce({
        scene_id: 'scene_2',
        shots: [
          { shot_id: 'shot_3', dialogue: [{ character_id: 'b', line: '살아있다' }], narration: null },
          { shot_id: 'shot_4', dialogue: [], narration: null },
        ],
      })

    const result = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S, {
      mode: 'sequential',
    })
    expect(result.done).toBe(true)
    const s1 = result.scenes.find((s) => s.scene_id === 'scene_1')!
    expect(s1.shots.every((sh) => sh.dialogue.length === 0)).toBe(true)
    const s2 = result.scenes.find((s) => s.scene_id === 'scene_2')!
    expect(s2.shots[0].dialogue[0].line).toBe('살아있다')
  })

  it('시간이 부족해도 지금까지 만든 장면을 남기고 다음 작업에서 이어 간다 (인물 말투는 유지)', async () => {
    const scenes = makeScenes(['scene_1', 'scene_2'])
    const dec = makeDecoupage(['scene_1', 'scene_2'])
    const sceneResponse = (sid: string, ids: string[]) => ({
      scene_id: sid,
      shots: ids.map((id) => ({ shot_id: id, dialogue: [], narration: null })),
    })
    generateJsonMock
      .mockResolvedValueOnce(PROFILES_RESPONSE)
      .mockResolvedValueOnce(sceneResponse('scene_1', ['shot_1', 'shot_2']))

    const first = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S, {
      mode: 'sequential',
      softDeadlineMs: Date.now() - 1, // 이미 지난 예산 — 1씬 처리 후 양보
    })
    expect(first.done).toBe(false)
    expect(first.doneSceneIds).toEqual(['scene_1'])

    generateJsonMock.mockResolvedValueOnce(sceneResponse('scene_2', ['shot_3', 'shot_4']))
    const second = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S, {
      mode: 'sequential',
      resume: first,
    })
    expect(second.done).toBe(true)
    expect(second.scenes).toHaveLength(2)
    // resume 경로는 프로파일 호출 없이 씬 1회만 — 총 호출 = 1(profiles)+1(scene1)+1(scene2)
    expect(generateJsonMock).toHaveBeenCalledTimes(3)
  })
})

// ── #dialogue-parallel (2026-08-11) ────────────────────────────────────────
// 씬 순차 사슬의 실제 의존이 notable_lines 하나뿐이라는 가설의 코드측 계약.

/** dialogue_summary·emotion_beat·info_asymmetry 가 실제로 채워진 씬 (원장 유도 재료). */
function richScenes(n: number): Scenes {
  const base = makeScenes(Array.from({ length: n }, (_, i) => `scene_${i + 1}`))
  base.scenes.forEach((s, i) => {
    Object.assign(s, {
      dialogue_summary: `${i + 1}번째 씬 요약`,
      emotion_beat: { start: `start${i + 1}`, end: `end${i + 1}` },
      info_asymmetry: i % 2 === 0 ? 'audience=character' : 'audience>character',
    })
  })
  return base
}

describe('deriveLedger — 이전 장면 요약으로 다음 내용을 준비', () => {
  it('첫 장면은 앞선 내용 없이 시작한다', () => {
    const out = deriveLedger(richScenes(3).scenes, 0)
    expect(out.established_facts).toEqual([])
    expect(out.notable_lines).toEqual([])
  })

  it('앞선 장면의 요약과 직전 감정으로 다음 장면의 배경과 관계를 준비한다', () => {
    const out = deriveLedger(richScenes(4).scenes, 2)
    expect(out.established_facts).toEqual(['[scene_1] 1번째 씬 요약', '[scene_2] 2번째 씬 요약'])
    expect(out.relationship_state).toBe('end2')
    expect(out.tone_notes).toContain('end2 → start3')
    expect(out.tone_notes).toContain('audience=character') // scene_3 의 info_asymmetry
  })

  it('앞서 나온 인상적인 대사는 미리 넘기지 않는다 (동시에 장면을 준비하는 대신 치르는 대가)', () => {
    for (const i of [0, 1, 5]) {
      expect(deriveLedger(richScenes(8).scenes, i).notable_lines).toEqual([])
    }
  })

  it('앞선 내용은 최근 12개까지만 다음 장면에 이어진다', () => {
    const out = deriveLedger(richScenes(20).scenes, 19)
    expect(out.established_facts).toHaveLength(12)
    expect(out.established_facts[11]).toBe('[scene_19] 19번째 씬 요약')
  })
})

describe('runDialogue — 여러 장면을 동시에 준비하는 경우', () => {
  /** 씬 프롬프트를 scene_id 로 식별해 응답 — 병렬이라 호출 순서를 가정할 수 없다. */
  function mockByScene(dec: DecoupagePlan) {
    generateJsonMock.mockImplementation(async (prompt: string) => {
      const m = /scene_id=([a-z0-9_]+),/.exec(prompt)
      if (!m) return PROFILES_RESPONSE
      const sid = m[1]
      const shots = dec.scenes.find((s) => s.scene_id === sid)?.shots ?? []
      return {
        scene_id: sid,
        shots: shots.map((s) => ({
          shot_id: s.shot_id,
          dialogue: [{ character_id: 'a', line: `${sid} 대사` }],
          narration: null,
        })),
      }
    })
  }

  it('모든 장면을 준비해도 결과는 원래 순서로 정리된다', async () => {
    const scenes = richScenes(4)
    const dec = makeDecoupage(['scene_1', 'scene_2', 'scene_3', 'scene_4'])
    mockByScene(dec)

    const result = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S, {
      mode: 'parallel',
      concurrency: 4,
    })
    expect(result.done).toBe(true)
    expect(result.scenes.map((s) => s.scene_id)).toEqual([
      'scene_1',
      'scene_2',
      'scene_3',
      'scene_4',
    ])
    expect(generateJsonMock).toHaveBeenCalledTimes(5) // profiles + 씬 4
  })

  it('기본 설정으로도 앞선 장면 요약이 이어진다 (2026-08-11 채택)', async () => {
    const scenes = richScenes(3)
    const dec = makeDecoupage(['scene_1', 'scene_2', 'scene_3'])
    mockByScene(dec)

    const result = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S)
    expect(result.done).toBe(true)
    const prompts = generateJsonMock.mock.calls.map((c) => c[0] as string)
    const scene3 = prompts.find((p) => p.includes('scene_id=scene_3,'))!
    // `[scene_N] ` 접두는 deriveLedger 만 만든다 — 순차 메모리(모델 자기보고)엔 없다.
    expect(scene3).toContain('[scene_1] 1번째 씬 요약')
    // 원장은 기출 대사를 넘기지 못한다 — 병렬화의 유일한 대가가 여기 보인다.
    expect(scene3).toContain('이미 나온 주요 대사(반복 금지, 콜백 재료): (없음)')
  })

  it('앞선 장면 요약을 사용하면 다음 대사를 준비할 때 함께 참고한다', async () => {
    const scenes = richScenes(3)
    const dec = makeDecoupage(['scene_1', 'scene_2', 'scene_3'])
    mockByScene(dec)

    await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S, {
      mode: 'parallel',
      ledger: true,
      concurrency: 3,
    })
    const prompts = generateJsonMock.mock.calls.map((c) => c[0] as string)
    const scene3 = prompts.find((p) => p.includes('scene_id=scene_3,'))!
    expect(scene3).toContain('[scene_1] 1번째 씬 요약')
    expect(scene3).toContain('[scene_2] 2번째 씬 요약')
  })

  it('앞선 장면 요약을 끄면 다음 대사에 앞선 장면이 섞이지 않는다 (비교용)', async () => {
    const scenes = richScenes(3)
    const dec = makeDecoupage(['scene_1', 'scene_2', 'scene_3'])
    mockByScene(dec)

    await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S, {
      mode: 'parallel',
      ledger: false,
      concurrency: 3,
    })
    const prompts = generateJsonMock.mock.calls.map((c) => c[0] as string)
    const scene3 = prompts.find((p) => p.includes('scene_id=scene_3,'))!
    expect(scene3).not.toContain('1번째 씬 요약')
    expect(scene3).toContain('확립된 사실: (없음)')
  })

  it('여러 장면을 함께 준비해도 한 장면이 실패하면 그 장면만 비워 둔다', async () => {
    const scenes = richScenes(3)
    const dec = makeDecoupage(['scene_1', 'scene_2', 'scene_3'])
    generateJsonMock.mockImplementation(async (prompt: string) => {
      const m = /scene_id=([a-z0-9_]+),/.exec(prompt)
      if (!m) return PROFILES_RESPONSE
      const sid = m[1]
      if (sid === 'scene_2') throw new Error('llm down')
      const shots = dec.scenes.find((s) => s.scene_id === sid)?.shots ?? []
      return {
        scene_id: sid,
        shots: shots.map((s) => ({
          shot_id: s.shot_id,
          dialogue: [{ character_id: 'a', line: `${sid} 대사` }],
          narration: null,
        })),
      }
    })

    const result = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S, {
      mode: 'parallel',
      concurrency: 3,
    })
    expect(result.done).toBe(true)
    expect(result.scenes).toHaveLength(3)
    const s2 = result.scenes.find((s) => s.scene_id === 'scene_2')!
    expect(s2.shots.every((sh) => sh.dialogue.length === 0)).toBe(true)
    const s3 = result.scenes.find((s) => s.scene_id === 'scene_3')!
    expect(s3.shots[0].dialogue[0].line).toBe('scene_3 대사')
  })
})
