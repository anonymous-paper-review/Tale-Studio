// 멈춘 영상 묶음은 이미 낸 영상도 화면에서 멈추고, 뒤에서 아직 돌아도 [영상 만들기]로 새 묶음을 바로 시작한다 (오너 2026-11-14 7번, 리드 S4-2)
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
      state.videoBatchRunId = crypto.randomUUID()
      state.videoBatchProgress = { done: 0, total, failed: 0 }
    }),
    cancelRunningJobs: vi.fn(async (ids: string[]) => ids),
    hydrateFromDb: vi.fn(async () => {}),
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/director/video-batch-inputs', () => ({
  buildVideoBatchInputs: (_projectId: string, _nodes: unknown, shotIds: readonly string[]) => ({
    items: shotIds.map((shotId) => ({ shotId, request: {} })),
    skipped: [],
  }),
}))

import { runVideoBatch } from '@/lib/director/video-batch-client'

const shot = (id: string) => ({ id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot' } }) as unknown as DirectorNode

function summary(overrides: Partial<VideoBatchSummary>): VideoBatchSummary {
  return {
    id: 'run', projectId: 'project-1', status: 'running', total: 1, done: 0, failed: 0, pending: 0, active: 0,
    stopReason: null, jobs: [], started: 0, failedToStart: 0, ...overrides,
  }
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  Object.assign(mockStore.state, {
    projectId: 'project-1', nodes: [shot('shot-1')], videoBatchBusy: false, videoBatchProgress: null,
    videoBatchCancelled: false, videoBatchRunId: null,
  })
  mockStore.state.cancelRunningJobs.mockClear()
  mockStore.state.beginVideoBatch.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('같이 정한 것', () => {
  it('멈춘 영상 묶음이 뒤에서 아직 돌아도 [영상 만들기]는 새 묶음을 바로 시작한다', async () => {
    // 왜: 오너 7번 "유저가 수정해서 다시 생성 요청할 수 있게" — 예전엔 멈춘 묶음의 영상이 fal 에서 끝날 때까지 새 묶음이 시작하지 않았다.
    Object.assign(mockStore.state, { videoBatchBusy: true, videoBatchCancelled: true, videoBatchRunId: 'old-run' })
    const posts: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { batchId: string }
      posts.push(body.batchId)
      return json({ batch: summary({ id: body.batchId, status: 'completed', done: 1, started: 1 }), skipped: [] })
    }))

    await runVideoBatch('project-1', { silent: true })

    expect(posts).toHaveLength(1)
    expect(posts[0]).not.toBe('old-run')
  })

  it('멈추지 않은 영상 묶음이 돌고 있으면 [영상 만들기]는 새 묶음을 시작하지 않는다', async () => {
    // 왜: 정상 경로 고정. 도는 묶음 위에 묶음을 하나 더 세우면 같은 샷을 두 번 낼 수 있다(Take 두 번).
    Object.assign(mockStore.state, { videoBatchBusy: true, videoBatchCancelled: false, videoBatchRunId: 'live-run' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await runVideoBatch('project-1', { silent: true })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('혼자 정한 것', () => {
  it('영상 묶음이 멈췄다고 서버가 알려 오면 그 묶음이 이미 낸 영상도 화면에서 멈춘다', async () => {
    // 왜: [모두 멈추기]와 서버의 다음 영상 내기가 엇갈리면 막 낸 영상은 멈춘 목록에 없다 — 묶음을 멈춘 것은 사람이므로 그 묶음이 낸 것은 모두 멈춘다.
    vi.useFakeTimers()
    let runId = ''
    let gets = 0
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        runId = (JSON.parse(String(init.body)) as { batchId: string }).batchId
        return json({ batch: summary({ id: runId, active: 1, jobs: [{ jobId: 'job-1', status: 'queued', resultUrl: null, error: null }] }), skipped: [] })
      }
      gets += 1
      return gets === 1
        ? json({ batches: [summary({ id: runId, status: 'cancelled', active: 1, jobs: [{ jobId: 'job-1', status: 'queued', resultUrl: null, error: null }] })] })
        : json({ batches: [summary({ id: runId, status: 'cancelled', active: 0, done: 1, jobs: [{ jobId: 'job-1', status: 'completed', resultUrl: 'https://x/1.mp4', error: null }] })] })
    }))

    const run = runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockStore.state.cancelRunningJobs).toHaveBeenCalledWith(['job-1'])
    await vi.advanceTimersByTimeAsync(3000)
    await run
    // 같은 작업은 한 번만 멈춘다.
    expect(mockStore.state.cancelRunningJobs).toHaveBeenCalledTimes(1)
  })
})
