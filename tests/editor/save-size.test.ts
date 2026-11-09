// 편집 저장본이 브라우저 저장 공간을 아껴 쓰고, 저장하지 못하면 사람에게 알리는지 검사한다 (2026-11-10 검토 A E2a — 꽉 차면 저장이 조용히 실패해 "수정 내역 없어짐"으로 보였다)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // 편집 저장 구독은 브라우저에서만 붙는다 — 저장을 보려고 window 를 먼저 둔다.
  ;(globalThis as { window?: unknown }).window = globalThis
  return { toastError: vi.fn() }
})
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn(), message: vi.fn() } }))

import { useEditorStore, saveEditorNow } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { saveEditorStateNow, type PersistedEditor } from '@/lib/editor-persistence'
import type { AudioTrackClip, Shot } from '@/types'

const PROJECT_ID = 'proj-save-size'
const LS_KEY = `tale:editor:v1:${PROJECT_ID}`
// 파형은 0~1 사이 1000칸 — 소리를 디코드해 정규화하면 소수가 길게 나온다(예: 0.8414709848078965).
const longPeaks = Array.from({ length: 1000 }, (_, i) => Math.abs(Math.sin(i * 1.2345678)))
const audio = (id: string): AudioTrackClip => ({ id, name: 'MS audio', url: `https://video.test/${id}.mp4`, startSec: 0, durationSec: 5, peaks: longPeaks, sourceOffsetSec: 0, sourceDurationSec: 5, volume: 1, muted: false, trackId: 'atrack_1' })
const shot = { shotId: 'shot-1', sceneId: 'scene-1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds: 5, generationMethod: 'I2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null } as unknown as Shot
const snapshot = (over: Partial<PersistedEditor> = {}): PersistedEditor => ({
  version: 1, shots: [shot], clipOrder: { 'scene-1': ['shot-1'] }, videoClips: [], audioClips: [audio('a1')], audioSources: [], audioTracks: [{ id: 'atrack_1' }], panelSizes: { sourceW: 260, previewH: 240 }, ...over,
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  mocks.toastError.mockReset()
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
  useProjectStore.setState({ projectId: PROJECT_ID })
  useEditorStore.getState().reset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
  localStorage.clear()
})

describe('저장본의 크기', () => {
  it('파형은 소수 둘째 자리까지만 저장해 저장 크기를 줄인다 — 화면의 파형은 그대로다', async () => {
    // 왜: 파형이 오디오 하나에 약 2만 글자라 영상이 많은 프로젝트 몇 개면 브라우저 저장 공간(약 500만 글자)이 찼다. 고장: 긴 프로젝트를 여럿 연 브라우저.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    useEditorStore.setState({ shots: [shot], clipOrder: { 'scene-1': ['shot-1'] }, loadStatus: 'ready' })
    useEditorStore.setState({ audioClips: [audio('a1')] })
    await vi.advanceTimersByTimeAsync(2_000)
    const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as PersistedEditor
    const savedPeaks = saved.audioClips[0].peaks ?? []
    expect(savedPeaks).toHaveLength(1000)
    expect(savedPeaks.every((p) => Math.round(p * 100) / 100 === p)).toBe(true)
    expect(savedPeaks.every((p, i) => Math.abs(p - longPeaks[i]) <= 0.005)).toBe(true)
    expect(JSON.stringify(savedPeaks).length).toBeLessThan(JSON.stringify(longPeaks).length * 0.3)
    // 서버에 보내는 저장본도 같은 크기로 줄인다.
    const put = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/editor/state'))
    const sent = JSON.parse(String((put?.[1] as RequestInit).body)) as { state: PersistedEditor }
    expect(sent.state.audioClips[0].peaks).toEqual(savedPeaks)
    // 화면(편집 상태)의 파형은 줄이지 않는다.
    expect(useEditorStore.getState().audioClips[0].peaks).toBe(longPeaks)
  })

  it('예전 저장본(긴 소수 파형)도 그대로 읽힌다', async () => {
    // 왜: 정상 경로 고정 — 이번에 바꾼 것은 값의 자릿수뿐이라 이미 저장된 편집을 다시 열 수 있어야 한다.
    useEditorStore.setState({ shots: [shot], videoClips: [], clipOrder: { 'scene-1': ['shot-1'] } })
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot()))
    expect(await useEditorStore.getState().loadPersisted()).toBe(true)
    expect(useEditorStore.getState().audioClips[0].peaks).toEqual(longPeaks)
  })
})

describe('이 브라우저에 저장하지 못할 때', () => {
  it('이 브라우저에 편집을 저장하지 못하면(저장 공간이 꽉 참) 한 번 알린다', async () => {
    // 왜: 예전에는 저장 공간이 차면 개발자 콘솔에만 남기고 조용히 실패해, 다시 열면 옛 편집이나 처음 상태가 보였다(검토 A E2a). 고장: 저장 공간이 꽉 찬 브라우저.
    useLocaleStore.setState({ locale: 'ko' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 정상 경로 고정: 저장이 되는 동안에는 알리지 않는다.
    saveEditorStateNow(PROJECT_ID, snapshot())
    expect(mocks.toastError).not.toHaveBeenCalled()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    saveEditorStateNow(PROJECT_ID, snapshot())
    saveEditorStateNow(PROJECT_ID, snapshot())
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledWith('이 브라우저에 편집 내용을 저장하지 못했어요. 브라우저 저장 공간이 꽉 찼을 수 있어요.')
    // 같은 프로젝트에서 또 실패해도(편집 화면을 열기 전 바로 저장 포함) 다시 알리지 않는다 — 한 번만.
    await saveEditorNow(PROJECT_ID).catch(() => null)
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })
})
