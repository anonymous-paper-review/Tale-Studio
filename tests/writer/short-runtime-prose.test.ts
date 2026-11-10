// 길이를 15초 이하로 골랐으면 산문을 1~2씬으로 쓴다 — 이야기 구조를 막 1~2개로 쓰고, 씬이 2개를 넘으면 한 번 고쳐 쓰게 한다(오너 2026-11-10 ③)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@/lib/writer/llm/local', () => ({ localGenerateJson: mocks.generate }))

import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure'
import { runScenes } from '@/lib/writer/pipeline/stages/s3_scenes'
import { runStructureScenesMerged } from '@/lib/writer/pipeline/stages/s1s3_merged'
import type { Characters, Genre, NarrativeStructure, PipelineInput, Scenes } from '@/lib/writer/types/pipeline'
import type { PipelineLogger } from '@/lib/writer/logger'

const S = { provider: 'local', baseUrl: 'http://fixture.invalid' } as const
const logger = { saveStage: vi.fn(), saveLlmCall: vi.fn(), markStage: vi.fn() } as unknown as PipelineLogger
const STORY = '민호가 회사 복도 자판기에 동전을 넣는다. 캔이 한꺼번에 쏟아지고 민호가 웃는다.'
const input = (over: Partial<PipelineInput> = {}) => ({ story: STORY, outputLocale: 'ko', ...over }) as PipelineInput
const genre = (runtime: number) => ({ genre: 'Comedy', tone: [], targetEmotion: [], runtime_seconds: runtime, depth_level: runtime <= 15 ? 'D1' : 'D2', format: 'horizontal_16:9' }) as Genre

// 이 시험을 위해 지은 구조 — 모델이 15초에도 기승전결 4막을 내는 경우(11/10 점검 C01 · C07).
const FOUR_ACTS: NarrativeStructure = {
  structure_type: 'kishōtenketsu',
  acts: [
    { act_id: 'ki', purpose: '도입', proportion: 0.25 },
    { act_id: 'sho', purpose: '전개', proportion: 0.25 },
    { act_id: 'ten', purpose: '전환', proportion: 0.25 },
    { act_id: 'ketsu', purpose: '여운', proportion: 0.25 },
  ],
  pov: '3rd_limited',
  theme: '횡재',
  central_dramatic_question: '민호는 캔을 다 가질까?',
  turning_point_position: 0.5,
}
const actsOf = (ids: string[]): NarrativeStructure => ({ ...FOUR_ACTS, structure_type: '3-act', acts: ids.map((id) => ({ act_id: id, purpose: id, proportion: 1 / ids.length })) })
const cast = { characters: [{ id: 'minho', name: '민호' }] } as Characters
const scene = (id: string, act: string, seconds: number, actions: string[]) => ({
  scene_id: id, act_ref: act, location: '회사 복도', time_of_day: 'night', narrative_time: 'present', characters_in_scene: ['minho'],
  purpose: 'setup', emotion_beat: { start: '심심함', end: '기쁨' }, dialogue_summary: '민호가 자판기 앞에서 웃는다.', key_dialogue: [],
  info_asymmetry: 'audience=character', estimated_seconds: seconds, scene_actions: actions,
})
const scenesOf = (list: ReturnType<typeof scene>[]): Scenes => ({ scenes: list, total_estimated_seconds: list.reduce((a, s) => a + s.estimated_seconds, 0) }) as Scenes
const prompt = (n: number) => String(mocks.generate.mock.calls[n][0])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generate.mockReset()
})

describe('15초 이하 산문 — 이야기 구조', () => {
  // 왜: 오너 ③ — 15초에 기승전결 4막을 쓰면 막마다 장면이 생겨 4장면이 되고, 저장 때 장면마다 시간이 붙어 25초 넘게 나왔다(C01 · C07).
  it('길이를 15초 이하로 골랐으면 이야기 구조를 막 1~2개로 쓰게 한다', async () => {
    mocks.generate.mockResolvedValue(actsOf(['act_1']))
    await runNarrativeStructure(input({ runtimeSeconds: 15 }), genre(15), logger, S)
    expect(prompt(0)).toContain('[고른 길이 — 15초 이하]')
    expect(prompt(0)).toContain('acts 는 1~2개')
  })

  // 왜: 모델이 지시를 어기고 4막을 내도 장면이 4개가 되지 않게 — 흐름(도입 → 전환)은 막 안의 목적 문장으로 남긴다.
  it('길이를 15초 이하로 골랐는데 구조가 막 3개 이상으로 나오면 앞뒤 두 막으로 합친다', async () => {
    mocks.generate.mockResolvedValue(FOUR_ACTS)
    const result = await runNarrativeStructure(input({ runtimeSeconds: 15 }), genre(15), logger, S)
    expect(result.acts).toEqual([
      { act_id: 'ki', purpose: '도입 → 전개', proportion: 0.5 },
      { act_id: 'ten', purpose: '전환 → 여운', proportion: 0.5 },
    ])
  })

  // 왜: 정상 경로 고정 — 60초 이상과 대본 그대로(길이를 고르지 않음)는 지금 구조 규칙 그대로다.
  it('길이를 15초보다 길게 골랐거나 대본 그대로면 이야기 구조 지시와 막 수는 지금과 같다', async () => {
    mocks.generate.mockResolvedValue(FOUR_ACTS)
    const longer = await runNarrativeStructure(input({ runtimeSeconds: 60 }), genre(60), logger, S)
    const keep = await runNarrativeStructure(input({ preserveScript: true }), genre(12), logger, S)
    expect(prompt(0)).not.toContain('[고른 길이')
    expect(prompt(1)).not.toContain('[고른 길이')
    expect(longer.acts).toHaveLength(4)
    expect(keep.acts).toHaveLength(4)
  })
})

