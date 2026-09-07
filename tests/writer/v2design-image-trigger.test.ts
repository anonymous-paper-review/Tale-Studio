import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  runV2Design: vi.fn(),
  persistDesignTokens: vi.fn(),
  persistAssetsToDb: vi.fn(),
  persistShotsToDb: vi.fn(),
  triggerAssetDrafts: vi.fn(),
}))

vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class PipelineLogger {}, makeProjectId: vi.fn(() => 'project') }))
vi.mock('@/lib/writer/pipeline/stages/s1_structure', () => ({ runNarrativeStructure: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', () => ({
  runScenes: vi.fn(),
  mergeOpenCast: vi.fn(),
  mergeOpenWorld: vi.fn(),
}))
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
vi.mock('@/lib/writer/pipeline/util/persist_manifest', () => ({
  persistAssetsToDb: mocks.persistAssetsToDb,
  persistShotsToDb: mocks.persistShotsToDb,
}))
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
  advanceProjectStageAfterWriter: vi.fn(),
}))
vi.mock('@/lib/writer/llm/raw_collector', () => ({ getPendingRawCalls: vi.fn(() => []) }))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: mocks.triggerAssetDrafts }))

import { WRITER_STEPS } from '@/lib/writer/pipeline/steps'

const CHARACTER_VISUAL = { characters: [] }
const WORLD_VISUAL = { locations: [] }

beforeEach(() => {
  mocks.events.length = 0
  mocks.runV2Design.mockReset()
  mocks.runV2Design.mockResolvedValue({ characterVisual: CHARACTER_VISUAL, worldVisual: WORLD_VISUAL })
  mocks.persistDesignTokens.mockReset()
  mocks.persistDesignTokens.mockImplementation(async () => {
    mocks.events.push('designTokens')
  })
  mocks.persistAssetsToDb.mockReset()
  mocks.persistAssetsToDb.mockImplementation(async () => {
    mocks.events.push('assets')
  })
  mocks.persistShotsToDb.mockReset()
  mocks.triggerAssetDrafts.mockReset()
  mocks.triggerAssetDrafts.mockImplementation(async () => {
    mocks.events.push('trigger')
  })
})

describe('writer v2Design image trigger timing', () => {
  it('calls triggerAssetDrafts after design_tokens and asset persists', async () => {
    const patch = await runV2DesignStep()

    expect(patch).toEqual({ characterVisual: CHARACTER_VISUAL, worldVisual: WORLD_VISUAL })
    expect(mocks.events).toEqual(['designTokens', 'assets', 'trigger'])
    expect(mocks.triggerAssetDrafts).toHaveBeenCalledWith('project-1')
  })

  it('fails the v2Design step when persistDesignTokens rejects', async () => {
    mocks.persistDesignTokens.mockRejectedValueOnce(new Error('persist failed'))

    await expect(runV2DesignStep()).rejects.toThrow('persist failed')
    expect(mocks.persistAssetsToDb).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('absorbs triggerAssetDrafts rejection after both persists', async () => {
    mocks.triggerAssetDrafts.mockImplementationOnce(async () => {
      mocks.events.push('trigger')
      throw new Error('trigger failed')
    })

    await expect(runV2DesignStep()).resolves.toEqual({ characterVisual: CHARACTER_VISUAL, worldVisual: WORLD_VISUAL })
    expect(mocks.events).toEqual(['designTokens', 'assets', 'trigger'])
  })

  it('writer/start after() no longer imports or calls the draft trigger', () => {
    const source = readFileSync('src/app/api/writer/start/route.ts', 'utf8')

    expect(source).not.toContain('@/lib/artist/draft-trigger')
    expect(source).not.toContain('triggerCharacterDrafts')
  })
})

async function runV2DesignStep(): Promise<unknown> {
  const step = WRITER_STEPS.find((candidate) => candidate.key === 'v2Design')
  if (!step) throw new Error('v2Design step missing')
  return step.run(baseState(), { logger: loggerMock(), projectId: 'project-1' })
}

function loggerMock() {
  return {
    flushRawLlm: vi.fn(async () => undefined),
    markStage: vi.fn(async () => undefined),
  } as never
}

function baseState() {
  return {
    input: { story: 'story' },
    visualIdentity: { format: {}, art_direction: {} },
    actVisualArc: { acts: [] },
    characters: { characters: [] },
    world: { locations: [] },
    scenes: { scenes: [] },
  } as never
}
