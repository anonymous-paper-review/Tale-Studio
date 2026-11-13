// Editor 를 처음 열 때 영상 소리를 다 나누어 저장한 뒤에야 편집 화면을 열고, 그 사이 · 그 뒤 고친 것이 없어지지 않는지 검사한다 (오너 2026-11-10 "처음 Editor에 입장해서 수정하면 수정 내역 없어지는데")
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
    saveEditorStateNow: vi.fn(),
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
  saveEditorStateNow: mocks.saveEditorStateNow,
}))

import { useEditorStore } from '@/stores/editor-store'
import { AUDIO_SPLIT_LIMIT_MS, EDITOR_FETCH_LIMIT, finishEditorOpen, runLimited } from '@/features/editor/open-editor'
import { editorPrepTitle } from '@/features/editor/editor-labels'
import { translate } from '@/lib/i18n/translate'
import type { PersistedEditor } from '@/lib/editor-persistence'

const read = (file: string) => readFileSync(file, 'utf8')
const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)

function query(result: Promise<unknown>) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    abortSignal: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => result.then(resolve, reject),
  }
  return chain
}
const dbShots = [
  { shot_id: 'shot-1', scene_id: 'scene-1', shot_type: 'MS', duration_seconds: 5 },
  { shot_id: 'shot-2', scene_id: 'scene-1', shot_type: 'CU', duration_seconds: 5 },
]
const dbClips = dbShots.map((s, i) => ({ id: `clip-${i + 1}`, shot_id: s.shot_id, url: `https://video.test/${i + 1}.mp4`, status: 'completed', is_final: true, take_number: 1, created_at: '2026-11-10T00:00:00Z', deleted_at: null, thumbnail_url: null }))
function answerDb() {
  mocks.loadShotsResult.mockReturnValue(Promise.resolve({ data: dbShots, error: null }))
  mocks.createClient.mockReturnValue({ from: vi.fn(() => query(Promise.resolve({ data: dbClips, error: null }))) })
}

