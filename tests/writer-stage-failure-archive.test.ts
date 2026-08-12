// 문제 1 회귀 방지(#llm-archive-failure 2026-08-12): 스테이지가 죽으면 그 단계의 LLM 호출이
//   llm_calls 에 한 건도 안 남던 사고. 원인은 두 겹 — (a) 실패 경로에 flush 자체가 없었고,
//   (b) captureErrorDetail 이 읽는 getPendingRawCalls() 가 구조적으로 항상 비어 있었다
//   (플러시가 컬렉터를 비우는데 순서가 안 맞으면 error_detail 도 llm_calls 도 둘 다 빈다).
//
// 이 테스트는 raw_collector/logger/archive-calls 는 실물을 쓰고(순서 버그가 실제로 재현되게),
// DB(supabaseAdmin)와 run-store/각 스테이지 러너만 목으로 대체한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: dbMocks.from } }))

const runStoreMocks = vi.hoisted(() => ({
  getActiveRun: vi.fn(),
  saveRunState: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  markAwaiting: vi.fn(),
  advanceProjectStageAfterWriter: vi.fn(),
}))
vi.mock('@/lib/writer/run-store', () => runStoreMocks)

const dramaturgyMocks = vi.hoisted(() => ({ runDramaturgySafe: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s0_dramaturgy', () => ({ runDramaturgySafe: dramaturgyMocks.runDramaturgySafe }))

// steps.ts 가 모듈 최상단에서 로드하는 나머지 스테이지/유틸 — 이 시나리오(첫 step 인 dramaturgy
// 에서 즉시 실패)에선 실행되지 않지만 import 자체는 되므로 부작용 없는 목으로 채운다.
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
vi.mock('@/lib/writer/pipeline/stages/v4_shots', () => ({ runShotDesign: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/c_application_2', () => ({ runShotCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v5_prompts', () => ({ runRenderPrompts: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/dialogue', () => ({ runDialogue: vi.fn(), toDialogueTrack: vi.fn() }))
vi.mock('@/lib/writer/pipeline/util/infer_v3', () => ({ inferSceneCinematographyFromShots: vi.fn(() => []) }))
vi.mock('@/lib/writer/pipeline/util/persist_design_tokens', () => ({ persistDesignTokens: vi.fn() }))
vi.mock('@/lib/writer/pipeline/util/persist_manifest', () => ({ persistAssetsToDb: vi.fn(), persistShotsToDb: vi.fn() }))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: vi.fn() }))
vi.mock('@/lib/writer/types/pipeline', () => ({ isCompactDepth: vi.fn(() => false) }))
vi.mock('@/lib/writer/pipeline/validators/action_budget', () => ({ analyzeSceneActionBudget: vi.fn(() => ({ issues: [] })) }))
vi.mock('@/lib/writer/pipeline', () => ({
  resolveModels: vi.fn(() => ({ S: { provider: 'mock' }, V: { provider: 'mock' }, C: { provider: 'mock' } })),
  resolveSkip: vi.fn(() => ({ validation1: false })),
  emptyC1Report: vi.fn(() => ({})),
}))

// ⚠️ '@/lib/writer/logger' 와 '@/lib/writer/llm/raw_collector' 는 목으로 대체하지 않는다 —
//   이 두 실물의 실제 순서(플러시가 컬렉터를 비움)가 재현돼야 회귀를 잡을 수 있다.
import { runWriterSteps } from '@/lib/writer/pipeline/steps'
import { recordRawCall, resetRawSeq } from '@/lib/writer/llm/raw_collector'

const PROJECT_ID = '9d6efa6d-3216-40b0-8a2c-184ab56f02ec'
const RUN_ID = '11111111-2222-3333-4444-555555555555'

beforeEach(() => {
  dbMocks.insert.mockReset().mockResolvedValue({ error: null })
  dbMocks.from.mockReset().mockReturnValue({ insert: dbMocks.insert })
  for (const m of Object.values(runStoreMocks)) m.mockReset()
  dramaturgyMocks.runDramaturgySafe.mockReset()
  resetRawSeq()
  delete process.env.LLM_ARCHIVE_DISABLED
})

describe('runWriterSteps — 스테이지 실패 시 llm_calls 아카이브(문제 1 회귀)', () => {
  it('dramaturgy 가 LLM 호출 뒤 던지면 그 호출이 llm_calls 에 run_id 와 함께 기록되고, error_detail 에도 남는다', async () => {
    runStoreMocks.getActiveRun.mockResolvedValue({
      id: RUN_ID,
      project_id: PROJECT_ID,
      status: 'running',
      current_stage: null,
      completed_units: 0,
      total_units: 10,
      state: { input: { story: 'test story' }, genre: {}, characters: { characters: [] } },
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      state_version: 0,
    })
    runStoreMocks.saveRunState.mockResolvedValue(1) // 진입 체크포인트 성공 → step.run 진행

    // 스테이지가 LLM 호출을 하나 기록한 뒤(raw_collector 실물에 쌓임) 실패한다 —
    // 성공 경로의 flushRawLlm('dramaturgy') 는 이 throw 때문에 한 번도 불리지 않는다.
    dramaturgyMocks.runDramaturgySafe.mockImplementation(async () => {
      recordRawCall({
        timestamp: '2026-08-12T00:00:00.000Z',
        provider: 'gemini',
        model: 'gemini-3-flash',
        systemInstruction: 'you are a dramaturg',
        prompt: 'diagnose the draft',
        response: '',
        duration_ms: 500,
        input_chars: 10,
        output_chars: 0,
        error: 'upstream 500',
      })
      throw new Error('dramaturgy blew up')
    })

    const result = await runWriterSteps(PROJECT_ID, { deadlineMs: Date.now() + 60_000 })

    expect(result).toEqual({ failed: true })

    // ① error_detail 채널 — captureErrorDetail 이 flush 전에 pending 을 읽었다는 증거.
    expect(runStoreMocks.markFailed).toHaveBeenCalledTimes(1)
    const [failedRunId, failedMessage, detail] = runStoreMocks.markFailed.mock.calls[0]
    expect(failedRunId).toBe(RUN_ID)
    expect(failedMessage).toBe('dramaturgy blew up')
    expect(detail.calls).toHaveLength(1)
    expect(detail.calls[0]).toMatchObject({ provider: 'gemini', prompt: 'diagnose the draft', error: 'upstream 500' })

    // ② llm_calls 아카이브 채널 — 같은 호출이 DB 에도 갔고 run_id 가 실렸다(문제 2 배선 확인 겸함).
    expect(dbMocks.from).toHaveBeenCalledWith('llm_calls')
    expect(dbMocks.insert).toHaveBeenCalledTimes(1)
    const [rows] = dbMocks.insert.mock.calls[0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      project_id: PROJECT_ID,
      run_id: RUN_ID,
      stage: 'dramaturgy_failed',
      prompt: 'diagnose the draft',
      error: 'upstream 500',
    })
  })
})
