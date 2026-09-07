// shotsAndDialogue 합성 step 의 유료 호출 보존 계약(2026-08-11).
//   ① 착수 게이트(#shotcheck-gate): 남은 예산으로 못 끝낼 shotCheck 는 시작하지 않고 shotDesign 을 저장한다.
//   ② 레인 독립(#lane-independent): 한 레인이 실패해도 반대 레인의 완료분을 버리지 않는다.
// 고치는 사고: 예산 끝에 shotDesign 완주 → 게이트 없이 shotCheck 착수 → 함수 수명에 잘림 →
//   patch 가 로컬 변수인 채 소실 → 다음 인보케이션이 같은 유료 호출을 반복.
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', () => ({
  runScenes: vi.fn(),
  mergeOpenCast: vi.fn(),
  mergeOpenWorld: vi.fn(),
}))
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

const SHOTS = [{ shot_id: 'shot_1' }]
const SEQUENCE = { total_shots: 1, shots: SHOTS }
const DIALOGUE_DONE = { done: true, doneSceneIds: ['scene_1'], scenes: [], memory: {}, profiles: [] }

const logger = () =>
  ({ flushRawLlm: vi.fn(async () => undefined), markStage: vi.fn(async () => undefined) }) as never

function state(over: Record<string, unknown> = {}) {
  return {
    input: { story: 's' },
    genre: {},
    characters: { characters: [] },
    scenes: { scenes: [] },
    visualIdentity: {},
    worldVisual: {},
    characterVisual: {},
    sceneCinematography: [],
    decoupage: { scenes: [] },
    compact: false,
    ...over,
  } as never
}

const runLanes = (s: unknown, deadlineMs?: number) => {
  const step = WRITER_STEPS.find((c) => c.key === 'shotsAndDialogue')
  if (!step) throw new Error('shotsAndDialogue step missing')
  return step.run(s as never, { logger: logger(), projectId: 'p1', deadlineMs })
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.runShotDesign.mockResolvedValue({ done: true, doneSceneIds: ['scene_1'], shots: SHOTS })
  mocks.runShotCheck.mockResolvedValue({ shotSequence: SEQUENCE, report: { issues: [] } })
  mocks.runRenderPrompts.mockResolvedValue({ total_shots: 1, shots: [] })
  mocks.runDialogue.mockResolvedValue(DIALOGUE_DONE)
})

describe('shotsAndDialogue — shotCheck 착수 게이트', () => {
  it('남은 예산이 부족하면 shotCheck 를 시작하지 않고 shotDesign 을 체크포인트한다', async () => {
    // 예산 10s 남음 < 예상 160s → 착수 보류.
    const patch = (await runLanes(state(), Date.now() + 10_000)) as Record<string, unknown>

    expect(mocks.runShotDesign).toHaveBeenCalledTimes(1)
    expect(mocks.runShotCheck).not.toHaveBeenCalled()
    expect(mocks.runRenderPrompts).not.toHaveBeenCalled()
    // 방금 만든 shotDesign 이 patch 에 담겨 저장된다 — 이게 소실을 막는 지점.
    expect(patch.shotDesign).toEqual(SHOTS)
  })

  it('예산이 충분하면 그대로 이어서 shotCheck·renderPrompts 까지 간다', async () => {
    const patch = (await runLanes(state(), Date.now() + 300_000)) as Record<string, unknown>

    expect(mocks.runShotCheck).toHaveBeenCalledTimes(1)
    expect(mocks.runRenderPrompts).toHaveBeenCalledTimes(1)
    expect(patch.shotDesign).toEqual(SHOTS)
    expect(patch.shotSequence).toEqual(SEQUENCE)
  })

  it('예산이 없으면(로컬 러너) 게이트가 걸리지 않는다', async () => {
    await runLanes(state(), undefined)
    expect(mocks.runShotCheck).toHaveBeenCalledTimes(1)
  })
})

describe('shotsAndDialogue — 레인 독립 체크포인트', () => {
  it('대사 레인이 실패해도 비주얼 레인 산출물을 버리지 않는다 (throw 없음)', async () => {
    mocks.runDialogue.mockRejectedValue(new Error('dialogue down'))

    const patch = (await runLanes(state(), Date.now() + 300_000)) as Record<string, unknown>

    expect(patch.shotDesign).toEqual(SHOTS)
    expect(patch.shotSequence).toEqual(SEQUENCE)
    expect(patch.dialogue).toBeUndefined() // 실패 레인은 다음 인보케이션이 이어받는다
  })

  it('비주얼 레인이 실패해도 대사 레인 산출물을 버리지 않는다', async () => {
    mocks.runShotDesign.mockRejectedValue(new Error('shotDesign down'))

    const patch = (await runLanes(state(), Date.now() + 300_000)) as Record<string, unknown>

    expect(patch.dialogue).toBeDefined()
    expect(patch.shotDesign).toBeUndefined()
  })

  it('진전이 0 인데 레인이 실패하면 표면화한다 (무한 재시도 방지)', async () => {
    mocks.runDialogue.mockRejectedValue(new Error('dialogue down'))
    // 비주얼 레인은 이미 전부 끝나 있어 빈 patch 를 낸다 → 흡수할 진전이 없다.
    const done = state({
      shotDesign: SHOTS,
      shotSequence: SEQUENCE,
      shotCheck: { issues: [] },
      renderPrompts: { total_shots: 1, shots: [] },
    })

    await expect(runLanes(done, Date.now() + 300_000)).rejects.toThrow('dialogue down')
  })
})
