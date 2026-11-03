// Editor 를 열면 어떤 경우에도 기다림이 끝나고, 영상을 못 불러온 클립은 그 클립만 실패로 보이는지 검사한다 (QA 2026-11-03 밤 오너 "Editor에서 무한 로딩이 걸리는 경우가 있는데")
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // 편집 저장 구독은 브라우저에서만 붙는다 — 이 파일은 저장 여부를 보므로 window 를 먼저 둔다.
  ;(globalThis as { window?: unknown }).window = globalThis
  return {
    createClient: vi.fn(),
    loadShotsResult: vi.fn(),
    cancelShotsLoad: vi.fn(),
    saveEditorState: vi.fn(),
    loadEditorState: vi.fn(),
    projectId: 'project-1' as string | null,
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: () => Promise.resolve(),
  loadShotsResult: mocks.loadShotsResult,
  cancelShotsLoad: mocks.cancelShotsLoad,
}))
vi.mock('@/stores/project-store', () => ({
  useProjectStore: { getState: () => ({ projectId: mocks.projectId }) },
}))
vi.mock('@/lib/editor-persistence', () => ({
  deleteAudioBlob: vi.fn(),
  loadEditorState: mocks.loadEditorState,
  saveEditorState: mocks.saveEditorState,
}))

import { EDITOR_LOAD_TIMEOUT_MS, useEditorStore } from '@/stores/editor-store'
import { clipDisplayStatus, clipStatusLabel, editorEmptyScreen, previewPane } from '@/features/editor/editor-labels'
import { translate } from '@/lib/i18n/translate'
import type { VideoClip } from '@/types'

const read = (file: string) => readFileSync(file, 'utf8')
const ko = (text: string) => translate('ko', text)

/** supabase 체인 — select · eq · abortSignal 을 받고, 기다리면 result 를 낸다. */
function query(result: Promise<unknown>) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    abortSignal: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => result.then(resolve, reject),
  }
  return chain
}
const dbShot = { shot_id: 'shot-1', scene_id: 'scene-1', shot_type: 'MS', duration_seconds: 5 }
const dbClip = { id: 'clip-1', shot_id: 'shot-1', url: 'https://video.test/1.mp4', status: 'completed', is_final: true, take_number: 1, created_at: '2026-11-03T00:00:00Z', deleted_at: null, thumbnail_url: null }
const never = () => new Promise<never>(() => {})
function answer(shots: Promise<unknown>, clips: Promise<unknown>) {
  mocks.loadShotsResult.mockReturnValue(shots)
  mocks.createClient.mockReturnValue({ from: vi.fn(() => query(clips)) })
}
const ok = () => answer(Promise.resolve({ data: [dbShot], error: null }), Promise.resolve({ data: [dbClip], error: null }))
const clip = (over: Partial<VideoClip> = {}): VideoClip => ({ shotId: 'shot-1', url: 'https://video.test/1.mp4', status: 'completed', thumbnailUrl: null, ...over })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetAllMocks()
  // 서버 저장(PUT /api/editor/state)은 진짜로 나가지 않게 막는다.
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  mocks.projectId = 'project-1'
  useEditorStore.getState().reset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Editor 를 여는 기다림은 끝난다', () => {
  it('Editor 가 열려 있는 동안 편집 상태가 비워지면 비운 횟수가 늘어, 열린 Editor 가 그 프로젝트를 다시 읽어 화면을 연다', async () => {
    // 왜: 프로젝트 목록에서 프로젝트를 열면 단계 store 들을 늦게(비동기로) 비운다. Editor 가 이미 읽기 시작한 뒤에 비우면 읽던 결과는 버려지고
    //   다시 읽는 곳이 없어 큰 Lumi 기다림이 끝나지 않았다(11/3 밤 오너 제보 · 운영 3945d1e6 에 빈 편집 상태가 저장돼 있었다).
    ok()
    const pending = useEditorStore.getState().loadData()
    const before = useEditorStore.getState().resetCount
    useEditorStore.getState().reset()
    await pending
    expect(useEditorStore.getState()).toMatchObject({ loadStatus: 'idle', shots: [] })
    expect(useEditorStore.getState().resetCount).toBe(before + 1)
    // 화면은 비운 횟수가 바뀌면 '다시 시도'처럼 처음부터 다시 읽는다 — 다시 읽으면 화면이 열린다.
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/useEditorStore\.subscribe\(\(s\) => \{\s*if \(s\.resetCount === seen\) return\s*seen = s\.resetCount\s*setRetryTick\(\(n\) => n \+ 1\)/)
    ok()
    await useEditorStore.getState().loadData()
    expect(useEditorStore.getState()).toMatchObject({ loadStatus: 'ready' })
    expect(useEditorStore.getState().shots).toHaveLength(1)
  })

  it('샷 · 영상 목록을 20초 안에 받지 못하면 기다림을 멈추고 불러오지 못했다고 알린다', async () => {
    // 왜: 연결이 멈추거나 로그인 갱신이 걸리면 읽기가 끝나지 않아 기다림 화면이 끝나지 않았다. 고장: 네트워크가 멈춘 때.
    vi.useFakeTimers()
    answer(never(), never())
    const loading = useEditorStore.getState().loadData()
    await vi.advanceTimersByTimeAsync(EDITOR_LOAD_TIMEOUT_MS - 1)
    expect(useEditorStore.getState().loadStatus).toBe('loading')
    await vi.advanceTimersByTimeAsync(1)
    await loading
    expect(EDITOR_LOAD_TIMEOUT_MS).toBe(20_000)
    expect(useEditorStore.getState()).toMatchObject({ loadStatus: 'error', shots: [] })
    expect(useEditorStore.getState().error).toMatch(/timed out/i)
  })

  it('기다림을 멈춘 뒤 다시 시도하면 멈춘 요청에 기대지 않고 새로 읽는다', async () => {
    // 왜: 샷 읽기는 같은 요청을 함께 기다리는 사물함을 지난다 — 멈춘 요청을 그대로 두면 [다시 시도]도 같은 요청에 붙어 또 멈춘다.
    vi.useFakeTimers()
    answer(never(), never())
    const loading = useEditorStore.getState().loadData()
    await vi.advanceTimersByTimeAsync(EDITOR_LOAD_TIMEOUT_MS)
    await loading
    expect(mocks.cancelShotsLoad).toHaveBeenCalledWith('project-1')
    ok()
    await useEditorStore.getState().loadData()
    expect(useEditorStore.getState()).toMatchObject({ loadStatus: 'ready', error: null })
  })
})

