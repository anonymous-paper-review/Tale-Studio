// Writer가 화면 구성을 저장한 뒤에만 이미지 준비를 한 번 요청하고, 실패해도 저장 결과를 지킨다
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

import { WRITER_STEPS, drawDeferredArtistDrafts } from '@/lib/writer/pipeline/steps'

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

describe('Writer 화면 구성 뒤 이미지 초안 요청 시점을 지킨다', () => {
  it('화면 구성과 인물·장소 정보를 모두 저장한 뒤 이미지 초안을 요청한다', async () => {
    const patch = await runV2DesignStep()

    expect(patch).toEqual({ characterVisual: CHARACTER_VISUAL, worldVisual: WORLD_VISUAL })
    expect(mocks.events).toEqual(['designTokens', 'assets', 'trigger'])
    expect(mocks.triggerAssetDrafts).toHaveBeenCalledWith('project-1')
  })

  it('화면 구성을 저장하지 못하면 이후 이미지 준비를 진행하지 않는다', async () => {
    mocks.persistDesignTokens.mockRejectedValueOnce(new Error('persist failed'))

    await expect(runV2DesignStep()).rejects.toThrow('persist failed')
    expect(mocks.persistAssetsToDb).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('이미지 초안 요청이 실패해도 앞서 저장한 화면 구성 결과는 유지한다', async () => {
    mocks.triggerAssetDrafts.mockImplementationOnce(async () => {
      mocks.events.push('trigger')
      throw new Error('trigger failed')
    })

    await expect(runV2DesignStep()).resolves.toEqual({ characterVisual: CHARACTER_VISUAL, worldVisual: WORLD_VISUAL })
    expect(mocks.events).toEqual(['designTokens', 'assets', 'trigger'])
  })

  it('Writer 시작 요청이 끝난 뒤에는 이미지 초안을 중복 요청하지 않는다', () => {
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

// 2026-10-10 오너 "writer 생성 파이프라인과 그림체 분석을 병렬로" — Writer 는 기다리지 않고, 미룬 Artist 그림은 끝날 때 한 번 더 챙긴다.
describe('그림체 분석 때문에 미룬 Artist 그림', () => {
  it('그림체 분석 때문에 Artist 그림을 미뤘으면 Writer 실행에 미뤘다고 적어 두고 기다리지 않고 다음 단계로 간다', async () => {
    // 왜: 분석이 실패해 대기 표시가 남으면 분석 창구가 부를 때 아직 그릴 준비(디자인 토큰)가 안 됐을 수 있다 — Writer 가 끝날 때 챙길 근거다.
    mocks.triggerAssetDrafts.mockImplementationOnce(async () => {
      mocks.events.push('trigger')
      return { deferred_style_analysis: true, characters: { submitted: 0, skipped: 0, failed: 0 }, worlds: { submitted: 0, skipped: 0, failed: 0 } }
    })

    const patch = await runV2DesignStep()

    expect(patch).toEqual({ characterVisual: CHARACTER_VISUAL, worldVisual: WORLD_VISUAL, _artistDeferred: true })
    expect(mocks.events).toEqual(['designTokens', 'assets', 'trigger'])
  })

  it('Writer가 끝날 때 미뤄 둔 Artist 그림이 있으면 그때 그리고, 없으면 다시 부르지 않는다', async () => {
    // 왜: 분석이 Writer 의 Artist 단계보다 먼저 실패했으면 아무도 다시 부르지 않는다 — 끝날 때 한 번 더 챙긴다. 미루지 않았으면 그대로 둔다(자동 재시도 아님).
    await drawDeferredArtistDrafts('project-1', { _artistDeferred: true } as never)
    expect(mocks.triggerAssetDrafts).toHaveBeenCalledWith('project-1', { afterStyleAnalysis: true })
    mocks.triggerAssetDrafts.mockClear()
    await drawDeferredArtistDrafts('project-1', {} as never)
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })
})