describe('15초 이하 산문 — 씬 수', () => {
  // 왜: 오너 ③ "15초 이하는 산문을 1~2씬으로" — 막이 2개여도 모델이 씬을 3개 이상 쓰면 한 번 고쳐 쓰게 한다.
  it('길이를 15초 이하로 골랐으면 산문 씬은 2개까지이고, 넘으면 씬 수를 고쳐 쓰게 한 번 더 부른다', async () => {
    mocks.generate
      .mockResolvedValueOnce(scenesOf([scene('scene_1', 'act_1', 5, ['민호가 동전을 넣는다.']), scene('scene_2', 'act_2', 5, ['캔이 쏟아진다.']), scene('scene_3', 'act_2', 5, ['민호가 웃는다.'])]))
      .mockResolvedValueOnce(scenesOf([scene('scene_1', 'act_1', 7, ['민호가 동전을 넣는다.']), scene('scene_2', 'act_2', 8, ['캔이 쏟아진다.', '민호가 웃는다.'])]))
    const result = await runScenes(input({ runtimeSeconds: 15 }), genre(15), actsOf(['act_1', 'act_2']), cast, undefined, logger, S)
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    expect(prompt(1)).toContain('씬 수 3개')
    expect(result.scenes).toHaveLength(2)
  })

  // 왜: 고쳐 써도 안 줄면 작업을 멈추지 않는다 — 남는 몇 초는 저장 단계 안전망이 고른 길이 안으로 깎는다.
  it('15초 이하에서 고쳐 써도 씬이 2개를 넘으면 그대로 두고 다음 단계로 간다', async () => {
    const three = scenesOf([scene('scene_1', 'act_1', 5, ['민호가 동전을 넣는다.']), scene('scene_2', 'act_2', 5, ['캔이 쏟아진다.']), scene('scene_3', 'act_2', 5, ['민호가 웃는다.'])])
    mocks.generate.mockResolvedValueOnce(three).mockResolvedValueOnce(three)
    const result = await runScenes(input({ runtimeSeconds: 15 }), genre(15), actsOf(['act_1', 'act_2']), cast, undefined, logger, S)
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    expect(result.scenes).toHaveLength(3)
  })

  // 왜: 이 규칙 전 4막 초안(씬 하한 4)에 상한 2를 걸면 이룰 수 없는 고쳐 쓰기를 한 번 더 부른다 — 씬 다시 쓰기 · 수정 요청 모두(검토 a 재검토).
  it('15초 이하여도 들어온 구조가 막 3개 이상(이 규칙 전 초안)이면 씬 2개 상한을 걸지 않고 예전처럼 검사한다', async () => {
    mocks.generate.mockResolvedValueOnce(scenesOf([
      scene('scene_1', 'ki', 4, ['민호가 동전을 넣는다.']), scene('scene_2', 'sho', 4, ['민호가 버튼을 누른다.']),
      scene('scene_3', 'ten', 4, ['캔이 쏟아진다.']), scene('scene_4', 'ketsu', 3, ['민호가 웃는다.']),
    ]))
    const result = await runScenes(input({ runtimeSeconds: 15 }), genre(15), FOUR_ACTS, cast, undefined, logger, S)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(result.scenes).toHaveLength(4)
  })

  // 왜: 정상 경로 고정 — 15초보다 긴 길이는 지금처럼 씬 수에 2개 여유를 둔다(60초 · 3막에 4씬이면 고쳐 쓰지 않는다).
  it('길이를 15초보다 길게 골랐으면 씬 수 검사는 지금과 같다', async () => {
    mocks.generate.mockResolvedValueOnce(scenesOf([
      scene('scene_1', 'act_1', 15, ['민호가 동전을 넣는다.', '민호가 버튼을 누른다.']),
      scene('scene_2', 'act_2', 15, ['캔이 쏟아진다.', '민호가 놀란다.']),
      scene('scene_3', 'act_3', 15, ['민호가 캔을 줍는다.', '민호가 웃는다.']),
      scene('scene_4', 'act_3', 15, ['민호가 캔을 안고 걷는다.', '민호가 뒤돌아본다.']),
    ]))
    const result = await runScenes(input({ runtimeSeconds: 60 }), genre(60), actsOf(['act_1', 'act_2', 'act_3']), cast, undefined, logger, S)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(result.scenes).toHaveLength(4)
  })
})