describe('샷이 없을 때 Editor 가 보이는 화면', () => {
  it('프로젝트를 여는 중(아직 정해지지 않음)에는 "이전 단계를 먼저 끝내세요" 대신 기다림을 보인다', () => {
    // 왜: 프로젝트를 바꾸는 동안에는 프로젝트가 잠깐 비어 있다 — 그때 "이전 단계를 먼저 끝내세요"를 띄우면 틀린 안내다(#pps-empty-states).
    expect(editorEmptyScreen({ loadStatus: 'ready', projectId: null, initLoading: true })).toBe('loading')
    expect(editorEmptyScreen({ loadStatus: 'idle', projectId: null, initLoading: true })).toBe('loading')
    // 정상 경로 고정: 프로젝트가 정해진 뒤에는 지금처럼 읽는 중 · 실패 · 샷 없음을 나눠 보인다.
    expect(editorEmptyScreen({ loadStatus: 'loading', projectId: 'project-1', initLoading: false })).toBe('loading')
    expect(editorEmptyScreen({ loadStatus: 'error', projectId: 'project-1', initLoading: false })).toBe('error')
    expect(editorEmptyScreen({ loadStatus: 'ready', projectId: 'project-1', initLoading: false })).toBe('empty')
    expect(editorEmptyScreen({ loadStatus: 'ready', projectId: null, initLoading: false })).toBe('empty')
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/editorEmptyScreen\(\{ loadStatus, projectId, initLoading: projectInitLoading \}\)/)
  })
})

