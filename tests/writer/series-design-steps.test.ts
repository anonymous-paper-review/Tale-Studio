// Writer 실행은 실행에 실린 앞 화 색 설계를 그림 양식 단계에, 씬과 시리즈 정보를 인물 · 배경 디자인 단계에 넘긴다 (2026-10-27 오너 "제품에서 고칠 것")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runVisualIdentity: vi.fn(),
  runV2Design: vi.fn(),
  persistDesignTokens: vi.fn(),
  persistAssetsToDb: vi.fn(),
  triggerAssetDrafts: vi.fn(),
}))

vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class PipelineLogger {}, makeProjectId: vi.fn(() => 'p') }))
vi.mock('@/lib/writer/pipeline/stages/s0_dramaturgy', () => ({ runDramaturgySafe: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1_structure', () => ({ runNarrativeStructure: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1s3_merged', () => ({ runStructureScenesMerged: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', () => ({ runScenes: vi.fn(), mergeOpenCast: vi.fn((c: unknown) => c), mergeOpenWorld: vi.fn((w: unknown) => w) }))
vi.mock('@/lib/writer/pipeline/stages/c_validation_1', () => ({ runStoryCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v0_visual', () => ({ runVisualIdentity: mocks.runVisualIdentity }))
vi.mock('@/lib/writer/pipeline/stages/v1_act_arc', () => ({ runActVisualArc: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v2_design', () => ({ runV2Design: mocks.runV2Design }))
vi.mock('@/lib/writer/pipeline/stages/v3_scene_plan', () => ({ runSceneCinematography: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/decoupage', () => ({ runDecoupage: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v3s_stage', () => ({ runSceneStage: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v4_shots', () => ({ runShotDesign: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/c_application_2', () => ({ runShotCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v5_prompts', () => ({ runRenderPrompts: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/dialogue', () => ({ runDialogue: vi.fn(), toDialogueTrack: vi.fn() }))
vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: vi.fn(),
  describeAxisConfig: () => 'test/model',
  DEFAULT_MODELS: { S: { provider: 'mock' }, V: { provider: 'mock' }, C: { provider: 'mock' } },
}))
vi.mock('@/lib/writer/pipeline/util/infer_v3', () => ({ inferSceneCinematographyFromShots: vi.fn(() => []) }))
vi.mock('@/lib/writer/pipeline/util/persist_design_tokens', () => ({ persistDesignTokens: mocks.persistDesignTokens }))
vi.mock('@/lib/writer/pipeline/util/persist_manifest', () => ({
  persistAssetsToDb: mocks.persistAssetsToDb,
  persistShotsToDb: vi.fn(),
  persistSceneStagesToDb: vi.fn(),
  persistSceneLedgersToDb: vi.fn(),
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
  markAwaiting: vi.fn(),
  advanceProjectStageAfterWriter: vi.fn(),
}))
vi.mock('@/lib/writer/llm/raw_collector', () => ({
  getPendingRawCalls: vi.fn(() => []),
  getUsageTotals: vi.fn(() => ({ calls: 0, inputTokens: 0, outputTokens: 0, inputChars: 0, outputChars: 0, rateLimitHits: 0 })),
}))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: mocks.triggerAssetDrafts }))

import { WRITER_STEPS } from '@/lib/writer/pipeline/steps'

const DESIGN_TOKENS = { l0: { aspect_ratio: '16:9' }, l1: { art_style: 'jp_anime' }, palette: { primary: 'moss' }, color_meaning: {}, vfx_approach: '' }
const series = {
  prevTitle: '남겨진 마법',
  prevProse: '프리렌이 동상을 닦았다.',
  characters: ['페른'],
  locations: ['야영지'],
}
const LOOKS = { characters: [{ name: '페른', appearance: '보라색 머리' }], locations: [] }
const SERIES_INPUT = { series, inheritedLooks: LOOKS, inheritedDesignTokens: DESIGN_TOKENS }
const SCENES = [{ scene_id: 'scene_1', location: 'river_ferry_dock', time_of_day: '새벽' }]
const logger = () => ({ flushRawLlm: vi.fn(async () => undefined), markStage: vi.fn(async () => undefined), saveLlmCall: vi.fn(async () => undefined) }) as never
const step = (key: string) => {
  const found = WRITER_STEPS.find((c) => c.key === key)
  if (!found) throw new Error(`${key} step missing`)
  return found
}
function state(input: Record<string, unknown>) {
  return {
    input: { story: '나루터에서 배를 기다린다.', outputLocale: 'ko', ...input },
    genre: { format: 'horizontal_16:9' },
    characters: { characters: [] },
    narrativeStructure: { acts: [] },
    scenes: { scenes: SCENES },
    world: { locations: [] },
    visualIdentity: { format: {}, style: {} },
    actVisualArc: null,
  } as never
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.runVisualIdentity.mockResolvedValue({ format: {}, style: {} })
  mocks.runV2Design.mockResolvedValue({ characterVisual: { characters: [] }, worldVisual: { locations: [] } })
  mocks.persistDesignTokens.mockResolvedValue(undefined)
  mocks.persistAssetsToDb.mockResolvedValue(undefined)
  mocks.triggerAssetDrafts.mockResolvedValue({ characters: {}, worlds: {} })
})

describe('시리즈 다음 화 Writer 실행의 그림 디자인 단계', () => {
  // 왜: 같이 정한 것 — 실행 입력에 실린 앞 화 색 설계가 그림 양식 단계까지 닿아야 등신 · 선이 1화와 같다.
  it('시리즈 다음 화 실행은 그림 양식 단계에 앞 화 색 설계를 넘긴다', async () => {
    await step('visualFormat').run(state(SERIES_INPUT), { logger: logger(), projectId: 'p1' } as never)
    expect(mocks.runVisualIdentity.mock.calls[0][4]).toEqual(DESIGN_TOKENS)
  })

  // 왜: 같이 정한 것 — 디자인 단계가 씬(시간대 · 날씨)과 앞 화 모습 · 색 설계를 받아야 배경 날씨와 새 인물 세계가 맞는다.
  it('인물 · 배경 디자인 단계에 이번 화 씬과 시리즈 정보를 넘긴다', async () => {
    await step('v2Design').run(state(SERIES_INPUT), { logger: logger(), projectId: 'p1' } as never)
    expect(mocks.runV2Design.mock.calls[0][8]).toEqual({ scenes: SCENES, series, looks: LOOKS, designTokens: DESIGN_TOKENS })
  })

  // 왜: 혼자 정한 것 — 정상 경로 고정. 보통 프로젝트는 그림 양식을 새로 정하고, 디자인 단계에는 씬만 넘긴다.
  it('시리즈가 아닌 실행은 앞 화 색 설계 없이 그림 양식을 정하고 디자인 단계에 씬만 넘긴다', async () => {
    await step('visualFormat').run(state({}), { logger: logger(), projectId: 'p1' } as never)
    await step('v2Design').run(state({}), { logger: logger(), projectId: 'p1' } as never)
    expect(mocks.runVisualIdentity.mock.calls[0][4]).toBeUndefined()
    expect(mocks.runV2Design.mock.calls[0][8]).toEqual({ scenes: SCENES, series: undefined })
  })
})
