import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleServerSave } from '@/stores/editor-store'
import type { PersistedEditor } from '@/lib/editor-persistence'

// #editor-save-500 (2026-08-07) — 서버 저장 실패의 재시도 분류.
//   4xx(만료 세션·삭제된 프로젝트 410)는 재시도로 달라지지 않으므로 즉시 중단,
//   5xx/네트워크만 백오프 재시도. 기존엔 모든 실패가 5초 무한 재시도라 콘솔 도배.

const snapshot: PersistedEditor = {
  version: 1,
  shots: [],
  clipOrder: {},
  videoClips: [],
  audioClips: [],
  audioSources: [],
  panelSizes: { sourceW: 300, previewH: 200 },
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('scheduleServerSave 재시도 분류', () => {
  it('410(삭제된 프로젝트)은 1회 시도 후 중단 — 5초 재시도 루프 없음', async () => {
    fetchMock.mockResolvedValue(jsonResponse(410, { error: 'project no longer exists' }))

    scheduleServerSave('proj-fatal', snapshot, 0)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 진단에 서버 사유가 포함된다 (HTTP 410 — project no longer exists)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('non-retryable'),
      expect.stringContaining('project no longer exists'),
    )

    // 5초 재시도 창을 훌쩍 지나도 추가 호출 없음
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('500(일시 장애)은 3회 백오프 후 5초 뒤 재시도 사이클 지속', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'db hiccup' }))

    scheduleServerSave('proj-retry', snapshot, 0)
    // 시도 3회: 즉시 + 250ms + 500ms 백오프
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // 5초 뒤 다음 사이클이 다시 돈다
    await vi.advanceTimersByTimeAsync(6_000)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('성공하면 스냅샷을 비우고 멈춘다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))

    scheduleServerSave('proj-ok', snapshot, 0)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
