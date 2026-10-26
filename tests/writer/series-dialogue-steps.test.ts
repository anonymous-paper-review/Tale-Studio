// 시리즈 다음 화 Writer 실행의 대사 단계가 실행에 실린 앞 화 줄거리와 말투를 대사 저작에 넘긴다 (2026-10-26 Q3)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runDialogue: vi.fn(),
  runShotDesign: vi.fn(),
  runShotCheck: vi.fn(),
  runRenderPrompts: vi.fn(),
}))

vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class PipelineLogger {}, makeProjectId: vi.fn(() => 'p') }))
vi.mock('@/lib/writer/pipeline/stages/s0_dramaturgy', () => ({ runDramaturgySafe: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1_structure', () => ({ runNarrativeStructure: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1s3_merged', () => ({ runStructureScenesMerged: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', () => ({ runScenes: vi.fn(), mergeOpenCast: vi.fn((c: unknown) => c), mergeOpenWorld: vi.fn((w: unknown) => w) }))
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
  generateJson: vi.fn(),
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

const series = { prevTitle: '1화 · 운동장의 밤', prevProse: '지아와 민호가 운동장에서 다투고 돌아섰다.', characters: ['지아'], locations: ['운동장'] }
const inheritedVoices = [{ character_id: 'jia', name: '지아', speech_style: '앞 화 말투' }]
const SHOTS = [{ shot_id: 'shot_1', scene_id: 'scene_1', source_beats: [0] }]
const logger = () => ({ flushRawLlm: vi.fn(async () => undefined), markStage: vi.fn(async () => undefined), saveLlmCall: vi.fn(async () => undefined) }) as never
const shotsAndDialogue = () => {
  const s = WRITER_STEPS.find((c) => c.key === 'shotsAndDialogue')
  if (!s) throw new Error('shotsAndDialogue step missing')
  return s
}
function state(input: Record<string, unknown>) {
  return {
    input: { story: '지아가 민호에게 편지를 쓴다.', ...input },
    genre: {},
    characters: { characters: [] },
    narrativeStructure: { acts: [{ act_id: 'act_1', proportion: 1 }] },
    scenes: { scenes: [{ scene_id: 'scene_1' }] },
    visualIdentity: {},
    worldVisual: {},
    characterVisual: {},
    sceneCinematography: [],
    decoupage: { scenes: [{ scene_id: 'scene_1', shots: SHOTS }] },
    compact: false,
  } as never
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.runShotDesign.mockResolvedValue({ done: true, doneSceneIds: ['scene_1'], shots: SHOTS })
  mocks.runShotCheck.mockResolvedValue({ shotSequence: { total_shots: 1, shots: SHOTS }, report: { issues: [] } })
  mocks.runRenderPrompts.mockResolvedValue({ total_shots: 1, shots: [] })
  mocks.runDialogue.mockResolvedValue({ done: true, doneSceneIds: ['scene_1'], scenes: [], memory: {}, profiles: [] })
})

describe('시리즈 다음 화 Writer 실행의 대사 단계', () => {
  // 왜: 같이 정한 것(10-26 Q3) — 실행에 실린 앞 화 줄거리가 대사 저작까지 닿아야 대사가 앞 화와 어긋나지 않는다.
  it('시리즈 다음 화 실행은 대사 단계에 앞 화 줄거리와 말투를 넘긴다', async () => {
    await shotsAndDialogue().run(state({ series, inheritedVoices }), { logger: logger(), projectId: 'p1', deadlineMs: Date.now() + 300_000 })

    expect(mocks.runDialogue).toHaveBeenCalledTimes(1)
    const opts = mocks.runDialogue.mock.calls[0][7]
    expect(opts.series).toEqual(series)
    expect(opts.inheritedVoices).toEqual(inheritedVoices)
  })

  // 왜: 혼자 정한 것 — 정상 경로 고정. 보통 프로젝트의 대사 단계에는 시리즈 칸이 없다.
  it('시리즈가 아닌 실행은 대사 단계에 시리즈 칸을 넘기지 않는다', async () => {
    await shotsAndDialogue().run(state({}), { logger: logger(), projectId: 'p1', deadlineMs: Date.now() + 300_000 })

    const opts = mocks.runDialogue.mock.calls[0][7]
    expect(opts.series).toBeUndefined()
    expect(opts.inheritedVoices).toBeUndefined()
  })
})