/** 밖에서 끝낼 수 있는 약속. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const peaksOf = (n: number) => Array.from({ length: 4 }, () => n)

/** 화면(page.tsx)의 여는 순서 그대로 — 편집 준비 표시 → 샷 읽기 → 저장한 편집 되살리기 → 마무리(처음이면 소리 나누기). */
async function openLikePage(deps: Partial<Parameters<typeof finishEditorOpen>[0]> = {}) {
  const store = useEditorStore.getState()
  store.setEditorPrep({ done: 0, total: 0 })
  await store.loadData()
  const restored = await useEditorStore.getState().loadPersisted()
  return finishEditorOpen({
    projectId: mocks.projectId,
    restored,
    isCancelled: () => false,
    audioName: (shotType) => `${shotType ?? 'Video'} audio`,
    measureClips: async () => {},
    decodeAudio: async () => ({ durationSec: 5, peaks: peaksOf(1) }),
    ...deps,
  })
}
const putBodies = () =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url).includes('/api/editor/state') && (init as RequestInit | undefined)?.method === 'PUT')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as { state: PersistedEditor })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetAllMocks()
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  mocks.projectId = 'project-1'
  mocks.loadEditorState.mockResolvedValue(null)
  answerDb()
  useEditorStore.getState().reset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('처음 여는 Editor 는 소리를 다 나눈 뒤에 연다', () => {
  it('처음 여는 Editor 는 소리를 다 나누어 파형까지 채우기 전에는 편집 화면 대신 기다리는 카드를 보인다', async () => {
    // 왜: 예전에는 샷을 읽자마자 편집 화면이 뜨고, 영상마다 소리를 오디오 칸에 놓고 파형을 채우는 일은 화면 뒤에서 이어졌다 —
    //   오너는 그 사이에 고친 것이 없어진다고 보았다(2026-11-10). 정상 경로 고정: 처음 여는 프로젝트에서 늘 일어난다.
    const decodes = [deferred<{ durationSec: number; peaks: number[] }>(), deferred<{ durationSec: number; peaks: number[] }>()]
    let call = 0
    const opening = openLikePage({ decodeAudio: () => decodes[call++].promise })
    await vi.waitFor(() => expect(call).toBe(2))
    expect(useEditorStore.getState().shots).toHaveLength(2)
    expect(useEditorStore.getState().editorPrep).not.toBeNull()
    decodes[0].resolve({ durationSec: 5, peaks: peaksOf(1) })
    decodes[1].resolve({ durationSec: 5, peaks: peaksOf(2) })
    await opening
    expect(useEditorStore.getState().editorPrep).toBeNull()
    expect(useEditorStore.getState().audioClips.map((a) => a.peaks)).toEqual([peaksOf(1), peaksOf(2)])
    // 화면: 편집 준비 중이면 샷이 있어도 편집 화면 대신 기다리는 카드를 그린다.
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/if \(editorPrep\) \{[\s\S]*?<AiBusyCard lumi="editor" title=\{editorPrepTitle\(editorPrep, t\)\}/)
  })

  it('소리를 다 나누면 그 결과를 브라우저와 서버에 저장한 뒤에 편집 화면을 연다', async () => {
    // 왜: 오너 요청 그대로 — "비디오랑 오디오랑 분리해서 DB에 다 올라왔을 때 Editor 탭에서 내용이 보여지게". 정상 경로 고정.
    const put = deferred<Response>()
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === 'PUT' ? put.promise : new Response('{}', { status: 200 })))
    const opening = openLikePage()
    await vi.waitFor(() => expect(putBodies()).toHaveLength(1))
    expect(useEditorStore.getState().editorPrep).not.toBeNull()
    const [body] = putBodies()
    expect(body.state.audioClips).toHaveLength(2)
    expect(body.state.audioClips.every((a) => (a.peaks?.length ?? 0) > 0)).toBe(true)
    expect(mocks.saveEditorStateNow).toHaveBeenCalledWith('project-1', expect.objectContaining({ audioClips: expect.arrayContaining([expect.objectContaining({ peaks: peaksOf(1) })]) }))
    put.resolve(new Response('{}', { status: 200 }))
    await opening
    expect(useEditorStore.getState().editorPrep).toBeNull()
  })

  it('소리를 나누는 동안에는 반쯤 된 편집 상태를 저장하지 않는다', async () => {
    // 왜: 반쯤 된 상태(오디오 없음 · 파형 없음)가 저장되면 다음에 열 때 그것을 다 된 편집으로 읽어 소리를 다시 나누지 않는다.
    //   고장: 처음 여는 동안 영상 파일 받기가 느릴 때(운영에서 수십 초).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const hold = deferred<{ durationSec: number; peaks: number[] }>()
    const opening = openLikePage({ decodeAudio: () => hold.promise })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(useEditorStore.getState().audioClips).toHaveLength(2)
    expect(mocks.saveEditorState).not.toHaveBeenCalled()
    expect(mocks.saveEditorStateNow).not.toHaveBeenCalled()
    expect(putBodies()).toHaveLength(0)
    hold.resolve({ durationSec: 5, peaks: peaksOf(1) })
    await vi.advanceTimersByTimeAsync(0)
    await opening
    expect(mocks.saveEditorStateNow).toHaveBeenCalledTimes(1)
  })
})

