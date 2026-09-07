// 저장할 수 없는 오류는 곧바로 멈추고, 잠시 뒤 해결될 오류만 다시 시도한다 (#editor-save-500 2026-08-07)
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

describe('저장 실패 상황별 약속', () => {
  it('삭제된 프로젝트에 저장하려 하면 한 번만 시도하고 바로 멈춘다', async () => {
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

  it('잠시 장애가 생기면 몇 차례 다시 시도하고 다음 저장도 이어간다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'db hiccup' }))

    scheduleServerSave('proj-retry', snapshot, 0)
    // 시도 3회: 즉시 + 250ms + 500ms 백오프
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // 5초 뒤 다음 사이클이 다시 돈다
    await vi.advanceTimersByTimeAsync(6_000)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('저장에 성공하면 같은 내용을 다시 보내지 않는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))

    scheduleServerSave('proj-ok', snapshot, 0)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
