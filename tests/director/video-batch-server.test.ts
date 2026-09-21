// 일괄 시작은 서버에 한 번만 목록을 고정하고, 화면 복귀는 서버 GET으로 진행 상태를 되읽는다 (#batch-resume, 2026-09-09)
//
//   오너가 승인한 "브라우저 루프를 서버로 이동" 전환의 클라이언트 계약만 먼저 고정한다.
//   POST /api/director/video-batches 는 { batchId: store.videoBatchRunId, projectId, items }를
//   한 번만 보내 그 순간 고른 샷 목록을 서버에 고정하고, 그 뒤로는 브라우저가 다시 제출하지
//   않는다(서버가 이어간다). 화면을 나갔다 돌아오면 restoreVideoBatch(projectId)가
//   GET ?projectId=&batchId= 로 진행 상태를 읽어 busy/progress 를 복원한다.
//
//   runVideoBatch/restoreVideoBatch 는 아직 구현되지 않았다 — 이 테스트는 의도한 빨강이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

const mockStore = vi.hoisted(() => {
  const state = {
    projectId: 'project-1',
    nodes: [] as DirectorNode[],
    videoBatchBusy: false,
    videoBatchProgress: null as { done: number; total: number; failed: number } | null,
    videoBatchCancelled: false,
    videoBatchRunId: null as string | null,
    beginVideoBatch: vi.fn((total: number) => {
      state.videoBatchBusy = true
      state.videoBatchCancelled = false
      state.videoBatchRunId = 'run-fixed-1'
      state.videoBatchProgress = { done: 0, total, failed: 0 }
    }),
    cancelVideoBatch: vi.fn(),
    generateVideoForShot: vi.fn(),
    hydrateFromDb: vi.fn(),
  }
  const setState = vi.fn((patch: Record<string, unknown>) => {
    Object.assign(state, patch)
  })
  return { state, setState }
})

vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: {
    getState: () => mockStore.state,
    setState: mockStore.setState,
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))
const effects = vi.hoisted(() => ({ notify: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/lib/generation-notify', () => ({ notifyBatchSummary: effects.notify }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: effects.invalidate }))

// buildVideoBatchInputs 는 별도로 계약이 확정된 순수 함수다 — 여기서는 결과를 고정해 서버
// 계약(POST body)만 검증한다.
const fixedItems = [
  { shotId: 'writer-shot-1', request: { projectId: 'project-1', shotId: 'shot-1' } },
  { shotId: 'writer-shot-2', request: { projectId: 'project-1', shotId: 'shot-2' } },
]
vi.mock('@/lib/director/video-batch-inputs', () => ({
  buildVideoBatchInputs: vi.fn(() => ({ items: fixedItems, skipped: [] })),
}))

import { runVideoBatch, restoreVideoBatch } from '@/lib/director/video-batch-client'

function node(id: string, data: Record<string, unknown>): DirectorNode {
  return { id, type: String(data.kind), position: { x: 0, y: 0 }, data } as unknown as DirectorNode
}
const shot = (id: string) => node(id, { kind: 'shot' })

function runningSummary(overrides: Partial<VideoBatchSummary> = {}): VideoBatchSummary {
  return {
    id: 'run-fixed-1',
    projectId: 'project-1',
    status: 'running',
    total: 2,
    started: (overrides.done ?? 0) + (overrides.active ?? 0),
    failedToStart: overrides.failed ?? 0,
    done: 0,
    failed: 0,
    pending: 2,
    active: 0,
    stopReason: null,
    jobs: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mockStore.state.projectId = 'project-1'
  mockStore.state.nodes = [shot('shot-1'), shot('shot-2')]
  mockStore.state.videoBatchBusy = false
  mockStore.state.videoBatchProgress = null
  mockStore.state.videoBatchRunId = null
  mockStore.state.videoBatchCancelled = false
  mockStore.state.generateVideoForShot.mockReset()
  mockStore.state.hydrateFromDb.mockReset().mockResolvedValue(undefined)
  effects.invalidate.mockReset().mockResolvedValue(undefined)
  effects.notify.mockClear()
  mockStore.setState.mockClear()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('POST는 시작 순간 고른 목록을 한 번만 고정한다', () => {
  it('일괄을 시작하면 그 순간 고른 목록을 담아 /api/director/video-batches 에 정확히 한 번만 POST 한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ batch: runningSummary({ status: 'completed', done: 2, pending: 0 }), skipped: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await runVideoBatch('project-1', { silent: true })

    const postCalls = fetchMock.mock.calls.filter(
      ([url, init]) => url === '/api/director/video-batches' && (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(postCalls).toHaveLength(1)
    expect(mockStore.state.generateVideoForShot).not.toHaveBeenCalled()
    const body = JSON.parse((postCalls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({
      batchId: 'run-fixed-1',
      projectId: 'project-1',
      items: fixedItems,
    })
  })
})

describe('restoreVideoBatch — 화면 복귀는 서버 GET으로 진행 상태를 되읽는다', () => {
  it('돌고 있는 일괄이 있으면 GET으로 읽어 busy/progress를 복원한다', async () => {
    const summary = runningSummary({ done: 1, failed: 0, pending: 0, active: 1 })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ batches: [summary] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await restoreVideoBatch('project-1')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('/api/director/video-batches?projectId=project-1')
    expect((init as RequestInit | undefined)?.method ?? 'GET').toBe('GET')
    expect(mockStore.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        videoBatchBusy: true,
        videoBatchRunId: summary.id,
        videoBatchProgress: { done: summary.done, total: summary.total, failed: summary.failed },
      }),
    )
  })

  it('복귀 조회가 늦게 와도 그 사이 끝난 새 일괄을 덮지 않는다', async () => {
    let deliver!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { deliver = resolve })))
    const restoring = restoreVideoBatch('project-1')
    mockStore.state.videoBatchRunId = 'newer-completed-run'
    mockStore.state.videoBatchBusy = false
    deliver(Response.json({ batches: [runningSummary()] }))
    await restoring
    expect(mockStore.state.videoBatchRunId).toBe('newer-completed-run')
    expect(mockStore.state.videoBatchBusy).toBe(false)
  })
})

describe('조회 장애와 중단의 실제 진행 표시', () => {
  it('진행 조회가 잠깐 실패해도 끝났다고 표시하거나 영상을 다시 제출하지 않는다', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ batch: runningSummary(), skipped: [] }))
      .mockResolvedValueOnce(Response.json({ error: 'temporary outage' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ batches: [runningSummary({ status: 'completed', done: 2, pending: 0 })] }))
    vi.stubGlobal('fetch', fetchMock)
    const running = runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(2500)
    expect(mockStore.state.videoBatchBusy).toBe(true)
    expect(effects.notify).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2500)
    await running
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(mockStore.state.videoBatchBusy).toBe(false)
  })

  it('중단해서 내지 않은 샷을 생성 실패로 세지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      batch: runningSummary({ status: 'cancelled' }), skipped: [],
    })))
    await expect(runVideoBatch('project-1', { silent: true })).resolves.toEqual({ total: 2, started: 0, failed: 0 })
  })

  it('서로 다른 영상이 차례로 끝나면 각각 화면에 반영하고 같은 완료를 중복 전달하지 않는다', async () => {
    const observer = vi.fn()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({
        batch: runningSummary({ done: 1, pending: 0, active: 1, jobs: [
          { jobId: 'job-1', status: 'completed' }, { jobId: 'job-2', status: 'queued' },
        ] }), skipped: [],
      }))
      .mockResolvedValueOnce(Response.json({ batches: [
        runningSummary({ status: 'completed', done: 2, pending: 0, jobs: [
          { jobId: 'job-1', status: 'completed' }, { jobId: 'job-2', status: 'completed' },
        ] }),
      ] })))
    const running = runVideoBatch('project-1', { silent: true, onJob: observer })
    await vi.advanceTimersByTimeAsync(2500)
    await running
    expect(mockStore.state.hydrateFromDb).toHaveBeenCalledTimes(2)
    expect(observer.mock.calls.filter(([receipt]) => receipt.jobId === 'job-1')).toHaveLength(1)
  })
})