describe('처음 여는 동안 · 연 뒤 고친 것이 없어지지 않는다', () => {
  it('소리 나누기가 30초를 넘기면 기다림을 멈추고 편집 화면을 연다 — 남은 파형은 뒤이어 채운다', async () => {
    // 왜: 영상이 많거나 연결이 느리면 파형 채우기(영상 파일 전체 받기)가 끝없이 길어질 수 있다. 고장: 운영의 느린 연결 · 큰 영상.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const slow = deferred<{ durationSec: number; peaks: number[] }>()
    let call = 0
    const opening = openLikePage({ decodeAudio: () => (call++ === 0 ? Promise.resolve({ durationSec: 5, peaks: peaksOf(1) }) : slow.promise) })
    await vi.advanceTimersByTimeAsync(AUDIO_SPLIT_LIMIT_MS - 1)
    expect(useEditorStore.getState().editorPrep).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    await opening
    expect(AUDIO_SPLIT_LIMIT_MS).toBe(30_000)
    expect(useEditorStore.getState().editorPrep).toBeNull()
    slow.resolve({ durationSec: 4.2, peaks: peaksOf(2) })
    await vi.advanceTimersByTimeAsync(0)
    expect(useEditorStore.getState().audioClips[1]).toMatchObject({ peaks: peaksOf(2), sourceDurationSec: 4.2 })
  })

  it('편집 화면을 먼저 연 뒤 늦게 채워지는 파형은 그 사이 옮긴 오디오 자리와 지운 클립을 덮지 않는다', async () => {
    // 왜: 오너와 정한 약속 "그 사이 고친 내용이 없어지지 않는다" — 30초를 넘겨 먼저 연 경우에도 지킨다. 고장: 느린 연결에서 연 직후 고칠 때.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const slow = deferred<{ durationSec: number; peaks: number[] }>()
    let call = 0
    const opening = openLikePage({ decodeAudio: () => (call++ === 0 ? Promise.resolve({ durationSec: 5, peaks: peaksOf(1) }) : slow.promise) })
    await vi.advanceTimersByTimeAsync(AUDIO_SPLIT_LIMIT_MS)
    await opening
    const second = useEditorStore.getState().audioClips[1]
    useEditorStore.getState().pushHistory()
    useEditorStore.getState().moveAudioClip(second.id, 12)
    useEditorStore.getState().deleteClip('shot-1')
    slow.resolve({ durationSec: 4.2, peaks: peaksOf(2) })
    await vi.advanceTimersByTimeAsync(0)
    const after = useEditorStore.getState()
    expect(after.audioClips.find((a) => a.id === second.id)).toMatchObject({ startSec: 12, peaks: peaksOf(2) })
    expect(after.clipOrder['scene-1']).toEqual(['shot-2'])
  })

  it('서버 저장이 실패해도 편집 화면은 연다 — 이 브라우저에는 저장해 두고 서버 저장은 뒤에서 다시 시도한다', async () => {
    // 왜: 서버가 잠시 고장 나도 편집을 막지 않는다. 고장: 서버 저장이 500 을 돌려줄 때.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? new Response('{"error":"db down"}', { status: 500 }) : new Response('{}', { status: 200 }))
    const opening = openLikePage()
    await vi.advanceTimersByTimeAsync(2_000)
    await opening
    expect(useEditorStore.getState().editorPrep).toBeNull()
    expect(mocks.saveEditorStateNow).toHaveBeenCalledTimes(1)
    const tries = putBodies().length
    await vi.advanceTimersByTimeAsync(6_000)
    expect(putBodies().length).toBeGreaterThan(tries)
  })

  it('처음 놓은 오디오는 되돌리기 칸에 쌓이지 않는다 — 편집 화면을 연 뒤 첫 되돌리기는 아무것도 바꾸지 않는다', async () => {
    // 왜: 예전에는 처음 놓은 오디오가 하나씩 되돌리기 칸에 쌓여, 되돌리기를 누르면 사람이 고치지 않은 오디오가 하나씩 사라졌다.
    await openLikePage()
    expect(useEditorStore.getState().past).toHaveLength(0)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().audioClips).toHaveLength(2)
  })

  it('소리는 영상 실제 길이를 잰 뒤 그 길이로 줄어든 타임라인 자리에 놓는다', async () => {
    // 왜: 예전에는 실제 길이를 재기 전 계획 길이 자리에 소리를 놓아, 계획보다 짧은 영상 뒤로 소리가 밀렸다. 고장: 영상이 계획보다 짧게 나온 때.
    // 화면은 영상 머리만 받아 실제 길이를 재고 store 에 적는다 — 첫 영상이 계획(5초)보다 짧은 3초로 나왔다.
    const measureClips = () => new Promise<void>((resolve) => setTimeout(() => {
      useEditorStore.getState().updateVideoClip('shot-1', { actualDurationSec: 3 })
      resolve()
    }, 50))
    await openLikePage({ measureClips })
    expect(useEditorStore.getState().audioClips.map((a) => a.startSec)).toEqual([0, 3])
  })

  it('나누는 도중 Editor 를 떠나면 아무것도 저장하지 않아, 다음에 열 때 처음부터 다시 나눈다', async () => {
    // 왜: 반쯤 된 상태를 저장하면 다음에 열 때 소리를 다시 나누지 않는다. 고장: 처음 여는 동안 다른 단계로 옮길 때.
    let cancelled = false
    const hold = deferred<{ durationSec: number; peaks: number[] }>()
    const opening = openLikePage({ isCancelled: () => cancelled, decodeAudio: () => hold.promise })
    await vi.waitFor(() => expect(useEditorStore.getState().audioClips).toHaveLength(2))
    cancelled = true
    hold.resolve({ durationSec: 5, peaks: peaksOf(1) })
    await opening
    useEditorStore.getState().moveAudioClip(useEditorStore.getState().audioClips[0].id, 3)
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(mocks.saveEditorState).not.toHaveBeenCalled()
    expect(mocks.saveEditorStateNow).not.toHaveBeenCalled()
    expect(putBodies()).toHaveLength(0)
    // 다음에 열기: 저장한 편집이 없으니 처음부터 다시 나눈다 — 반쯤 놓였던 오디오(3초로 옮긴 것)는 남지 않고 새로 놓인다.
    const decode = vi.fn(async () => ({ durationSec: 5, peaks: peaksOf(3) }))
    await openLikePage({ decodeAudio: decode })
    expect(decode).toHaveBeenCalledTimes(2)
    expect(useEditorStore.getState().audioClips.map((a) => [a.startSec, a.peaks])).toEqual([[0, peaksOf(3)], [5, peaksOf(3)]])
    expect(useEditorStore.getState().editorPrep).toBeNull()
  })
})

