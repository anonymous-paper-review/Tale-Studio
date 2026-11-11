// Writer 실행이 도는 중이면 다시 깨우기 · 늦은 호출이 같은 단계를 또 돌리지 않고, 정말 끊긴 실행은 마지막 저장 330초 뒤에 다시 잇는다(T5 2026-11-11)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  activeRun: vi.fn(),
  saveRunState: vi.fn(),
  markFailed: vi.fn(),
  dramaturgy: vi.fn(),
  fetch: vi.fn(),
  after: vi.fn(),
  scheduled: [] as unknown[],
  watchdogRows: [] as Array<{ project_id: string; updated_at: string }>,
}))

vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: m.after }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => ({ id: 'u1' }) }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: async () => true, getGenerationJobById: async () => null, STALE_QUEUED_MS: 3_600_000 }))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: async (job: unknown) => job }))
// 크론 watchdog 의 writer_runs 조회 — 라우트가 건넨 updated_at 기준(lt)으로 거른 행만 돌려준다.
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let cutoff: string | undefined
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        lt: (column: string, value: string) => {
          if (column === 'updated_at') cutoff = value
          return query
        },
        then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: table === 'writer_runs' ? m.watchdogRows.filter((r) => !cutoff || r.updated_at < cutoff) : [], error: null }),
      }
      return query
    },
  },
}))
vi.mock('@/lib/writer/run-store', () => ({
  getActiveRun: m.activeRun,
  saveRunState: m.saveRunState,
  markFailed: m.markFailed,
  markCompleted: vi.fn(),
  markAwaiting: vi.fn(),
  advanceProjectStageAfterWriter: vi.fn(),
  resumeFailedRun: vi.fn(),
  listStalledRunningProjects: vi.fn(),
}))
vi.mock('@/lib/writer/debug-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/writer/debug-events')>()),
  recordWriterObservabilityEvent: vi.fn(async () => undefined),
}))
vi.mock('@/lib/writer/logger', () => ({
  PipelineLogger: class PipelineLogger {
    async init() {}
    async flushRawLlm() {}
    async markStage() {}
    async saveLlmCall() {}
    async saveStage() {}
  },
  makeProjectId: () => 'p',
}))
vi.mock('@/lib/writer/pipeline/stages/s0_dramaturgy', () => ({ runDramaturgySafe: m.dramaturgy }))
vi.mock('@/lib/writer/pipeline/stages/s1_structure', () => ({ runNarrativeStructure: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1s3_merged', () => ({ runStructureScenesMerged: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', () => ({ runScenes: vi.fn(), mergeOpenCast: vi.fn(), mergeOpenWorld: vi.fn(), normalizeSceneLocations: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/c_validation_1', () => ({ runStoryCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v0_visual', () => ({ runVisualIdentity: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v1_act_arc', () => ({ runActVisualArc: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v2_design', () => ({ runV2Design: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v3_scene_plan', () => ({ runSceneCinematography: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/decoupage', () => ({ runDecoupage: vi.fn(), runtimeFitCap: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v4_shots', () => ({ runShotDesign: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/c_application_2', () => ({ runShotCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v5_prompts', () => ({ runRenderPrompts: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/dialogue', () => ({ runDialogue: vi.fn(), toDialogueTrack: vi.fn() }))
vi.mock('@/lib/writer/pipeline/util/infer_v3', () => ({ inferSceneCinematographyFromShots: vi.fn(() => []) }))
vi.mock('@/lib/writer/pipeline/util/persist_design_tokens', () => ({ persistDesignTokens: vi.fn() }))
vi.mock('@/lib/writer/pipeline/util/persist_manifest', () => ({ persistAssetsToDb: vi.fn(), persistShotsToDb: vi.fn(), persistSceneStagesToDb: vi.fn(), persistSceneLedgersToDb: vi.fn() }))
vi.mock('@/lib/writer/pipeline', () => ({
  resolveModels: vi.fn(() => ({ S: { provider: 'mock' }, V: { provider: 'mock' }, C: { provider: 'mock' } })),
  resolveSkip: vi.fn(() => ({ validation1: false })),
  emptyC1Report: vi.fn(() => ({})),
}))
vi.mock('@/lib/writer/llm/raw_collector', () => ({
  getPendingRawCalls: vi.fn(() => []),
  getUsageTotals: vi.fn(() => ({ calls: 0, inputTokens: 0, outputTokens: 0, inputChars: 0, outputChars: 0, rateLimitHits: 0 })),
}))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: vi.fn() }))

import { NextRequest } from 'next/server'
import { POST as resumePost } from '@/app/api/writer/resume/route'
import { POST as stepPost } from '@/app/api/writer/step/route'
import { GET as watchdogGet } from '@/app/api/writer/watchdog/route'
import { runWriterSteps } from '@/lib/writer/pipeline/steps'

const T0 = Date.parse('2026-11-11T11:00:00Z')
const iso = (agoMs: number) => new Date(Date.now() - agoMs).toISOString()
/** 도는 중(running)인 실행 — 마지막 저장이 agoMs 전. attempt 는 지금 단계(드라마투르그)에 들어간 횟수. */
const run = (agoMs: number, attempt?: number) => ({
  id: 'run-1',
  project_id: 'p1',
  status: 'running',
  current_stage: 'dramaturgy',
  completed_units: 0,
  state_version: 5,
  updated_at: iso(agoMs),
  state: { input: { story: 's' }, genre: {}, characters: { characters: [] }, ...(attempt ? { _attempt: { stage: 'dramaturgy', count: attempt } } : {}) },
})
const json = { 'Content-Type': 'application/json' }
const resume = async () => (await (await resumePost(new NextRequest('http://localhost/api/writer/resume', { method: 'POST', body: JSON.stringify({ projectId: 'p1' }), headers: json }))).json()).data
const step = () => stepPost(new NextRequest('http://localhost/api/writer/step', { method: 'POST', body: JSON.stringify({ projectId: 'p1' }), headers: json }))
const watchdog = () => watchdogGet(new NextRequest('http://localhost/api/writer/watchdog'))
/** 다음 단계 호출(/api/writer/step)을 띄운 프로젝트 — 띄운 차례대로. */
const stepCalls = async () => {
  await Promise.all(m.scheduled)
  return m.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/writer/step')).map(([, init]) => JSON.parse(String((init as RequestInit).body)).projectId)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  vi.stubEnv('WRITER_STEP_SECRET', '')
  vi.stubEnv('CRON_SECRET', '')
  for (const fn of [m.activeRun, m.saveRunState, m.markFailed, m.dramaturgy, m.fetch, m.after]) fn.mockReset()
  m.scheduled = []
  m.watchdogRows = []
  m.saveRunState.mockResolvedValue(6)
  m.dramaturgy.mockResolvedValue({ diagnosis: 'd' })
  m.fetch.mockImplementation(async () => new Response('{}'))
  m.after.mockImplementation((task: () => Promise<void>) => {
    m.scheduled.push(task())
  })
  vi.stubGlobal('fetch', m.fetch)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('한 Writer 실행은 한 호출만 잇는다', () => {
  // 왜: 한 단계 호출은 저장 없이 300초(서버 한도)까지 정상으로 돈다. 그 안에 깨우면 같은 단계를 두 호출이 같이 돌려 같은 AI 점검을
  //   두세 번 사고, 결과가 늦게 끝난 쪽으로 바뀐다(T5: 화면이 마지막 저장 180초에 깨워 묶음 3 · 4 를 다시 불렀다).
  it('Writer 가 단계를 만드는 중이면(마지막 저장 뒤 330초 안), 화면이나 이어서 버튼이 다시 깨워도 같은 단계를 또 돌리지 않는다', async () => {
    m.activeRun.mockResolvedValue(run(180_000))
    expect(await resume()).toEqual({ action: 'running' })
    expect(await stepCalls()).toEqual([])
  })

  // 왜: 실행을 이어받은 호출이 이미 실행을 잇고 있다 — 늦은 쪽이 또 띄우면 호출이 꼬리를 문다(T5: 저장에서 진 호출이 띄운 호출이
  //   묶음 3 을 세 번째로 불렀다).
  it('다른 호출이 먼저 저장해 실행을 이어받았으면, 늦은 호출은 다음 단계 호출을 띄우지 않고 물러난다', async () => {
    m.activeRun.mockResolvedValue(run(1_000))
    m.saveRunState.mockResolvedValueOnce(6).mockResolvedValueOnce(null) // 일을 마치고 저장하려는데 다른 호출이 먼저 저장했다
    await step()
    expect(m.dramaturgy).toHaveBeenCalledTimes(1)
    m.saveRunState.mockResolvedValueOnce(null) // 단계 시작 표시부터 다른 호출에 졌다
    await step()
    expect(m.dramaturgy).toHaveBeenCalledTimes(1)
    expect(m.markFailed).not.toHaveBeenCalled()
    expect(await stepCalls()).toEqual([])
  })

  // 왜: 기다리는 호출이 곧바로 다음 호출을 띄우면, 앞 호출이 저장할 때까지 호출이 쉬지 않고 되풀이된다(운영에서는 호출마다 서버 비용).
  it('같은 단계 시도가 세 번 다 찼는데 앞 호출이 아직 돌 수 있어 기다리는 호출은, 다음 단계 호출을 띄우지 않고 물러난다', async () => {
    m.activeRun.mockResolvedValue(run(100_000, 3))
    await step()
    expect(m.dramaturgy).not.toHaveBeenCalled()
    expect(m.markFailed).not.toHaveBeenCalled()
    expect(await stepCalls()).toEqual([])
  })

  // 왜: 운영 크론(매일 03:00 UTC) 기준이 180초라, 그 순간 길게 도는 단계가 있으면 화면 깨우기와 같은 일이 난다.
  it('하루 한 번 도는 서버 점검도 마지막 저장 뒤 330초가 안 된 실행은 다시 깨우지 않는다', async () => {
    m.watchdogRows = [
      { project_id: 'p-alive', updated_at: iso(200_000) },
      { project_id: 'p-dead', updated_at: iso(400_000) },
    ]
    await watchdog()
    expect(await stepCalls()).toEqual(['p-dead'])
  })

  // 왜: 정상 경로 고정 — 정말 끊긴 실행(다음 호출 띄우기가 사라진 경우)은 지금처럼 화면 · 이어서 버튼으로 다시 잇는다.
  it('마지막 저장 뒤 330초가 지난 실행은 다시 깨우면 다음 단계 호출을 띄운다', async () => {
    m.activeRun.mockResolvedValue(run(340_000))
    expect(await resume()).toEqual({ action: 'kicked' })
    expect(await stepCalls()).toEqual(['p1'])
  })

  // 왜: 기다리는 호출이 물러나고(3번) 깨우기가 330초를 기다리면(1번), 앞 호출이 정말 죽었을 때 실행이 running 에 갇힐 수 있다 —
  //   330초가 지나면 깨우기로 단계가 다시 돌고, 시도가 다 찬 단계는 실패로 알려 이어서 버튼으로 다시 시작하게 한다(리드 2026-11-11).
  it('앞 호출이 죽어 330초가 지나면 다시 깨우기로 실행이 이어지고, 시도가 세 번 다 찬 단계도 기다림에 갇히지 않고 실패로 알린다', async () => {
    const deadSince = (attempt: number) => ({ ...run(0, attempt), updated_at: new Date(T0).toISOString() }) // T0 에 단계 시작을 적고 죽었다
    m.activeRun.mockResolvedValue(deadSince(1))
    vi.setSystemTime(T0 + 100_000)
    expect(await resume()).toEqual({ action: 'running' })
    vi.setSystemTime(T0 + 340_000)
    expect(await resume()).toEqual({ action: 'kicked' })
    expect(await stepCalls()).toEqual(['p1'])
    expect(await runWriterSteps('p1', { deadlineMs: Date.now() - 1 })).toEqual({ paused: true }) // 깨운 호출이 단계를 다시 돈다
    expect(m.dramaturgy).toHaveBeenCalledTimes(1)

    m.activeRun.mockResolvedValue(deadSince(3))
    vi.setSystemTime(T0 + 100_000)
    await runWriterSteps('p1', { deadlineMs: Date.now() + 240_000 })
    expect(m.markFailed).not.toHaveBeenCalled()
    vi.setSystemTime(T0 + 340_000)
    expect(await runWriterSteps('p1', { deadlineMs: Date.now() + 240_000 })).toEqual({ failed: true })
    expect(m.markFailed).toHaveBeenCalledTimes(1)
    expect(m.dramaturgy).toHaveBeenCalledTimes(1)
  })
})
