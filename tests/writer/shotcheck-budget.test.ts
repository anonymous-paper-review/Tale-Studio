// 샷 점검은 이 호출의 남은 시간 안에서만 기다리고, 끝난 뒤 시간이 모자라면 점검 결과를 저장해 다음 호출로 넘긴다. 80샷 넘는 작품은 기다리지 않는다(검토 b · 오너 2026-11-11)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runShotDesign: vi.fn(),
  runShotCheck: vi.fn(),
  runRenderPrompts: vi.fn(),
  runDialogue: vi.fn(),
}))

vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class PipelineLogger {}, makeProjectId: vi.fn(() => 'p') }))
vi.mock('@/lib/writer/pipeline/stages/s0_dramaturgy', () => ({ runDramaturgySafe: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1_structure', () => ({ runNarrativeStructure: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1s3_merged', () => ({ runStructureScenesMerged: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', () => ({ runScenes: vi.fn(), mergeOpenCast: vi.fn(), mergeOpenWorld: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/c_validation_1', () => ({ runStoryCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v0_visual', () => ({ runVisualIdentity: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v1_act_arc', () => ({ runActVisualArc: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v2_design', () => ({ runV2Design: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v3_scene_plan', () => ({ runSceneCinematography: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/decoupage', () => ({ runDecoupage: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v4_shots', () => ({ runShotDesign: mocks.runShotDesign }))
vi.mock('@/lib/writer/pipeline/stages/c_application_2', () => ({ runShotCheck: mocks.runShotCheck }))
vi.mock('@/lib/writer/pipeline/stages/v5_prompts', () => ({ runRenderPrompts: mocks.runRenderPrompts }))
vi.mock('@/lib/writer/pipeline/stages/dialogue', () => ({
  runDialogue: mocks.runDialogue,
  toDialogueTrack: vi.fn((r: { profiles: unknown; scenes: unknown }) => ({ profiles: r.profiles, scenes: r.scenes })),
}))
vi.mock('@/lib/writer/pipeline/util/infer_v3', () => ({ inferSceneCinematographyFromShots: vi.fn(() => []) }))
vi.mock('@/lib/writer/pipeline/util/persist_design_tokens', () => ({ persistDesignTokens: vi.fn() }))
vi.mock('@/lib/writer/pipeline/util/persist_manifest', () => ({ persistAssetsToDb: vi.fn(), persistShotsToDb: vi.fn() }))
vi.mock('@/lib/writer/types/pipeline', () => ({ isCompactDepth: vi.fn(() => false) }))
vi.mock('@/lib/writer/pipeline/validators/action_budget', () => ({ analyzeSceneActionBudget: vi.fn(() => ({ issues: [] })) }))
vi.mock('@/lib/writer/pipeline', () => ({
  resolveModels: vi.fn(() => ({ S: { provider: 'mock' }, V: { provider: 'mock' }, C: { provider: 'mock' } })),
  resolveSkip: vi.fn(() => ({ validation1: false })),
  emptyC1Report: vi.fn(() => ({})),
}))
vi.mock('@/lib/writer/run-store', () => ({
  getActiveRun: vi.fn(), saveRunState: vi.fn(), markCompleted: vi.fn(), markFailed: vi.fn(), markAwaiting: vi.fn(), advanceProjectStageAfterWriter: vi.fn(),
}))
vi.mock('@/lib/writer/llm/raw_collector', () => ({
  getPendingRawCalls: vi.fn(() => []),
  getUsageTotals: vi.fn(() => ({ calls: 0, inputTokens: 0, outputTokens: 0, inputChars: 0, outputChars: 0, rateLimitHits: 0 })),
}))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: vi.fn() }))

import { WRITER_STEPS } from '@/lib/writer/pipeline/steps'

// 이 시험을 위해 지은 샷 — 첫 장면 · 움직임 프롬프트가 없어 프롬프트 다듬기가 AI 를 두 번 부른다(점검이 나눈 샷과 같은 모양).
const SHOTS = [{ shot_id: 'shot_1' }]
const SEQUENCE = { total_shots: 1, shots: SHOTS }
const REPORT = { issues: [] }
const DIALOGUE_DONE = { done: true, doneSceneIds: ['scene_1'], scenes: [], memory: {}, profiles: [] }
const logger = () => ({ flushRawLlm: vi.fn(async () => undefined), markStage: vi.fn(async () => undefined) }) as never
const state = (over: Record<string, unknown> = {}) => ({
  input: { story: 's' }, genre: {}, characters: { characters: [] }, scenes: { scenes: [] }, visualIdentity: {}, worldVisual: {},
  characterVisual: {}, sceneCinematography: [], decoupage: { scenes: [] }, compact: false, ...over,
}) as never
const runLanes = (s: unknown, deadlineMs?: number) =>
  WRITER_STEPS.find((c) => c.key === 'shotsAndDialogue')!.run(s as never, { logger: logger(), projectId: 'p1', deadlineMs }) as Promise<Record<string, unknown>>

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.runShotDesign.mockResolvedValue({ done: true, doneSceneIds: ['scene_1'], shots: SHOTS })
  mocks.runShotCheck.mockResolvedValue({ shotSequence: SEQUENCE, report: REPORT })
  mocks.runRenderPrompts.mockResolvedValue({ total_shots: 1, shots: [] })
  mocks.runDialogue.mockResolvedValue(DIALOGUE_DONE)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('shotsAndDialogue — 샷 점검 시간 예산', () => {
  // 왜: 점검을 300초 하드 한도 전에 끊어야 결과(점검 생략 포함)를 저장할 수 있다 — 남은 예산에 저장 여유 30초를 남긴 때까지.
  it('샷 점검에는 이 호출의 남은 예산에 30초를 더한 때까지만 기다리라고 넘긴다', async () => {
    const deadlineMs = Date.now() + 240_000
    await runLanes(state(), deadlineMs)
    expect(mocks.runShotCheck.mock.calls[0].at(-1)).toEqual({ deadlineMs: deadlineMs + 30_000 })
  })

  // 왜: 오너 안 "80샷이 넘으면 점검을 처음부터 건너뛴다" — 어차피 AI 를 부르지 않으니 착수 대기(최대 200초 몫)로 다음 호출을 기다리지 않는다.
  it('샷이 80개를 넘는 작품은 샷 점검을 처음부터 건너뛰고 기다리지 않는다', async () => {
    const many = Array.from({ length: 81 }, (_, i) => ({ shot_id: `shot_${i + 1}` }))
    mocks.runShotDesign.mockResolvedValue({ done: true, doneSceneIds: ['scene_1'], shots: many })
    const patch = await runLanes(state(), Date.now() + 10_000) // 80샷 이하라면 착수 대기로 넘길 만큼만 남은 시간
    expect(mocks.runShotCheck).toHaveBeenCalledTimes(1)
    expect(patch.shotSequence).toEqual(SEQUENCE)
  })

  // 왜: 점검(수 분) 뒤 프롬프트 다듬기까지 한 호출에서 하다 잘리면, 다음 호출이 같은 점검을 다시 사고 세 번이면 Writer 가 실패했다.
  it('샷 점검이 끝났는데 남은 시간이 프롬프트 다듬기에 모자라면, 점검 결과를 저장하고 다음 호출로 넘겨 점검을 다시 사지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const t0 = new Date('2026-11-11T00:00:00Z').getTime()
    vi.setSystemTime(t0)
    mocks.runShotCheck.mockImplementation(async () => {
      vi.setSystemTime(t0 + 230_000) // 점검이 230초 걸림 — 남은 10초 < 다듬기 예상 20초(AI 두 번)
      return { shotSequence: SEQUENCE, report: REPORT }
    })
    const first = await runLanes(state(), t0 + 240_000)
    expect(mocks.runRenderPrompts).not.toHaveBeenCalled()
    expect(first).toMatchObject({ shotSequence: SEQUENCE, shotCheck: REPORT })

    vi.setSystemTime(t0 + 300_000)
    const second = await runLanes(state(first), t0 + 540_000)
    expect(mocks.runShotCheck).toHaveBeenCalledTimes(1)
    expect(mocks.runRenderPrompts).toHaveBeenCalledTimes(1)
    expect(second.renderPrompts).toBeDefined()
  })
})
