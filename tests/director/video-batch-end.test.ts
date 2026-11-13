// 채팅을 접어 둔 Director 에서 영상 일괄이 끝나면 Lumi 알림 카드가 완성 수 · 실패 수와 함께 뜨는지 검사한다 (11/13 시안 D8, 오너 2026-11-14 "추천대로")
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    beginVideoBatch: (total: number) => {
      state.videoBatchBusy = true
      state.videoBatchRunId = crypto.randomUUID()
      state.videoBatchProgress = { done: 0, total, failed: 0 }
    },
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
vi.mock('@/lib/director/video-batch-inputs', () => ({
  buildVideoBatchInputs: (_projectId: string, _nodes: unknown, shotIds: readonly string[]) => ({ items: shotIds.map((shotId) => ({ shotId, request: {} })), skipped: [] }),
}))

import { runVideoBatch } from '@/lib/director/video-batch-client'
import { useLumiNoticeStore } from '@/stores/lumi-notice-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore } from '@/stores/project-store'

const shot = (id: string) => ({ id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', provider: 'seedance' } }) as unknown as DirectorNode

beforeEach(() => {
  Object.assign(mockStore.state, { projectId: 'project-1', nodes: [shot('s1'), shot('s2'), shot('s3')], videoBatchBusy: false, videoBatchProgress: null, videoBatchRunId: null })
  useProjectStore.setState({ projectId: 'project-1', currentStage: 'director' })
  useChatUiStore.setState({ collapsed: true })
  useLumiNoticeStore.setState({ notice: null })
  const batch: VideoBatchSummary = {
    id: 'run-x', projectId: 'project-1', status: 'completed', total: 3, started: 3, failedToStart: 0,
    done: 2, failed: 1, pending: 0, active: 0, stopReason: null,
    jobs: [{ jobId: 'job-1', status: 'completed' }, { jobId: 'job-2', status: 'completed' }, { jobId: 'job-3', status: 'failed' }],
  }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ batch, skipped: [] }), { status: 200 })))
})

describe('영상 일괄이 끝났을 때', () => {
  // 왜: 시안 D8 — 채팅을 접어 둔 채 영상 일괄이 끝나면 오른쪽 아래 카드가 "영상 N개가 완성됐어요"와 실패를 알린다.
  it('채팅을 접어 둔 Director 에서 영상 일괄이 끝나면 Lumi 알림 카드가 완성 수 · 실패 수와 함께 뜬다', async () => {
    await runVideoBatch('project-1', { silent: true })
    expect(useLumiNoticeStore.getState().notice).toEqual({ projectId: 'project-1', kind: 'video', done: 2, failed: 1 })
  })
})
