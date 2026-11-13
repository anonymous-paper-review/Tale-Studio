// 멈춘 영상 묶음에 남은 영상이 모두 화면에서 멈춘 것이면, 그 영상들이 생성처에서 끝나기를 기다리지 않고 화면의 묶음이 끝난다 (오너 7번 · 리드 11/14)
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
// 묶음 끝 알림 — 채팅 끝 줄과 (채팅을 접었을 때의) Lumi 알림 카드.
const notices = vi.hoisted(() => ({ line: vi.fn(), card: vi.fn() }))
vi.mock('@/lib/generation-notify', async (original) => ({
  ...await original<typeof import('@/lib/generation-notify')>(),
  notifyBatchSummary: notices.line,
}))
vi.mock('@/stores/lumi-notice-store', () => ({ useLumiNoticeStore: { getState: () => ({ batchEnded: notices.card }) } }))

import { runVideoBatch } from '@/lib/director/video-batch-client'
import { _setGenerationQueueSnapshotForTests } from '@/lib/generation-queue'
import { translate } from '@/lib/i18n/translate'
import { useLocaleStore } from '@/stores/locale-store'

const shot = (id: string) => ({ id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot' } }) as unknown as DirectorNode
function summary(overrides: Partial<VideoBatchSummary>): VideoBatchSummary {
  return {
    id: 'run', projectId: 'project-1', status: 'running', total: 1, done: 0, failed: 0, pending: 0, active: 1,
    stopReason: null, jobs: [{ jobId: 'job-1', status: 'queued', resultUrl: null, error: null }], started: 1, failedToStart: 0, ...overrides,
  }
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  Object.assign(mockStore.state, {
    projectId: 'project-1', nodes: [shot('shot-1')], videoBatchBusy: false, videoBatchProgress: null,
    videoBatchCancelled: false, videoBatchRunId: null,
  })
  mockStore.state.cancelRunningJobs.mockClear()
  notices.line.mockClear()
  notices.card.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  _setGenerationQueueSnapshotForTests({ projectId: '', jobs: [] })
})

/** 서버가 닫은 묶음 — 멈춘 영상(job-1)은 생성처에서 아직 돈다. 조회는 늘 같은 답. */
function closedBatchServer(closed: Partial<VideoBatchSummary>) {
  let runId = ''
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      runId = (JSON.parse(String(init.body)) as { batchId: string }).batchId
      return json({ batch: summary({ id: runId, total: closed.total ?? 1 }), skipped: [] })
    }
    return json({ batches: [summary({ id: runId, status: 'cancelled', ...closed })] })
  }))
}

describe('같이 정한 것', () => {
  it('영상 묶음이 멈춘 영상만으로 끝나면 끝 줄("영상 0개 완료, 0개 실패")을 띄우지 않는다 — 멈춤 알림이 이미 떴다', async () => {
    // 왜: 리드 11/14 — 하나뿐인 묶음 영상을 멈추면 "영상 0개 완료, 0개 실패"가 떴다. 멈춘 것은 이미 멈춤 알림으로 알렸다.
    vi.useFakeTimers()
    _setGenerationQueueSnapshotForTests({ projectId: 'project-1', jobs: [{ id: 'job-1', kind: 'shot_video', target: {}, cancelledAt: '2026-11-14T03:00:00Z' }] })
    closedBatchServer({})

    void runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(3000)

    expect(mockStore.state.videoBatchBusy).toBe(false)
    expect(notices.line).not.toHaveBeenCalled()
    expect(notices.card).not.toHaveBeenCalled()
  })

  it('멈춘 영상 말고 완료 · 실패가 하나라도 있으면 끝 줄은 지금처럼 뜨고, 멈춘 영상은 세지 않는다', async () => {
    // 왜: 정상 경로 고정 — 만든 영상 · 실패한 영상은 알린다. 멈춘 영상은 만든 것도 실패한 것도 아니다.
    vi.useFakeTimers()
    _setGenerationQueueSnapshotForTests({ projectId: 'project-1', jobs: [{ id: 'job-1', kind: 'shot_video', target: {}, cancelledAt: '2026-11-14T03:00:00Z' }] })
    closedBatchServer({ total: 2, done: 1, started: 2, jobs: [
      { jobId: 'job-0', status: 'completed', resultUrl: 'https://media.test/0.mp4', error: null },
      { jobId: 'job-1', status: 'queued', resultUrl: null, error: null },
    ] })

    void runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(3000)

    const line = translate(useLocaleStore.getState().locale, '{done} videos done, {failed} failed', { done: 1, failed: 0 })
    expect(notices.line).toHaveBeenCalledExactlyOnceWith('director', `✓ ${line}`)
    expect(notices.card).toHaveBeenCalledExactlyOnceWith({ projectId: 'project-1', kind: 'video', done: 1, failed: 0 })
  })
})

describe('혼자 정한 것', () => {
  it('멈춘 묶음([모두 멈추기] · 카드 [멈추기]로 닫힘)에 남은 영상이 모두 화면에서 멈춘 것이면, 생성처에서 끝나기를 기다리지 않고 묶음이 끝난다 — 상세 · 넘기기 창 · Lumi 도 바로 다시 만들 수 있다', async () => {
    // 왜: 오너 7번 — 상세 [새 Take 만들기] · 넘기기 창 · Lumi 는 묶음이 도는 동안 막힌다. 멈춘 묶음도 멈춘 영상이 생성처에서 끝날 때까지(몇 분)
    //   "도는 중"으로 남아 [모두 멈추기] 뒤에도 그 샷을 다시 만들 수 없었다(툴바만 풀렸다).
    vi.useFakeTimers()
    // 지금 도는 작업 목록 — 그 영상은 화면에서 멈췄다(멈춘 때가 붙음).
    _setGenerationQueueSnapshotForTests({ projectId: 'project-1', jobs: [{ id: 'job-1', kind: 'shot_video', target: {}, cancelledAt: '2026-11-14T03:00:00Z' }] })
    let runId = ''
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        runId = (JSON.parse(String(init.body)) as { batchId: string }).batchId
        return json({ batch: summary({ id: runId }), skipped: [] })
      }
      // 서버는 묶음을 닫았고, 멈춘 영상은 생성처에서 아직 돈다.
      return json({ batches: [summary({ id: runId, status: 'cancelled' })] })
    }))

    void runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(3000)

    expect(mockStore.state.videoBatchBusy).toBe(false)
  })

  it('멈춘 묶음에 멈추지 않은 영상이 남아 있으면 그 영상이 끝날 때까지 묶음은 돈다', async () => {
    // 왜: 정상 경로 고정 — 멈추지 않은 영상은 묶음이 끝까지 거둔다(묶음 끝 한 줄 · 캔버스 다시 읽기).
    vi.useFakeTimers()
    _setGenerationQueueSnapshotForTests({ projectId: 'project-1', jobs: [{ id: 'job-1', kind: 'shot_video', target: {} }] })
    let runId = ''
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        runId = (JSON.parse(String(init.body)) as { batchId: string }).batchId
        return json({ batch: summary({ id: runId }), skipped: [] })
      }
      return json({ batches: [summary({ id: runId, status: 'cancelled' })] })
    }))

    void runVideoBatch('project-1', { silent: true })
    await vi.advanceTimersByTimeAsync(6000)

    expect(mockStore.state.videoBatchBusy).toBe(true)
  })
})
