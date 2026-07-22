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
  normalizeSceneDialogue,
  runDialogue,
} from '@/lib/writer/pipeline/stages/dialogue'
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

describe('normalizeSceneDialogue — 샷 집합 계약', () => {
  const shots = [decShot('shot_1'), decShot('shot_2')]

  it('누락 샷은 침묵으로 채우고 여분 샷은 버린다 (순서 = decoupage)', () => {
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

  it('빈 line·배열 래핑·공백 내레이션을 정규화한다', () => {
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

  it('shots 없는 응답은 throw', () => {
    expect(() => normalizeSceneDialogue({ scene_id: 'x' }, 'x', shots)).toThrow(/unexpected shape/)
  })
})

describe('applyMemoryUpdate — 전개 메모리', () => {
  const base: DialogueMemory = {
    established_facts: ['f1'],
    relationship_state: 'r',
    tone_notes: 't',
    notable_lines: [{ character_id: 'a', line: 'l1' }],
  }

  it('누적 + 미제공 필드는 유지', () => {
    const next = applyMemoryUpdate(base, { new_facts: ['f2'] })
    expect(next.established_facts).toEqual(['f1', 'f2'])
    expect(next.relationship_state).toBe('r')
    expect(next.notable_lines).toHaveLength(1)
  })

  it('슬라이딩 윈도우 — 사실 12·대사 10 유지', () => {
    const next = applyMemoryUpdate(base, {
      new_facts: Array.from({ length: 20 }, (_, i) => `n${i}`),
      notable_lines: Array.from({ length: 20 }, (_, i) => ({ character_id: 'a', line: `n${i}` })),
    })
    expect(next.established_facts).toHaveLength(12)
    expect(next.notable_lines).toHaveLength(10)
  })
})

describe('runDialogue — 씬 순차 러너', () => {
  it('프로파일 1회 + 씬별 호출, 메모리가 다음 씬 프롬프트에 반영된다', async () => {
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

    const result = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S)
    expect(result.done).toBe(true)
    expect(result.scenes).toHaveLength(2)
    expect(generateJsonMock).toHaveBeenCalledTimes(3) // profiles + 씬 2
    // 씬2 프롬프트에 씬1 메모리(확립 사실·기출 대사)가 들어간다
    const scene2Prompt = generateJsonMock.mock.calls[2][0] as string
    expect(scene2Prompt).toContain('A가 말함')
    expect(scene2Prompt).toContain('첫 대사')
  })

  it('씬 호출 2회 실패 → 그 씬만 침묵 흡수, 파이프라인은 계속', async () => {
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

    const result = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S)
    expect(result.done).toBe(true)
    const s1 = result.scenes.find((s) => s.scene_id === 'scene_1')!
    expect(s1.shots.every((sh) => sh.dialogue.length === 0)).toBe(true)
    const s2 = result.scenes.find((s) => s.scene_id === 'scene_2')!
    expect(s2.shots[0].dialogue[0].line).toBe('살아있다')
  })

  it('softDeadline 경과 시 체크포인트 반환(done=false) → resume이 이어간다 (프로파일 재사용)', async () => {
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
      softDeadlineMs: Date.now() - 1, // 이미 지난 예산 — 1씬 처리 후 양보
    })
    expect(first.done).toBe(false)
    expect(first.doneSceneIds).toEqual(['scene_1'])

    generateJsonMock.mockResolvedValueOnce(sceneResponse('scene_2', ['shot_3', 'shot_4']))
    const second = await runDialogue('스토리', genre, characters, scenes, dec, stubLogger, S, {
      resume: first,
    })
    expect(second.done).toBe(true)
    expect(second.scenes).toHaveLength(2)
    // resume 경로는 프로파일 호출 없이 씬 1회만 — 총 호출 = 1(profiles)+1(scene1)+1(scene2)
    expect(generateJsonMock).toHaveBeenCalledTimes(3)
  })
})
