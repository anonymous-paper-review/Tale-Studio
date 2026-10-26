// 시리즈 다음 화는 앞 화 제목 · 줄거리 · 이어받은 인물 · 배경을 산문 지시에 싣고, 앞 화 말투가 있는 인물은 말투를 새로 정하지 않는다 (2026-10-26)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  loadSeries: vi.fn(),
  run: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
}))
vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: mocks.generate,
  describeAxisConfig: () => 'test-model',
  DEFAULT_MODELS: { S: { provider: 'gemini' }, V: { provider: 'gemini' }, C: { provider: 'claude' } },
}))
vi.mock('@/lib/series/server', () => ({ loadSeriesWriterInput: mocks.loadSeries }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/pipeline', () => ({ resolveModels: () => ({ S: { provider: 'gemini' } }) }))
vi.mock('@/lib/writer/logger', () => ({
  PipelineLogger: class {
    init = async () => {}
    flushRawLlm = async () => 0
    markStage = async () => {}
    saveLlmCall = async () => ''
    saveStage = async () => ''
  },
}))

import { seriesBlock } from '@/lib/writer/pipeline/series-block'
import { runDramaturgy } from '@/lib/writer/pipeline/stages/s0_dramaturgy'
import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure'
import { runScenes } from '@/lib/writer/pipeline/stages/s3_scenes'
import { runStructureScenesMerged } from '@/lib/writer/pipeline/stages/s1s3_merged'
import { runDialogue, runVoiceProfiles } from '@/lib/writer/pipeline/stages/dialogue'
import { generateSceneStoryRewrite } from '@/lib/writer/scene-story-rewrite'
import { newRewriteProposal } from '@/lib/producer/scene-story-rewrite'
import type { PipelineLogger } from '@/lib/writer/logger'
import type { Characters, DecoupagePlan, Genre, NarrativeStructure, PipelineInput, Scenes, VoiceProfile } from '@/lib/writer/types/pipeline'

const PREV_PROSE = '지아와 민호가 운동장에서 다투고 돌아섰다.'
const series = { prevTitle: '1화 · 운동장의 밤', prevProse: PREV_PROSE, characters: ['지아', '민호'], locations: ['운동장'] }
const input = { story: '지아가 민호에게 편지를 쓴다.', outputLocale: 'ko', series } as PipelineInput
const genre = { depth_level: 'D1', runtime_seconds: 6 } as Genre
const structure = { acts: [{ act_id: 'act_1' }] } as NarrativeStructure
const cast = { characters: [{ id: 'jia', name: '지아' }] } as Characters
const logger = {
  markStage: vi.fn(),
  saveLlmCall: vi.fn(),
  saveStage: vi.fn(),
  flushRawLlm: vi.fn(),
} as unknown as PipelineLogger
const S = { provider: 'gemini' } as never

const scene = {
  scene_id: 'scene_1',
  act_ref: 'act_1',
  location: '운동장',
  time_of_day: '밤',
  narrative_time: 'present',
  characters_in_scene: ['jia'],
  purpose: 'conflict',
  emotion_beat: { start: 's', end: 'e' },
  dialogue_summary: '지아가 편지를 쓴다.',
  key_dialogue: [],
  info_asymmetry: '',
  estimated_seconds: 6,
  scene_actions: ['지아가 운동장 벤치에서 편지를 쓴다.'],
}
const SCENES = { scenes: [scene], total_estimated_seconds: 6 } as unknown as Scenes
const DRAMATURGY = {
  core_engine: '편지',
  mechanism_notes: [],
  world_inventory: [],
  dramatic_diagnosis: { stakes: '', weak_beats: [], cdq_candidates: [], ending_check: '' },
}
const STRUCTURE = { structure_type: '3-act', acts: [{ act_id: 'act_1', purpose: '', proportion: 1 }], pov: '', theme: '', central_dramatic_question: '', turning_point_position: 0.5 }
const MERGED = { narrative_structure: STRUCTURE, scenes: [scene], total_estimated_seconds: 6, new_characters: [] }
const PROFILE_MINHO = { character_id: 'minho', name: '민호', speech_style: '새로 정한 말투', formality: '반말', sentence_length: '짧다', verbal_tics: [], emotional_expression: '직접', taboo: '', example_lines: [] }
const inheritedVoices: VoiceProfile[] = [
  { character_id: 'jia', name: '지아', speech_style: '앞 화에서 정한 말투', formality: '존댓말', sentence_length: '길다', verbal_tics: ['그치'], emotional_expression: '우회', taboo: '', example_lines: ['그치, 그럴 줄 알았어.'] } as VoiceProfile,
]
const twoPeople = { characters: [{ id: 'jia', name: '지아' }, { id: 'minho', name: '민호' }] } as Characters

const decoupage = {
  scenes: [
    {
      scene_id: 'scene_1',
      beat_count: 1,
      shot_count: 1,
      coverage_ratio: 1,
      rhythm_profile: '',
      uncovered_beats: [],
      shots: [{ shot_id: 'shot_1', scene_id: 'scene_1', operation: 'derived', shot_function: 'action', source_beats: [0], beat_summary: 'beat', beat_summary_native: '비트', shot_size: 'MS', intended_duration_seconds: 4, rhythm_role: 'develop', camera_intent: 'static', dramatic_purpose: 'p' }],
    },
  ],
  total_shots: 1,
} as unknown as DecoupagePlan

/** 단계마다 출력 형식으로 프롬프트를 알아보고 알맞은 답을 돌려준다(병렬 · 호출 순서 가정 없음). */
const answer = async (prompt: string) => {
  if (prompt.includes('scene_id=')) return { scene_id: 'scene_1', shots: [{ shot_id: 'shot_1', dialogue: [], narration: null }] }
  if (prompt.includes('"core_engine"')) return DRAMATURGY
  if (prompt.includes('"narrative_structure"')) return MERGED
  if (prompt.includes('"profiles"')) return { profiles: [PROFILE_MINHO] }
  if (prompt.includes('"turning_point_position"')) return STRUCTURE
  if (prompt.includes('"scenes"')) return SCENES
  throw new Error(`unexpected prompt: ${prompt.slice(0, 120)}`)
}
const prompts = () => mocks.generate.mock.calls.map((call) => String(call[0]))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generate.mockImplementation(answer)
})