describe('15초 이하 산문 — 합친 산문 경로(구조와 씬을 한 번에 쓰는 실험 스위치)', () => {
  const merged = (structure: NarrativeStructure, list: ReturnType<typeof scene>[]) => ({ narrative_structure: structure, ...scenesOf(list), new_characters: [] })

  // 왜: 스위치(WRITER_MERGE_S1S3)를 켜도 15초 약속이 같아야 한다 — 구조와 씬이 한 번에 나와 4막이면 씬의 막 참조도 함께 옮긴다(검토 a 2026-11-10).
  it('합친 산문 경로에서도 15초 이하면 이야기 구조를 막 1~2개로 쓰게 하고, 막이 3개 이상이면 앞뒤 두 막으로 합쳐 씬의 막 참조도 옮긴다', async () => {
    mocks.generate.mockResolvedValueOnce(merged(FOUR_ACTS, [scene('scene_1', 'ki', 7, ['민호가 동전을 넣는다.']), scene('scene_2', 'ketsu', 8, ['캔이 쏟아진다.', '민호가 웃는다.'])]))
    const result = await runStructureScenesMerged(input({ runtimeSeconds: 15 }), genre(15), cast, undefined, logger, S)
    expect(prompt(0)).toContain('[고른 길이 — 15초 이하]')
    expect(result.narrativeStructure.acts.map((a) => a.act_id)).toEqual(['ki', 'ten'])
    expect(result.scenes.scenes.map((s) => s.act_ref)).toEqual(['ki', 'ten'])
  })

  // 왜: 오너 ③ "15초 이하는 산문을 1~2씬으로" — 합친 경로도 씬이 3개 이상이면 한 번 고쳐 쓰게 한다.
  it('합친 산문 경로에서도 15초 이하면 씬은 2개까지이고, 넘으면 씬 수를 고쳐 쓰게 한 번 더 부른다', async () => {
    const two = actsOf(['act_1', 'act_2'])
    mocks.generate
      .mockResolvedValueOnce(merged(two, [scene('scene_1', 'act_1', 5, ['민호가 동전을 넣는다.']), scene('scene_2', 'act_2', 5, ['캔이 쏟아진다.']), scene('scene_3', 'act_2', 5, ['민호가 웃는다.'])]))
      .mockResolvedValueOnce(merged(two, [scene('scene_1', 'act_1', 7, ['민호가 동전을 넣는다.']), scene('scene_2', 'act_2', 8, ['캔이 쏟아진다.', '민호가 웃는다.'])]))
    const result = await runStructureScenesMerged(input({ runtimeSeconds: 15 }), genre(15), cast, undefined, logger, S)
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    expect(prompt(1)).toContain('씬 수 3개')
    expect(result.scenes.scenes).toHaveLength(2)
  })

  // 왜: 정상 경로 고정 — 합친 경로도 15초보다 긴 길이는 지금 규칙 그대로다.
  it('합친 산문 경로에서 15초보다 길게 골랐으면 구조 지시와 막 수 · 씬 수 검사는 지금과 같다', async () => {
    mocks.generate.mockResolvedValueOnce(merged(FOUR_ACTS, [
      scene('scene_1', 'ki', 15, ['민호가 동전을 넣는다.', '민호가 버튼을 누른다.']),
      scene('scene_2', 'sho', 15, ['캔이 쏟아진다.', '민호가 놀란다.']),
      scene('scene_3', 'ten', 15, ['민호가 캔을 줍는다.', '민호가 웃는다.']),
      scene('scene_4', 'ketsu', 15, ['민호가 캔을 안고 걷는다.', '민호가 뒤돌아본다.']),
    ]))
    const result = await runStructureScenesMerged(input({ runtimeSeconds: 60 }), genre(60), cast, undefined, logger, S)
    expect(prompt(0)).not.toContain('[고른 길이')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(result.narrativeStructure.acts).toHaveLength(4)
    expect(result.scenes.scenes).toHaveLength(4)
  })
})