describe('아직 못 읽은 빈 편집 상태는 저장하지 않는다', () => {
  it('편집 상태가 비워지거나 읽기에 실패한 빈 상태는 그 프로젝트의 저장된 편집을 덮어쓰지 않는다', async () => {
    // 왜: 늦게 오는 비우기가 빈 편집 상태를 막 연 프로젝트 이름으로 저장했다 — 운영 3945d1e6 의 서버 편집 상태가 샷 0 · 오디오 0 이었다.
    //   그대로 두면 자른 조각 · 타이틀 카드 · 자막 · 오디오 배치가 빈 것으로 덮인다.
    vi.useFakeTimers()
    ok()
    await useEditorStore.getState().loadData()
    mocks.saveEditorState.mockClear()
    await vi.advanceTimersByTimeAsync(5_000)
    fetchMock.mockClear()
    useEditorStore.getState().reset()
    answer(Promise.resolve({ data: null, error: { message: 'db down' } }), Promise.resolve({ data: [], error: null }))
    await useEditorStore.getState().loadData()
    expect(useEditorStore.getState().loadStatus).toBe('error')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mocks.saveEditorState).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('정상으로 읽은 편집 상태는 지금처럼 저장한다', async () => {
    // 왜: 정상 경로 고정 — 읽은 뒤의 편집(그리고 샷이 하나도 없는 프로젝트의 빈 상태)은 그대로 저장한다.
    ok()
    await useEditorStore.getState().loadData()
    expect(mocks.saveEditorState).toHaveBeenCalledWith('project-1', expect.objectContaining({ shots: [expect.objectContaining({ shotId: 'shot-1' })] }))
  })
})

describe('영상을 못 불러온 클립은 그 클립만 실패로 보인다', () => {
  it('영상 주소를 불러오지 못한 클립은 그 클립만 "불러오지 못함"으로 보이고 다른 클립은 그대로다', async () => {
    // 왜: 404 · 막힌 주소의 영상은 미리 보기가 검은 채 아무 말이 없어 아직 불러오는 중처럼 보였다(개발 화면 재현).
    ok()
    await useEditorStore.getState().loadData()
    useEditorStore.getState().markVideoUnplayable('https://video.test/1.mp4')
    const unplayable = useEditorStore.getState().unplayableVideoUrls
    expect(clipDisplayStatus(clip(), unplayable)).toBe('unplayable')
    expect(clipDisplayStatus(clip({ shotId: 'shot-2', url: 'https://video.test/2.mp4' }), unplayable)).toBe('completed')
    expect(clipDisplayStatus(clip({ url: null, status: 'pending' }), unplayable)).toBe('pending')
    expect(ko(clipStatusLabel('unplayable'))).toBe('불러오지 못함')
  })

  it('미리 보기에서 지금 컷의 영상을 불러오지 못하면 검은 화면 대신 그 컷 자리에 안내가 보이고, 다른 컷은 영상이 나온다', () => {
    // 왜: 한 컷의 영상이 깨져도 나머지는 열려야 한다 — 그 컷만 "영상을 불러오지 못했어요"를 보인다.
    const unplayable = ['https://video.test/broken.mp4']
    expect(previewPane({ isTitleCard: false, hasShot: true, clip: clip({ url: 'https://video.test/broken.mp4' }), unplayable })).toBe('unplayable')
    expect(previewPane({ isTitleCard: false, hasShot: true, clip: clip(), unplayable })).toBe('video')
    expect(previewPane({ isTitleCard: false, hasShot: true, clip: clip({ url: null, status: 'pending' }), unplayable })).toBe('no-video')
    expect(previewPane({ isTitleCard: true, hasShot: true, clip: undefined, unplayable })).toBe('title')
    expect(previewPane({ isTitleCard: false, hasShot: false, clip: undefined, unplayable })).toBe('empty')
    // 미리 보기 · 열 때의 길이 재기가 영상 오류를 그 클립의 "불러오지 못함"으로 남긴다.
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/onError=\{\(\) => markVideoUnplayable\(activeClip\.url\)\}/)
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/v\.onerror = \(\) => \{\s*if \(!cancelled\) useEditorStore\.getState\(\)\.markVideoUnplayable\(c\.url as string\)/)
  })

  it('다시 읽으면 불러오지 못함 표시를 지우고 새로 판단한다', async () => {
    // 왜: 잠깐 끊겨 못 불러온 클립이 다시 읽은 뒤에도 실패로 남으면 안 된다. 다시 만든 영상은 주소가 바뀌어 새로 판단된다.
    ok()
    await useEditorStore.getState().loadData()
    useEditorStore.getState().markVideoUnplayable('https://video.test/1.mp4')
    ok()
    await useEditorStore.getState().loadData()
    expect(useEditorStore.getState().unplayableVideoUrls).toEqual([])
  })
})