describe('시리즈 다음 화 산문 지시', () => {
  // 왜: 정상 경로 고정 — 다음 화를 쓰는 모든 산문 단계가 앞 화를 읽고 이어 쓴다.
  it('시리즈 다음 화면 이야기 엔진 · 구조 · 씬 지시에 앞 화 제목과 줄거리를 싣는다', async () => {
    await runDramaturgy(input, genre, cast, logger, S)
    await runNarrativeStructure(input, genre, logger, S)
    await runScenes(input, genre, structure, cast, undefined, logger, S)
    await runStructureScenesMerged(input, genre, cast, undefined, logger, S)

    expect(prompts()).toHaveLength(4)
    for (const prompt of prompts()) {
      expect(prompt).toContain('1화 · 운동장의 밤')
      expect(prompt).toContain(PREV_PROSE)
    }
  })

  // 왜: 이름만 같고 다른 사람으로 쓰면 이어받은 인물 그림 · 배경이 이번 화와 어긋난다.
  it('이어받은 인물 · 배경은 앞 화와 같은 사람 · 같은 장소라고 지시한다', () => {
    const block = seriesBlock(input)
    expect(block).toContain('지아 · 민호')
    expect(block).toContain('운동장')
    expect(block).toContain('같은 사람')
    expect(block).toContain('같은 장소')
  })

  // 왜: 앞 화를 지운 뒤 다음 화를 다시 쓸 때 — 줄거리는 못 읽어도 인물 · 배경은 이어진다.
  it('앞 화가 지워졌으면 앞 화 줄거리는 없지만 이어받은 인물은 같은 사람이라고 지시한다', () => {
    const block = seriesBlock({ ...input, series: { ...series, prevProse: null } })
    expect(block).toContain('앞 화 줄거리는 없지만')
    expect(block).toContain('같은 사람')
    expect(block).not.toContain(PREV_PROSE)
  })

  // 왜: 혼자 정한 것 — 이어받은 인물을 전부 등장시키려고 이야기가 끌려가지 않게 한다.
  it('이어받은 인물이 모두 나올 필요는 없다고 지시한다', () => {
    expect(seriesBlock(input)).toContain('모두 나올 필요는 없다')
  })

  // 왜: 혼자 정한 것 — 정상 경로 고정. 시리즈가 아닌 보통 프로젝트의 지시는 지금과 똑같아야 한다.
  it('시리즈가 아니면 지시에 아무것도 더하지 않는다', async () => {
    expect(seriesBlock({})).toBe('')
    await runNarrativeStructure({ story: '지아가 편지를 쓴다.' } as PipelineInput, genre, logger, S)
    expect(prompts()[0]).not.toContain('앞 화')
  })

  // 왜: 혼자 정한 것 — 대본을 그대로 쓰는 화는 대본이 진실이라 앞 화 줄거리가 끼어들면 안 된다.
  it('대본을 그대로 쓰는 화에는 앞 화 줄거리를 싣지 않는다', () => {
    expect(seriesBlock({ ...input, preserveScript: true })).toBe('')
    expect(seriesBlock({ ...input, changeLevel: 'keep' })).toBe('')
  })
})