/** 이 브라우저에 저장한 편집 — 샷이 든 저장본(예전 Editor 가 저장한 그대로의 모양). */
function savedEdit(over: Partial<PersistedEditor> = {}): PersistedEditor {
  const shot = (shotId: string) => ({ shotId, sceneId: 'scene-1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds: 5, generationMethod: 'I2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as PersistedEditor['shots'][number]
  return {
    version: 1,
    shots: [shot('shot-1'), shot('shot-2')],
    clipOrder: { 'scene-1': ['shot-1', 'shot-2'] },
    videoClips: [],
    audioClips: [],
    audioSources: [],
    audioTracks: [{ id: 'atrack_1' }],
    panelSizes: { sourceW: 260, previewH: 240 },
    ...over,
  }
}
const savedAudio = (id: string, startSec: number, peaks: number[]) => ({ id, name: 'MS audio', url: 'https://video.test/1.mp4', startSec, durationSec: 5, peaks, sourceOffsetSec: 0, sourceDurationSec: 5, volume: 1, muted: false, trackId: 'atrack_1' })

describe('다시 들어올 때', () => {
  it('저장한 편집이 있으면 오디오를 다 지웠어도 다시 들어올 때 소리를 다시 놓지 않는다', async () => {
    // 왜: 예전에는 오디오 칸이 비어 있으면 처음 여는 것으로 보고 소리를 다시 놓아, 다 지운 오디오가 되살아났다.
    mocks.loadEditorState.mockResolvedValue(savedEdit())
    const decode = vi.fn(async () => ({ durationSec: 5, peaks: peaksOf(1) }))
    await openLikePage({ decodeAudio: decode })
    expect(useEditorStore.getState().audioClips).toHaveLength(0)
    expect(decode).not.toHaveBeenCalled()
    expect(useEditorStore.getState().editorPrep).toBeNull()
  })

  it('11/3 고장이 남긴 빈 저장본(샷 0)이 있으면 처음 여는 것으로 보고 소리를 나누어 놓는다', async () => {
    // 왜: 11/3 늦은 비우기가 샷 · 오디오가 하나도 없는 편집 상태를 저장한 프로젝트가 있다(운영 3945d1e6 서버 편집 상태 샷 0).
    //   그 저장본을 "되살린 편집"으로 보면 소리가 영영 놓이지 않는다(2026-11-10 검토 A E1). 고장: 그 프로젝트를 이 브라우저에서 다시 열 때.
    mocks.loadEditorState.mockResolvedValue(savedEdit({ shots: [], clipOrder: {}, audioClips: [] }))
    const decode = vi.fn(async () => ({ durationSec: 5, peaks: peaksOf(1) }))
    await openLikePage({ decodeAudio: decode })
    expect(decode).toHaveBeenCalledTimes(2)
    expect(useEditorStore.getState().audioClips).toHaveLength(2)
    expect(useEditorStore.getState().editorPrep).toBeNull()
  })

  it('다시 들어올 때도 저장한 편집을 다 되살린 뒤에 편집 화면을 연다', async () => {
    // 왜: 예전에는 샷을 읽자마자 편집 화면이 뜨고 저장한 편집이 뒤이어 덮였다 — 그 사이 고친 것은 되살리기가 덮었다.
    //   고장: 이 브라우저의 오디오 파일 저장소가 늦게 답할 때(최대 5초).
    const later = deferred<PersistedEditor | null>()
    mocks.loadEditorState.mockReturnValue(later.promise)
    const opening = openLikePage()
    await vi.waitFor(() => expect(useEditorStore.getState().shots).toHaveLength(2))
    // 되살리기 전: 기다리는 카드이고, 타임라인은 아직 DB 순서다.
    expect(useEditorStore.getState().editorPrep).not.toBeNull()
    expect(useEditorStore.getState().clipOrder['scene-1']).toEqual(['shot-1', 'shot-2'])
    later.resolve(savedEdit({ clipOrder: { 'scene-1': ['shot-2', 'shot-1'] }, audioClips: [savedAudio('audio_saved', 9, peaksOf(4))] }))
    await opening
    // 편집 화면이 열릴 때는 저장한 순서 · 오디오 자리가 이미 들어와 있다.
    const st = useEditorStore.getState()
    expect(st.editorPrep).toBeNull()
    expect(st.clipOrder['scene-1']).toEqual(['shot-2', 'shot-1'])
    expect(st.audioClips.map((a) => a.startSec)).toEqual([9])
  })

  it('되살린 편집에 파형이 없는 오디오가 있으면 편집 화면을 연 뒤 뒤에서 파형을 채운다', async () => {
    // 왜: 30초를 넘겨 먼저 연 뒤 파형이 덜 찬 채 떠나면, 다음부터 그 오디오는 파형 없이 열렸다(검토 A E5). 고장: 느린 연결에서 처음 연 뒤 바로 떠날 때.
    mocks.loadEditorState.mockResolvedValue(savedEdit({ audioClips: [savedAudio('audio_bare', 0, []), savedAudio('audio_full', 5, peaksOf(2))] }))
    const hold = deferred<{ durationSec: number; peaks: number[] }>()
    const decode = vi.fn(() => hold.promise)
    await openLikePage({ decodeAudio: decode })
    expect(useEditorStore.getState().editorPrep).toBeNull()
    expect(useEditorStore.getState().audioClips.find((a) => a.id === 'audio_bare')?.peaks).toEqual([])
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1))
    hold.resolve({ durationSec: 4.4, peaks: peaksOf(7) })
    await vi.waitFor(() => expect(useEditorStore.getState().audioClips.find((a) => a.id === 'audio_bare')).toMatchObject({ peaks: peaksOf(7), sourceDurationSec: 4.4 }))
    expect(useEditorStore.getState().audioClips.find((a) => a.id === 'audio_full')?.peaks).toEqual(peaksOf(2))
  })
})

