// 저장해 둔 편집을 불러올 때 오디오 파일 저장소(IndexedDB)가 멈추거나 고장 나도 나머지 편집을 여는지 검사한다 (QA 2026-11-03 밤 오너 "Editor에서 무한 로딩")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  // 저장 · 불러오기는 브라우저에서만 돈다 — window 를 먼저 둔다(localStorage 는 vitest.setup 의 대역).
  ;(globalThis as { window?: unknown }).window = globalThis
})

import { AUDIO_BLOB_TIMEOUT_MS, loadEditorState } from '@/lib/editor-persistence'

const PROJECT = 'project-saved'
const saved = {
  version: 1,
  shots: [],
  clipOrder: {},
  videoClips: [],
  audioClips: [{ id: 'audio-1', name: 'BGM', url: 'blob:stale', blobKey: 'blob-1', startSec: 0, durationSec: 3, volume: 1, muted: false }],
  audioSources: [],
  audioTracks: [{ id: 'atrack_1' }],
  panelSizes: { sourceW: 300, previewH: 320 },
}

/** 열기 요청이 끝내 답하지 않는 저장소. */
const silentIndexedDB = { open: () => ({}) }
/** 열자마자 고장 나는 저장소(사생활 보호 창 등). */
const brokenIndexedDB = {
  open: () => {
    const request: { error: Error; onerror?: (e: { target: unknown }) => void } = { error: new Error('blocked') }
    queueMicrotask(() => request.onerror?.({ target: request }))
    return request
  },
}

beforeEach(() => {
  localStorage.setItem(`tale:editor:v1:${PROJECT}`, JSON.stringify(saved))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('저장해 둔 편집 불러오기는 끝난다', () => {
  it('오디오 파일 저장소가 5초 안에 답하지 않으면 그 파일 없이 나머지 편집을 연다', async () => {
    // 왜: 저장소가 멈추면 편집 불러오기가 끝나지 않아, 그 뒤의 영상 길이 재기 · 첫 진입 오디오 놓기가 영영 안 됐다. 고장: 다른 탭이 저장소를 잡고 있을 때.
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', silentIndexedDB)
    const loading = loadEditorState(PROJECT)
    await vi.advanceTimersByTimeAsync(AUDIO_BLOB_TIMEOUT_MS)
    await expect(loading).resolves.toMatchObject({ audioClips: [{ id: 'audio-1' }], panelSizes: { sourceW: 300 } })
    expect(AUDIO_BLOB_TIMEOUT_MS).toBe(5_000)
  })

  it('오디오 파일 저장소가 고장 나면 그 파일 없이 나머지 편집을 연다', async () => {
    // 왜: 저장소 열기가 실패하면 불러오기 전체가 실패해 저장해 둔 컷 · 자막 · 오디오 배치를 하나도 되살리지 못했다.
    vi.stubGlobal('indexedDB', brokenIndexedDB)
    await expect(loadEditorState(PROJECT)).resolves.toMatchObject({ audioClips: [{ id: 'audio-1' }] })
  })
})