describe('시리즈 다음 화 말투', () => {
  // 왜: 정상 경로 고정 — 이어받은 인물의 말투가 화마다 달라지면 같은 사람으로 들리지 않는다.
  it('앞 화 말투가 있는 인물은 말투를 새로 정하지 않고 앞 화 말투를 쓴다', async () => {
    const profiles = await runVoiceProfiles('지아가 편지를 쓴다.', twoPeople, genre, logger, S, undefined, undefined, inheritedVoices)

    expect(profiles.find((p) => p.character_id === 'jia')).toEqual(inheritedVoices[0])
    expect(profiles.find((p) => p.character_id === 'minho')?.speech_style).toBe('새로 정한 말투')
  })

  // 왜: 정상 경로 고정 — 새 인물만 말투를 받아 앞 화 말투와 겹치지 않게 한다.
  it('앞 화에 없던 새 인물만 말투를 새로 정한다', async () => {
    await runVoiceProfiles('지아가 편지를 쓴다.', twoPeople, genre, logger, S, undefined, undefined, inheritedVoices)

    const prompt = prompts()[0]
    expect(prompt).toContain('minho')
    expect(prompt).toContain('앞 화에서 정한 말투')
    expect(prompt.split('[앞 화에서 이어받은 말투 — 고정]')[0]).not.toContain('jia')

    // 모두 이어받았으면 말투를 받을 일이 없다.
    mocks.generate.mockClear()
    const kept = await runVoiceProfiles('지아가 편지를 쓴다.', cast, genre, logger, S, undefined, undefined, inheritedVoices)
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(kept).toEqual(inheritedVoices)
  })

  // 왜: 혼자 정한 것 — 대사는 샷 단위라 앞 화 줄거리까지 넣으면 이번 화에 없는 사건이 대사로 샌다.
  it('대사 단계에는 앞 화 말투만 싣고 줄거리는 싣지 않는다', async () => {
    await runDialogue('지아가 편지를 쓴다.', genre, twoPeople, SCENES, decoupage, logger, S, { inheritedVoices })

    expect(prompts().some((prompt) => prompt.includes('앞 화에서 정한 말투'))).toBe(true)
    for (const prompt of prompts()) expect(prompt).not.toContain(PREV_PROSE)
  })
})

describe('[AI 다시 쓰기]의 시리즈 칸', () => {
  const stored = () => ({
    id: 'run-1',
    status: 'awaiting_confirmation',
    updated_at: '2026-10-26T00:00:00.000Z',
    state: {
      input: { story: '지아가 민호에게 편지를 쓴다.', outputLocale: 'ko', cast: { characters: [] }, series: { ...series, prevTitle: '낡은 제목' } },
      genre,
      narrativeStructure: structure,
      characters: cast,
      scenes: SCENES,
      _sceneStoryProposal: proposal,
    },
  })
  const proposal = newRewriteProposal({ id: 'p1', level: 'reword', feedback: 'reword', baseScenes: SCENES as never, createdAt: new Date().toISOString() })

  // 왜: 정상 경로 고정 — 다시 쓰는 동안 앞 화가 바뀌거나 지워질 수 있어 매번 앞 화에서 다시 읽는다.
  it('[AI 다시 쓰기]는 매번 앞 화를 다시 읽어 시리즈 칸을 싣는다', async () => {
    mocks.run.mockImplementation(async () => structuredClone(stored()))
    const query = { update: mocks.update, eq: mocks.eq, select: mocks.select }
    mocks.from.mockReturnValue(query)
    mocks.update.mockReturnValue(query)
    mocks.eq.mockReturnValue(query)
    mocks.select.mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
    mocks.loadSeries.mockResolvedValue({
      context: { prevProjectId: 'prev-1', prevDeleted: false },
      series: { ...series, prevTitle: '다시 읽은 제목' },
      inheritedVoices,
    })

    await generateSceneStoryRewrite('project-1', 'run-1', 'p1', proposal.variants![0].id)

    expect(mocks.loadSeries).toHaveBeenCalledWith('project-1')
    expect(prompts()).toHaveLength(1)
    expect(prompts()[0]).toContain('다시 읽은 제목')
    expect(prompts()[0]).not.toContain('낡은 제목')
  })
})
