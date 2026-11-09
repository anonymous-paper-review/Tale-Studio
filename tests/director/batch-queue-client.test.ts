// 영상 묶음이 도는 동안 화면이 지금 만드는 작업과 다음 차례를 받아 두고, 새로 낸 영상은 바로 다시 읽어 보인다 (11/5 시안 DG, 리드 2026-11-09)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

const mockStore = vi.hoisted(() => {
  const state = {
    projectId: 'project-1',
    nodes: [] as DirectorNode[],
    videoBatchBusy: false,
    videoBatchProgress: null as { done: number; total: number; failed: number } | null,
    videoBatchQueue: null as { jobIds: string[]; pendingShotIds: string[] } | null,
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
  useDirectorCanvasStore: { getState: () => mockStore.state, setState: mockStore.setState },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
const effects = vi.hoisted(() => ({ notify: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/lib/generation-notify', () => ({ notifyBatchSummary: effects.notify }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: effects.invalidate }))
const fixedItems = [
  { shotId: 'writer-shot-1', request: { projectId: 'project-1', shotId: 'shot-1' } },
  { shotId: 'writer-shot-2', request: { projectId: 'project-1', shotId: 'shot-2' } },
  { shotId: 'writer-shot-3', request: { projectId: 'project-1', shotId: 'shot-3' } },
]
vi.mock('@/lib/director/video-batch-inputs', () => ({
  buildVideoBatchInputs: vi.fn(() => ({ items: fixedItems, skipped: [] })),
}))

import { runVideoBatch } from '@/lib/director/video-batch-client'

const shot = (id: string) => ({ id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot' } }) as unknown as DirectorNode

function summary(overrides: Partial<VideoBatchSummary> = {}): VideoBatchSummary {
  return {
    id: 'run-fixed-1', projectId: 'project-1', status: 'running', total: 3, started: 0, failedToStart: 0,
    done: 0, failed: 0, pending: 3, active: 0, stopReason: null, jobs: [],
    pendingShotIds: ['writer-shot-1', 'writer-shot-2', 'writer-shot-3'],
    ...overrides,
  }
}
const firstRound = () => summary({
  started: 1, pending: 2, active: 1, jobs: [{ jobId: 'job-1', status: 'queued' }],
  pendingShotIds: ['writer-shot-2', 'writer-shot-3'],
})
const finished = () => summary({
  status: 'completed', started: 3, done: 3, pending: 0, active: 0, pendingShotIds: [],
  jobs: [{ jobId: 'job-1', status: 'completed' }, { jobId: 'job-2', status: 'completed' }, { jobId: 'job-3', status: 'completed' }],
})

beforeEach(() => {
  vi.useFakeTimers()
  mockStore.state.projectId = 'project-1'
  mockStore.state.nodes = [shot('shot-1'), shot('shot-2'), shot('shot-3')]
  mockStore.state.videoBatchBusy = false
  mockStore.state.videoBatchProgress = null
  mockStore.state.videoBatchQueue = null
  mockStore.state.videoBatchRunId = null
  mockStore.state.videoBatchCancelled = false
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

describe('혼자 정한 것', () => {
  // 왜: 예전에는 묶음의 영상이 하나 끝나야 화면이 다시 읽어서, 묶음을 시작하고 처음 몇 분 동안 만드는 영상 노드(기다리는 카드)가 캔버스에 안 보였다.
  it('묶음이 영상을 새로 내면 화면이 그 영상을 바로 다시 읽어 만드는 중으로 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ batch: summary(), skipped: [] }))
      .mockResolvedValueOnce(Response.json({ batches: [firstRound()] }))
      .mockResolvedValueOnce(Response.json({ batches: [finished()] })))
    const running = runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(mockStore.state.hydrateFromDb).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2500)
    expect(mockStore.state.hydrateFromDb).toHaveBeenCalledWith('project-1')

    await vi.advanceTimersByTimeAsync(2500)
    await running
  })

  // 왜: 기다리는 카드의 막대 · 다음 차례와 샷 꼬리의 "순서 기다리는 중"은 이 두 가지로 그린다(리드 b3 · b4 · b7).
  it('묶음이 도는 동안 화면은 지금 만드는 작업과 아직 안 낸 샷의 순서를 받아 둔다', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ batch: summary(), skipped: [] }))
      .mockResolvedValueOnce(Response.json({ batches: [firstRound()] }))
      .mockResolvedValueOnce(Response.json({ batches: [finished()] })))
    const running = runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(2500)

    expect(mockStore.state.videoBatchQueue).toEqual({ jobIds: ['job-1'], pendingShotIds: ['writer-shot-2', 'writer-shot-3'] })

    await vi.advanceTimersByTimeAsync(2500)
    await running
  })

  // 왜: 멈춘 뒤 남은 샷은 만들지 않는다. 계속 차례를 기다리는 것처럼 보이면 안 된다.
  it('묶음을 멈추면 남은 샷의 순서 기다리는 중과 다음 차례를 지운다', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ batch: summary(), skipped: [] }))
      .mockResolvedValueOnce(Response.json({ batches: [{ ...firstRound(), status: 'cancelled' }] }))
      .mockResolvedValueOnce(Response.json({ batches: [{ ...finished(), status: 'cancelled' }] })))
    const running = runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(2500)

    expect(mockStore.state.videoBatchQueue?.pendingShotIds).toEqual([])

    await vi.advanceTimersByTimeAsync(2500)
    await running
  })

  // 왜: 정상 경로 고정. 묶음이 끝나면 받아 둔 차례가 남지 않는다(다음 묶음 · 낱개 영상에 섞이지 않게).
  it('묶음이 끝나면 받아 둔 차례를 비운다', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ batch: summary(), skipped: [] }))
      .mockResolvedValueOnce(Response.json({ batches: [firstRound()] }))
      .mockResolvedValueOnce(Response.json({ batches: [finished()] })))
    const running = runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(2500)
    expect(mockStore.state.videoBatchQueue).not.toBeNull()

    await vi.advanceTimersByTimeAsync(2500)
    await running

    expect(mockStore.state.videoBatchQueue).toBeNull()
    expect(mockStore.state.videoBatchBusy).toBe(false)
  })
})