describe('여는 길이 고장 나도 기다리는 카드는 끝난다', () => {
  it('저장본이 망가져 되살리지 못하면 처음 여는 것으로 이어 가 소리를 나누고, 까닭을 기록한다', async () => {
    // 왜: 망가진 저장본을 읽다 예외가 나면 기다리는 카드가 끝나지 않았다(검토 A E3). 고장: 저장본 일부가 깨진 브라우저.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.loadEditorState.mockResolvedValue(savedEdit({ audioClips: 7 as unknown as PersistedEditor['audioClips'] }))
    const decode = vi.fn(async () => ({ durationSec: 5, peaks: peaksOf(1) }))
    await openLikePage({ decodeAudio: decode })
    expect(logged).toHaveBeenCalled()
    expect(decode).toHaveBeenCalledTimes(2)
    expect(useEditorStore.getState().audioClips).toHaveLength(2)
    expect(useEditorStore.getState().editorPrep).toBeNull()
    logged.mockRestore()
  })

  it('Editor 를 여는 길에 예외가 나도 기다리는 카드를 내리고 화면을 연다', async () => {
    // 왜: 여는 길 어디서든 예외가 나면 준비 표시가 내려가지 않아 기다리는 카드가 영영 끝나지 않았다(검토 A E3).
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await openLikePage({ measureClips: () => { throw new Error('measure broke') } })
    expect(useEditorStore.getState().editorPrep).toBeNull()
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
    // 화면도 여는 길 전체를 감싸 떠나지 않은 한 준비 표시를 내린다.
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/\} finally \{\s*if \(!cancelled\) useEditorStore\.getState\(\)\.setEditorPrep\(null\)/)
  })
})

