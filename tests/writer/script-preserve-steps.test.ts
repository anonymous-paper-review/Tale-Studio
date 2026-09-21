// 이 파일이 지키는 약속: 대본 보존을 고른 run 은 씬과 대사를 LLM 으로 다시 쓰지 않고 대본에서 옮기며, 대본이 아니면 종전대로 만든다 (#script-preserve 2026-09-17).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runScenes: vi.fn(),
  runDialogue: vi.fn(),
  runShotDesign: vi.fn(),
  runShotCheck: vi.fn(),
  runRenderPrompts: vi.fn(),
  generateJson: vi.fn(),
}))

vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class PipelineLogger {}, makeProjectId: vi.fn(() => 'p') }))
vi.mock('@/lib/writer/pipeline/stages/s0_dramaturgy', () => ({ runDramaturgySafe: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1_structure', () => ({ runNarrativeStructure: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1s3_merged', () => ({ runStructureScenesMerged: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', () => ({
  runScenes: mocks.runScenes,
  mergeOpenCast: vi.fn((c: unknown) => c),
  mergeOpenWorld: vi.fn((w: unknown) => w),
}))
vi.mock('@/lib/writer/pipeline/stages/c_validation_1', () => ({ runStoryCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v0_visual', () => ({ runVisualIdentity: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v1_act_arc', () => ({ runActVisualArc: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v2_design', () => ({ runV2Design: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v3_scene_plan', () => ({ runSceneCinematography: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/decoupage', () => ({ runDecoupage: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v3s_stage', () => ({ runSceneStage: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v4_shots', () => ({ runShotDesign: mocks.runShotDesign }))
vi.mock('@/lib/writer/pipeline/stages/c_application_2', () => ({ runShotCheck: mocks.runShotCheck }))
vi.mock('@/lib/writer/pipeline/stages/v5_prompts', () => ({ runRenderPrompts: mocks.runRenderPrompts }))
vi.mock('@/lib/writer/pipeline/stages/dialogue', () => ({
  runDialogue: mocks.runDialogue,
  toDialogueTrack: vi.fn((r: { profiles: unknown; scenes: unknown }) => ({ profiles: r.profiles, scenes: r.scenes })),
}))
vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: mocks.generateJson,
  describeAxisConfig: () => 'test/model',
  DEFAULT_MODELS: { S: { provider: 'mock' }, V: { provider: 'mock' }, C: { provider: 'mock' } },
}))
vi.mock('@/lib/writer/pipeline/util/infer_v3', () => ({ inferSceneCinematographyFromShots: vi.fn(() => []) }))
vi.mock('@/lib/writer/pipeline/util/persist_design_tokens', () => ({ persistDesignTokens: vi.fn() }))
vi.mock('@/lib/writer/pipeline/util/persist_manifest', () => ({ persistAssetsToDb: vi.fn(), persistShotsToDb: vi.fn(), persistSceneStagesToDb: vi.fn(), persistSceneLedgersToDb: vi.fn() }))
vi.mock('@/lib/writer/types/pipeline', () => ({ isCompactDepth: vi.fn(() => false) }))
vi.mock('@/lib/writer/pipeline/validators/action_budget', () => ({ analyzeSceneActionBudget: vi.fn(() => ({ issues: [] })) }))
vi.mock('@/lib/writer/pipeline', () => ({
  resolveModels: vi.fn(() => ({ S: { provider: 'mock' }, V: { provider: 'mock' }, C: { provider: 'mock' } })),
  resolveSkip: vi.fn(() => ({ validation1: false })),
  emptyC1Report: vi.fn(() => ({})),
}))
vi.mock('@/lib/writer/run-store', () => ({
  getActiveRun: vi.fn(),
  saveRunState: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  markAwaiting: vi.fn(),
  advanceProjectStageAfterWriter: vi.fn(),
}))
vi.mock('@/lib/writer/llm/raw_collector', () => ({
  getPendingRawCalls: vi.fn(() => []),
  getUsageTotals: vi.fn(() => ({ calls: 0, inputTokens: 0, outputTokens: 0, inputChars: 0, outputChars: 0, rateLimitHits: 0 })),
}))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: vi.fn() }))

import { WRITER_STEPS } from '@/lib/writer/pipeline/steps'
import { reconcileCastWithScript } from '@/lib/writer/script/preserve'
import { parseScript } from '@/lib/writer/script/parse'

const SCRIPT = `INT. KITCHEN - NIGHT
Mira sets the kettle down. A DOG barks outside.

MIRA
You came back.

JUN
(quietly)
I never left.

EXT. YARD - CONTINUOUS
Jun walks out. The dog follows.

JUN
Stay.`

const PROSE = `미라는 주전자를 내려놓는다. 준이 돌아왔다고 그녀는 생각한다. 밖에서 개가 짖고, 준은 마당으로 나가 개를 따라 걷는다.`

const logger = () => ({ flushRawLlm: vi.fn(async () => undefined), markStage: vi.fn(async () => undefined), saveLlmCall: vi.fn(async () => undefined) }) as never
const step = (key: string) => {
  const s = WRITER_STEPS.find((c) => c.key === key)
  if (!s) throw new Error(`${key} step missing`)
  return s
}
const SHOTS = [
  { shot_id: 'shot_1', scene_id: 'scene_1', source_beats: [0, 1] },
  { shot_id: 'shot_2', scene_id: 'scene_1', source_beats: [2] },
  { shot_id: 'shot_3', scene_id: 'scene_2', source_beats: [0, 1] },
]
function state(over: Record<string, unknown> = {}) {
  return {
    input: { story: SCRIPT, preserveScript: true },
    genre: {},
    characters: { characters: [] },
    narrativeStructure: { acts: [{ act_id: 'act_1', proportion: 1 }] },
    scenes: undefined,
    visualIdentity: {},
    worldVisual: {},
    characterVisual: {},
    sceneCinematography: [],
    decoupage: { scenes: [{ scene_id: 'scene_1', shots: SHOTS.slice(0, 2) }, { scene_id: 'scene_2', shots: SHOTS.slice(2) }] },
    compact: false,
    ...over,
  } as never
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.generateJson.mockResolvedValue({ purpose: 'conflict', emotion_beat: { start: 'still', end: 'tense' }, info_asymmetry: 'audience=character', dialogue_summary: '돌아온 준' })
  mocks.runScenes.mockResolvedValue({ scenes: [{ scene_id: 'scene_1' }], total_estimated_seconds: 10 })
  mocks.runShotDesign.mockResolvedValue({ done: true, doneSceneIds: ['scene_1', 'scene_2'], shots: SHOTS })
  mocks.runShotCheck.mockResolvedValue({ shotSequence: { total_shots: 3, shots: SHOTS }, report: { issues: [] } })
  mocks.runRenderPrompts.mockResolvedValue({ total_shots: 3, shots: [] })
  mocks.runDialogue.mockResolvedValue({ done: true, doneSceneIds: [], scenes: [], memory: {}, profiles: [] })
})

describe('대본 보존 — 씬 단계', () => {
  // 왜: 정상 경로 고정 — 보존의 첫 관문. 씬을 LLM 이 다시 나누면 그 뒤는 전부 각색이다.
  it('대본을 보존하면 씬 단계는 씬을 다시 만들지 않고 대본의 씬을 쓰며, 대본에 없는 칸만 주석기로 채운다', async () => {
    const patch = (await step('scenes').run(state(), { logger: logger(), projectId: 'p1' })) as unknown as { scenes: { scenes: Array<Record<string, unknown>> } }
    expect(mocks.runScenes).not.toHaveBeenCalled()
    expect(patch.scenes.scenes.map((s) => s.location)).toEqual(['KITCHEN', 'YARD'])
    expect(patch.scenes.scenes[0].scene_actions).toEqual(['Mira sets the kettle down. A DOG barks outside.', 'MIRA: You came back.', 'JUN: (quietly) I never left.'])
    // 주석기가 채운 칸
    expect(mocks.generateJson).toHaveBeenCalledTimes(2)
    expect(patch.scenes.scenes[0].purpose).toBe('conflict')
    expect(patch.scenes.scenes[0].provenance).toEqual({ source: 'script', generated_fields: expect.arrayContaining(['purpose', 'emotion_beat']) })
  })

  // 왜: 보존 표시는 사람이 고른 것이지만, 글이 대본이 아니면(줄거리) 보존할 씬이 없다 — 종전 동작을 지킨다.
  it('보존을 골랐어도 글이 대본이 아니면 종전대로 씬을 만든다', async () => {
    await step('scenes').run(state({ input: { story: PROSE, preserveScript: true } }), { logger: logger(), projectId: 'p1' })
    expect(mocks.runScenes).toHaveBeenCalledTimes(1)
    expect(mocks.generateJson).not.toHaveBeenCalled()
  })

  // 왜: 주석기가 죽어도 보존 런은 멈추지 않는다 — 원문이 진실이고 분류 칸은 자리표시로 남는다.
  it('주석기가 실패해도 씬 단계는 대본의 씬으로 끝난다', async () => {
    mocks.generateJson.mockRejectedValue(new Error('llm down'))
    const patch = (await step('scenes').run(state(), { logger: logger(), projectId: 'p1' })) as unknown as { scenes: { scenes: Array<Record<string, unknown>> } }
    expect(patch.scenes.scenes).toHaveLength(2)
    expect(patch.scenes.scenes[0].purpose).toBe('unknown')
  })
})

describe('대본 보존 — 대사 단계', () => {
  // 왜: 대사 저작 LLM 이 한 번이라도 돌면 대사가 바뀐다. 보존 모드에서는 부르지 않는다.
  it('대본을 보존하면 대사 단계는 대사를 저작하지 않고 대본의 대사를 샷에 싣는다', async () => {
    const doc = parseScript(SCRIPT)!
    const scenes = { scenes: doc.scenes.map((s) => ({ scene_id: s.scene_id })) }
    const patch = (await step('shotsAndDialogue').run(state({ scenes }), { logger: logger(), projectId: 'p1', deadlineMs: Date.now() + 300_000 })) as unknown as { dialogue: { scenes: Array<{ scene_id: string; shots: Array<{ shot_id: string; dialogue: Array<{ character_id: string; line: string }> }> }> } }
    expect(mocks.runDialogue).not.toHaveBeenCalled()
    const byShot = Object.fromEntries(patch.dialogue.scenes.flatMap((s) => s.shots.map((sh) => [sh.shot_id, sh.dialogue.map((l) => `${l.character_id}: ${l.line}`)])))
    expect(byShot).toEqual({ shot_1: ['mira: You came back.'], shot_2: ['jun: I never left.'], shot_3: ['jun: Stay.'] })
  })
})

describe('대본 보존 — producer 캐스트와의 정합', () => {
  // 왜: producer 카드의 슬러그가 DB 의 진실이다. 대본 인물이 같은 사람이면 그 슬러그를 쓰고, 대사의 화자도 따라간다.
  it('producer 캐스트가 있으면 대본 인물은 이름이 같은 카드의 슬러그를 쓰고, 없는 인물만 뒤에 붙는다', () => {
    const doc = parseScript(SCRIPT)!
    const cast = { characters: [{ character_id: 'char_mira', name: 'Mira', entity_type: 'person' as const, appearance: '' }] }
    const r = reconcileCastWithScript(doc, cast)
    expect(r.cast.characters.map((c) => c.character_id)).toEqual(['char_mira', 'jun'])
    const speakers = r.doc.scenes.flatMap((s) => s.elements).filter((e) => e.type === 'dialogue').map((e) => (e.type === 'dialogue' ? e.character_id : ''))
    expect(speakers).toEqual(['char_mira', 'jun', 'jun'])
    expect(r.doc.scenes[0].characters).toEqual(['char_mira', 'jun'])
  })
})
