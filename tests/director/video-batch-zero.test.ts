// 영상 일괄 러너는 낼 샷이 하나도 없으면 묶음 표시(진행 · 묶음 id)를 달지 않고 서버에도 묻지 않는지 검사한다 (재검토 b 낮음 1)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'

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
      state.videoBatchRunId = crypto.randomUUID()
      state.videoBatchProgress = { done: 0, total, failed: 0 }
    }),
    hydrateFromDb: async () => {},
  }
  return { state, setState: (patch: Record<string, unknown>) => { Object.assign(state, patch) } }
})
vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: { getState: () => mockStore.state, setState: mockStore.setState },
}))
vi.mock('@/lib/generation-notify', () => ({ notifyBatchSummary: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { runVideoBatch } from '@/lib/director/video-batch-client'

const shot = (id: string) => ({ id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', provider: 'seedance', writerShotId: `w-${id}` } }) as unknown as DirectorNode
const doneTake = (id: string, parent: string) =>
  ({ id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', parentShotNodeId: parent, status: 'completed', videoUrl: 'https://media.test/v.mp4' } }) as unknown as DirectorNode
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(mockStore.state, { projectId: 'project-1', nodes: [shot('s1'), doneTake('v1', 's1')], videoBatchBusy: false, videoBatchProgress: null, videoBatchRunId: null })
  vi.stubGlobal('fetch', fetchMock)
})

describe('낼 샷이 없는 영상 일괄', () => {
  // 왜: 재검토 b 낮음 1 — 묶어 둔 샷이 그사이 다른 길로 만들어지면 0개로 불리는데 묶음 표시를 달아, 채팅이 "시작했어요"로 읽었다.
  it('영상 일괄 러너는 낼 샷이 없으면 묶음 표시를 달지 않고 서버에도 묻지 않는다', async () => {
    const result = await runVideoBatch('project-1', { shotIds: ['s1'] })
    expect(result).toEqual({ total: 0, started: 0, failed: 0 })
    expect(mockStore.state.beginVideoBatch).not.toHaveBeenCalled()
    expect(mockStore.state.videoBatchRunId).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