describe('처음 열 때 받기는 줄을 세운다', () => {
  it('처음 열 때 파형 받기는 한 번에 4개까지만 한다', async () => {
    // 왜: 영상 파일 전체를 받아 파형을 그리는데, 한꺼번에 다 받으면 연결과 메모리를 한꺼번에 쓴다(검토 A E6). 고장: 영상이 많은 프로젝트.
    const many = Array.from({ length: 10 }, (_, i) => ({ shot_id: `shot-${i + 1}`, scene_id: 'scene-1', shot_type: 'MS', duration_seconds: 5 }))
    mocks.loadShotsResult.mockReturnValue(Promise.resolve({ data: many, error: null }))
    mocks.createClient.mockReturnValue({ from: vi.fn(() => query(Promise.resolve({ data: many.map((s, i) => ({ ...dbClips[0], id: `clip-${i + 1}`, shot_id: s.shot_id, url: `https://video.test/${i + 1}.mp4` })), error: null }))) })
    let running = 0
    let most = 0
    const decode = vi.fn(async () => {
      running += 1
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return { durationSec: 5, peaks: peaksOf(1) }
    })
    await openLikePage({ decodeAudio: decode })
    expect(decode).toHaveBeenCalledTimes(10)
    expect(most).toBe(EDITOR_FETCH_LIMIT)
    expect(EDITOR_FETCH_LIMIT).toBe(4)
  })

  it('Editor 를 열 때 영상 길이 재기도 한 번에 4개까지만 한다', async () => {
    // 왜: 길이 재기는 영상마다 머리를 받는다 — 화면(page.tsx)이 같은 줄 세우기로 잰다.
    let running = 0
    let most = 0
    await runLimited(Array.from({ length: 9 }, (_, i) => i), EDITOR_FETCH_LIMIT, async () => {
      running += 1
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
    })
    expect(most).toBe(4)
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/const measureClips = \(\) =>\s*runLimited\(\s*useEditorStore\s*\.getState\(\)\s*\.videoClips\.filter\(\(c\) => c\.url && c\.actualDurationSec == null\),\s*EDITOR_FETCH_LIMIT,/)
  })
})

describe('기다리는 동안의 단축키', () => {
  it('편집 화면을 준비하는 동안에는 되돌리기 · 지우기 같은 단축키가 편집 상태를 바꾸지 않는다', () => {
    // 왜: 기다리는 카드가 떠 있어도 Editor 단축키(Ctrl+Z · Delete · Space)는 살아 있어, 기다리며 누른 되돌리기가 막 놓은 오디오를 지웠다.
    //   고장: 처음 여는 동안 키보드를 누를 때. 단축키는 창 전체에 걸려 있어 소스에서 막힌 자리를 본다.
    const src = read('src/features/editor/use-editor-playback.ts')
    const guard = src.indexOf('if (s.editorPrep) return')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(src.indexOf('s.undo()'))
    expect(guard).toBeLessThan(src.indexOf('s.deleteSelectedClips()'))
  })
})

describe('기다리는 카드의 글', () => {
  it('기다리는 카드는 소리 나누기가 얼마나 됐는지 %로 보인다', () => {
    // 왜: 영상이 많으면 처음 여는 데 수십 초 걸릴 수 있다 — 멈춘 것이 아니라 나아가는 중임을 보인다. 글은 예전 "클립 준비 중…" 그대로다.
    expect(editorPrepTitle({ done: 1, total: 4 }, ko)).toBe('클립 준비 중… 25%')
    expect(editorPrepTitle({ done: 0, total: 0 }, ko)).toBe('클립 준비 중…')
  })
})
