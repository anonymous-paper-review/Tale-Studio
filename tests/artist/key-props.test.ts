// [만들기] 때 AI 가 이야기에서 중요한 소품을 골라(Producer 사물을 합쳐 많아야 5개) 사물로 더하고 그 소품이 나오는 장면에 잇는지 — 사람 · Producer 사물 · 배경과 겹치지 않고, 실패해도 [만들기]가 멈추지 않는지 검사한다 (D7 오너 E5, 2026-11-22)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  runV2Design: vi.fn(),
  persistDesignTokens: vi.fn(),
  persistAssetsToDb: vi.fn(),
  triggerAssetDrafts: vi.fn(),
  events: [] as Array<{ event: string; payload: Record<string, unknown> | undefined }>,
}))

vi.mock('@/lib/writer/llm/dispatch', () => ({ generateJson: mocks.generateJson }))
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: vi.fn(async (_projectId: string, event: string, payload?: Record<string, unknown>) => {
    mocks.events.push({ event, payload })
  }),
}))
vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class PipelineLogger {}, makeProjectId: vi.fn(() => 'project') }))
vi.mock('@/lib/writer/pipeline/stages/s1_structure', () => ({ runNarrativeStructure: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', () => ({ runScenes: vi.fn(), mergeOpenCast: vi.fn(), mergeOpenWorld: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/c_validation_1', () => ({ runStoryCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v0_visual', () => ({ runVisualIdentity: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v1_act_arc', () => ({ runActVisualArc: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v2_design', () => ({ runV2Design: mocks.runV2Design }))
vi.mock('@/lib/writer/pipeline/stages/v3_scene_plan', () => ({ runSceneCinematography: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/decoupage', () => ({ runDecoupage: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v4_shots', () => ({ runShotDesign: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/c_application_2', () => ({ runShotCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v5_prompts', () => ({ runRenderPrompts: vi.fn() }))
vi.mock('@/lib/writer/pipeline/util/infer_v3', () => ({ inferSceneCinematographyFromShots: vi.fn(() => []) }))
vi.mock('@/lib/writer/pipeline/util/persist_design_tokens', () => ({ persistDesignTokens: mocks.persistDesignTokens }))
vi.mock('@/lib/writer/pipeline/util/persist_manifest', () => ({ persistAssetsToDb: mocks.persistAssetsToDb, persistShotsToDb: vi.fn() }))
vi.mock('@/lib/writer/types/pipeline', () => ({ isCompactDepth: vi.fn(() => false) }))
vi.mock('@/lib/writer/pipeline/validators/action_budget', () => ({ analyzeSceneActionBudget: vi.fn(() => ({ issues: [] })) }))
vi.mock('@/lib/writer/pipeline', () => ({
  resolveModels: vi.fn(() => ({ S: { provider: 'gemini', model: 'story-model' }, V: { provider: 'gemini', model: 'design-model' }, C: { provider: 'claude', model: 'shot-model' } })),
  resolveSkip: vi.fn(() => ({ validation1: false })),
  emptyC1Report: vi.fn(() => ({})),
}))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: vi.fn(), saveRunState: vi.fn(), markCompleted: vi.fn(), markFailed: vi.fn(), advanceProjectStageAfterWriter: vi.fn() }))
vi.mock('@/lib/writer/llm/raw_collector', () => ({ getPendingRawCalls: vi.fn(() => []) }))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: mocks.triggerAssetDrafts }))

import { buildKeyPropsPrompt, KEY_PROP_LIMIT, keyPropRoom, mergeKeyProps, pickKeyProps } from '@/lib/writer/pipeline/stages/key_props'
import { WRITER_STEPS } from '@/lib/writer/pipeline/steps'
import type { Characters, Scenes, StoryCharacter, StoryScene } from '@/lib/writer/types/pipeline'

const story = (id: string, name: string, extra: Partial<StoryCharacter> = {}): StoryCharacter => ({
  id,
  name,
  entity_type: 'person',
  role: 'protagonist',
  personality: [],
  arc: { start_state: '', end_state: '', arc_type: '' },
  appearance_description: '',
  motivation: { want: '', need: '' },
  ...extra,
})
const object = (id: string, name: string, appearance = '') => story(id, name, { entity_type: 'object', role: 'supporting', appearance_description: appearance })
const scene = (sceneId: string, cast: string[]): StoryScene => ({
  scene_id: sceneId,
  act_ref: 'act_1',
  location: 'attic',
  time_of_day: 'day',
  narrative_time: 'present' as never,
  characters_in_scene: cast,
  purpose: 'exposition',
  emotion_beat: { start: 'calm', end: 'longing' },
  dialogue_summary: '민지가 다락방에서 할아버지의 물건을 정리한다',
  info_asymmetry: 'audience=character',
  estimated_seconds: 10,
  scene_actions: ['민지가 상자를 연다'],
})
const CHARACTERS: Characters = { characters: [story('min_ji', '민지'), object('pocket_watch', '회중시계', '낡은 은빛 회중시계')], relationships: [], subtext_notes: [] }
const SCENES: Scenes = { scenes: [scene('sc_01', ['min_ji', 'pocket_watch']), scene('sc_02', ['min_ji'])], total_estimated_seconds: 20 }
const LOCATIONS = [{ id: 'attic', name: '다락방', description: '먼지 쌓인 다락방' }]
const pick = (id: string, name: string, scenes: string[], appearance = `${name}의 생김새`) => ({ id, name, appearance, scenes })
const logger = () => ({ flushRawLlm: vi.fn(async () => undefined), markStage: vi.fn(async () => undefined), saveLlmCall: vi.fn(async () => undefined) }) as never
const pickArgs = (over: Record<string, unknown> = {}) => ({
  characters: CHARACTERS,
  scenes: SCENES,
  world: { locations: LOCATIONS },
  story: '민지는 다락방에서 할아버지의 회중시계와 누런 편지를 찾는다.',
  locale: 'ko' as const,
  logger: logger(),
  axis: { provider: 'gemini' as const, model: 'design-model' },
  projectId: 'project-1',
  ...over,
})

beforeEach(() => {
  mocks.events.length = 0
  mocks.generateJson.mockReset()
  mocks.runV2Design.mockReset()
  mocks.runV2Design.mockResolvedValue({ characterVisual: { characters: [] }, worldVisual: { locations: [] } })
  mocks.persistDesignTokens.mockReset()
  mocks.persistAssetsToDb.mockReset()
  mocks.persistAssetsToDb.mockResolvedValue(undefined)
  mocks.triggerAssetDrafts.mockReset()
  mocks.triggerAssetDrafts.mockResolvedValue({ characters: { submitted: 0 }, worlds: { submitted: 0 } })
})

describe('[만들기] 때 중요한 소품 고르기', () => {
  // 왜: 오너 E5(2026-11-22 "추천대로" = B) — 소품은 [만들기] 때 AI 가 이야기에서 골라 카드가 되고, 그 소품이 나오는 장면에 이어져야 샷 소품 칸이 그 소품을 가리킨다(실사 참고).
  it('[만들기] 때 AI 가 이야기에서 고른 중요한 소품을 사물로 더하고, 그 소품이 나오는 장면에 잇는다', () => {
    const merged = mergeKeyProps({ characters: CHARACTERS, scenes: SCENES, locations: LOCATIONS, picked: [pick('old_letter', '누런 편지', ['sc_02'], '누렇게 바랜 편지')], room: 4 })
    expect(merged.characters.characters.find((c) => c.id === 'old_letter')).toMatchObject({ name: '누런 편지', entity_type: 'object', appearance_description: '누렇게 바랜 편지' })
    expect(merged.scenes.scenes.find((s) => s.scene_id === 'sc_02')?.characters_in_scene).toEqual(['min_ji', 'old_letter'])
    expect(merged.scenes.scenes.find((s) => s.scene_id === 'sc_01')?.characters_in_scene).toEqual(['min_ji', 'pocket_watch'])
    expect(merged.outcome.added).toEqual([{ id: 'old_letter', name: '누런 편지', scenes: ['sc_02'] }])
    // 들어온 값은 건드리지 않는다(실행 상태는 단계가 돌려준 값으로만 바뀐다).
    expect(CHARACTERS.characters).toHaveLength(2)
    expect(SCENES.scenes[1].characters_in_scene).toEqual(['min_ji'])
  })

  // 왜: 오너 E5 "Producer 사물 카드가 있으면 늘 넣는다(겹치면 하나로)" · 리드 "사람과 겹치지 않음" — 사람을 소품으로 그리거나 같은 물건 카드가 둘 생기면 안 된다.
  it('AI 가 고른 소품이 사람이거나 Producer 사물과 같으면 넣지 않고, Producer 사물은 그대로 하나만 남는다', () => {
    const merged = mergeKeyProps({
      characters: CHARACTERS,
      scenes: SCENES,
      locations: LOCATIONS,
      picked: [pick('minji_doll', '민지', ['sc_01']), pick('pocket_watch', '은 회중시계', ['sc_01']), pick('silver_watch', '회중 시계', ['sc_01'])],
      room: 4,
    })
    expect(merged.outcome.added).toEqual([])
    expect(merged.outcome.dropped.map((d) => d.reason)).toEqual(['person', 'duplicate', 'duplicate'])
    expect(merged.characters.characters.filter((c) => c.entity_type === 'object').map((c) => c.id)).toEqual(['pocket_watch'])
    expect(merged.characters.characters.find((c) => c.id === 'pocket_watch')?.appearance_description).toBe('낡은 은빛 회중시계')
  })

  // 왜: 혼자 정한 것 — 오너 말 "중요한 소품 3~5개". Producer 사물도 소품이라 합쳐 5개를 넘기면 카드 · 그림이 늘어 산만하고 비싸다. 자리가 없으면 AI 를 부르지도 않는다(돈 · 시간).
  it('소품은 Producer 사물을 합쳐 많아야 5개이고, Producer 사물이 5개 이상이면 AI 에게 고르게 하지 않는다', async () => {
    expect(KEY_PROP_LIMIT).toBe(5)
    expect(keyPropRoom(CHARACTERS)).toBe(4)
    const merged = mergeKeyProps({ characters: CHARACTERS, scenes: SCENES, locations: LOCATIONS, picked: [pick('old_letter', '편지', ['sc_02']), pick('lamp', '등잔', ['sc_01']), pick('box', '나무 상자', ['sc_01'])], room: 2 })
    expect(merged.outcome.added.map((a) => a.id)).toEqual(['old_letter', 'lamp'])
    expect(merged.outcome.dropped).toEqual([{ id: 'box', reason: 'over_limit' }])
    const full: Characters = { ...CHARACTERS, characters: [story('min_ji', '민지'), ...['a', 'b', 'c', 'd', 'e'].map((id) => object(`obj_${id}`, `물건 ${id}`))] }
    expect(keyPropRoom(full)).toBe(0)
    const result = await pickKeyProps(pickArgs({ characters: full }))
    expect(mocks.generateJson).not.toHaveBeenCalled()
    expect(result.characters).toBeUndefined()
    expect(result.outcome).toEqual({ added: [], dropped: [], skipped: 'full' })
  })

  // 왜: 오너 E5 · 리드 "이야기에 소품이 없으면 0개도 됨" — 채우려고 아무 물건이나 만들지 않는다.
  it('이야기에 중요한 물건이 없으면 소품을 하나도 고르지 않는다', async () => {
    mocks.generateJson.mockResolvedValueOnce({ props: [] })
    const result = await pickKeyProps(pickArgs())
    expect(mocks.generateJson).toHaveBeenCalledTimes(1)
    expect(result.characters).toBeUndefined()
    expect(result.scenes).toBeUndefined()
    expect(result.outcome).toEqual({ added: [], dropped: [] })
  })

  // 왜: 리드 "실패해도 [만들기]는 멈추지 않음" — 소품은 더하는 것이라, 고르기가 막히면 소품 없이 인물 · 배경 디자인으로 간다. 실패는 관측 기록으로 남긴다.
  it('소품 고르기가 실패해도 [만들기]는 멈추지 않고 소품 없이 인물 · 배경 디자인으로 이어 간다', async () => {
    mocks.generateJson.mockRejectedValueOnce(new Error('model timeout'))
    const result = await pickKeyProps(pickArgs())
    expect(result.characters).toBeUndefined()
    expect(result.outcome).toMatchObject({ added: [], failed: 'model timeout' })
    expect(mocks.events).toEqual([{ event: 'route_failed', payload: expect.objectContaining({ kind: 'key_props', error: 'model timeout' }) }])
    // 모델이 약속한 꼴이 아닌 답을 줘도 같다.
    mocks.generateJson.mockResolvedValueOnce({ nope: true })
    expect((await pickKeyProps(pickArgs())).outcome).toMatchObject({ added: [], failed: expect.any(String) })
    // 디자인 단계 전체로도 — 고르기가 실패해도 인물 · 배경 디자인 · 저장 · 첫 그림이 그대로 돈다.
    mocks.generateJson.mockRejectedValueOnce(new Error('model timeout'))
    const patch = (await runV2DesignStep()) as Record<string, unknown>
    expect(mocks.runV2Design).toHaveBeenCalledTimes(1)
    expect(mocks.runV2Design.mock.calls[0][2]).toBe(CHARACTERS)
    expect(mocks.persistAssetsToDb).toHaveBeenCalledTimes(1)
    expect(mocks.triggerAssetDrafts).toHaveBeenCalledWith('project-1')
    expect(patch).not.toHaveProperty('characters')
    expect(patch.keyProps).toMatchObject({ failed: 'model timeout' })
  })

  // 왜: 혼자 정한 것 — 배경 카드와 같은 것을 소품 카드로 또 만들지 않고, 이야기 장면에 나오지 않는 물건은 샷에 이을 수 없어 카드만 늘린다.
  it('배경과 같은 이름이거나 이야기 장면에 나오지 않는 물건은 소품으로 고르지 않는다', () => {
    const merged = mergeKeyProps({
      characters: CHARACTERS,
      scenes: SCENES,
      locations: LOCATIONS,
      picked: [pick('attic_room', '다락방', ['sc_01']), pick('ghost_key', '열쇠', ['sc_99']), pick('candle', '초', [])],
      room: 4,
    })
    expect(merged.outcome.added).toEqual([])
    expect(merged.outcome.dropped.map((d) => d.reason)).toEqual(['location', 'no_scene', 'no_scene'])
  })

  // 왜: 혼자 정한 것 — 소품 id 는 샷 소품 칸 · 그림 파일 이름에 쓰인다. 영어 소문자 · 밑줄로 맞추고, 사람 · 배경 · 다른 소품 id 와 겹치면 뒤에 번호를 붙여 다른 것을 가리키지 않게 한다.
  it('고른 소품의 id 는 영어 소문자 · 밑줄로 맞추고, 이미 쓰는 id 와 겹치면 뒤에 번호를 붙인다', () => {
    const merged = mergeKeyProps({
      characters: CHARACTERS,
      scenes: SCENES,
      locations: LOCATIONS,
      picked: [pick('Old Letter!', '누런 편지', ['sc_02']), pick('attic', '낡은 등잔', ['sc_01']), pick('편지', '편지 봉투', ['sc_02'])],
      room: 4,
    })
    expect(merged.outcome.added.map((a) => a.id)).toEqual(['old_letter', 'attic_2', 'prop_3'])
  })

  // 왜: 리드 "같은 Flash 모델" — 인물 · 배경 디자인과 같은 모델(V축)로 고르고, 이름 · 생김새는 작품 언어로 써야 카드 · 그림이 그 언어로 맞는다.
  it('소품은 인물 · 배경 디자인과 같은 모델로, 작품 언어로 이름 · 생김새를 쓰게 해서 고른다', async () => {
    mocks.generateJson.mockResolvedValueOnce({ props: [pick('old_letter', '누런 편지', ['sc_02'])] })
    await runV2DesignStep()
    expect(mocks.generateJson).toHaveBeenCalledTimes(1)
    const [prompt, axis, opts] = mocks.generateJson.mock.calls[0]
    expect(axis).toEqual({ provider: 'gemini', model: 'design-model' })
    expect(String(opts.systemInstruction)).toMatch(/한국어/)
    expect(String(prompt)).toContain('sc_02')
    expect(String(prompt)).toContain('pocket_watch')
  })

  // 왜: 오너 E5 — 고른 소품이 Producer 사물 카드와 같은 길로 간다: 인물 · 배경 디자인과 저장(소품 카드)에 함께 넘어가고 그 뒤 첫 그림이 그린다. 장면에 이은 것도 실행에 남아 샷 단계가 쓴다.
  it('[만들기] 디자인 단계는 고른 소품을 인물 · 배경 디자인과 저장에 함께 넘겨, 소품 카드와 첫 그림으로 이어진다', async () => {
    mocks.generateJson.mockResolvedValueOnce({ props: [pick('old_letter', '누런 편지', ['sc_02'])] })
    const patch = (await runV2DesignStep()) as { characters?: Characters; scenes?: Scenes; keyProps?: unknown }
    const designed = mocks.runV2Design.mock.calls[0][2] as Characters
    expect(designed.characters.map((c) => c.id)).toEqual(['min_ji', 'pocket_watch', 'old_letter'])
    const [, savedCharacters, savedScenes] = mocks.persistAssetsToDb.mock.calls[0] as [string, Characters, Scenes]
    expect(savedCharacters.characters.find((c) => c.id === 'old_letter')?.entity_type).toBe('object')
    expect(savedScenes.scenes.find((s) => s.scene_id === 'sc_02')?.characters_in_scene).toContain('old_letter')
    expect(mocks.triggerAssetDrafts).toHaveBeenCalledWith('project-1')
    expect(patch.characters?.characters.map((c) => c.id)).toContain('old_letter')
    expect(patch.scenes?.scenes.find((s) => s.scene_id === 'sc_02')?.characters_in_scene).toContain('old_letter')
    expect(patch.keyProps).toEqual({ added: [{ id: 'old_letter', name: '누런 편지', scenes: ['sc_02'] }], dropped: [] })
  })

  // 왜: 혼자 정한 것(쉬움, 리드 승인 2026-11-22) — 오너 P1(b) 로 소품 그림은 설명에 적힌 글씨만 그린다. AI 가 고른 소품의 생김새에 글씨가 없으면
  //   간판 · 책 표지 · 편지도 글씨 없이 그려진다. 그래서 이야기에서 뜻을 나르는 글씨는 따옴표로 그대로 적게 하고, 이야기에 없는 글씨는 지어내지 않게 한다.
  it('AI 가 소품을 고를 때 이야기에서 뜻을 나르는 글씨(간판 · 책 제목 · 편지)는 생김새에 따옴표로 그대로 적고, 없는 글씨는 지어내지 않게 한다', () => {
    const { systemInstruction } = buildKeyPropsPrompt({ characters: CHARACTERS, scenes: SCENES, locations: LOCATIONS, story: '수아는 \'하동역\' 간판 아래에서 편지를 읽는다.', locale: 'ko', room: 4 })
    expect(systemInstruction).toMatch(/뜻을 나르는 글씨/)
    expect(systemInstruction).toMatch(/간판 · 책 제목 · 편지/)
    expect(systemInstruction).toMatch(/따옴표로 그대로 적/)
    expect(systemInstruction).toMatch(/이야기에 없는 글씨는 지어내지 않는다/)
  })

  // 왜: 혼자 정한 것 — 장면이 없으면 고를 근거도 이을 곳도 없다. 모델을 부르지 않고 실행 상태도 바꾸지 않는다.
  it('장면이 없는 실행에는 소품 고르기를 부르지 않는다', async () => {
    const result = await pickKeyProps(pickArgs({ scenes: { scenes: [], total_estimated_seconds: 0 } }))
    expect(mocks.generateJson).not.toHaveBeenCalled()
    expect(result).toEqual({})
  })
})

async function runV2DesignStep(): Promise<unknown> {
  const step = WRITER_STEPS.find((candidate) => candidate.key === 'v2Design')
  if (!step) throw new Error('v2Design step missing')
  return step.run(
    {
      input: { story: '민지는 다락방에서 할아버지의 회중시계와 누런 편지를 찾는다.', outputLocale: 'ko' },
      visualIdentity: { format: {}, style: {} },
      actVisualArc: { acts: [] },
      characters: CHARACTERS,
      world: { locations: LOCATIONS },
      scenes: SCENES,
    } as never,
    { logger: logger(), projectId: 'project-1' },
  )
}
