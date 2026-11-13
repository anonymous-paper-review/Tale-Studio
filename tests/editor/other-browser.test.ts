// 다른 브라우저 · 저장 공간을 비운 브라우저에서 Editor 를 열어도 서버에 저장한 편집을 덮지 않고, 더 나중에 저장한 편집을 여는지 검사한다 (E2b, 결정 페이지 "나머지는 추천대로" 2026-11-14)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // 편집 저장 구독은 브라우저에서만 붙는다 — window 를 먼저 둔다(localStorage 는 vitest.setup 의 대역).
  ;(globalThis as { window?: unknown }).window = globalThis
  return {
    createClient: vi.fn(),
    loadShotsResult: vi.fn(),
    cancelShotsLoad: vi.fn(),
    toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
    projectId: 'project-1' as string | null,
  }
})

vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: () => Promise.resolve(),
  loadShotsResult: mocks.loadShotsResult,
  cancelShotsLoad: mocks.cancelShotsLoad,
}))
vi.mock('@/stores/project-store', () => ({
  useProjectStore: { getState: () => ({ projectId: mocks.projectId }) },
}))

import { useEditorStore } from '@/stores/editor-store'
import { finishEditorOpen } from '@/features/editor/open-editor'
import { draftAudioClips } from '@/lib/editor-draft-render'
import { rememberServerSeenAt } from '@/lib/editor/server-copy'
import { translate } from '@/lib/i18n/translate'
import { useLocaleStore } from '@/stores/locale-store'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

const LOCAL_KEY = 'tale:editor:v1:project-1'

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
  { shot_id: 'shot-1', scene_id: 'scene-1', shot_type: 'MS', duration_seconds: 4 },
  { shot_id: 'shot-2', scene_id: 'scene-1', shot_type: 'CU', duration_seconds: 4 },
]
const dbClips = dbShots.map((s, i) => ({ id: `clip-${i + 1}`, shot_id: s.shot_id, url: `https://video.test/${i + 1}.mp4`, status: 'completed', is_final: true, take_number: 1, created_at: '2026-11-14T00:00:00Z', deleted_at: null, thumbnail_url: null }))

const shot = (shotId: string): Shot => ({ shotId, sceneId: 'scene-1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds: 4, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
const clip = (shotId: string, patch: Partial<VideoClip> = {}): VideoClip => ({ shotId, url: `https://video.test/${shotId.slice(-1)}.mp4`, status: 'completed', thumbnailUrl: null, ...patch })
const linked = (shotId: string, startSec: number): AudioTrackClip => ({
  id: `audio-${shotId}`, name: 'MS audio', url: `https://video.test/${shotId.slice(-1)}.mp4`, startSec, durationSec: 4, volume: 1, muted: false,
  peaks: [0.1, 0.2], sourceOffsetSec: 0, sourceDurationSec: 4, trackId: 'atrack_1', linkedShotId: shotId,
})
/** 사람이 고친 편집 — order 는 타임라인 순서, extra 는 더 넣을 것. */
function edit(order: string[], extra: Partial<PersistedEditor> = {}): PersistedEditor {
  let at = 0
  const audioClips = order.map((id) => {
    const a = linked(id, at)
    at += 4
    return a
  })
  return {
    version: 1,
    shots: [shot('shot-1'), shot('shot-2')],
    clipOrder: { 'scene-1': order },
    videoClips: [clip('shot-1'), clip('shot-2')],
    audioClips,
    audioSources: [],
    audioTracks: [{ id: 'atrack_1' }],
    panelSizes: { sourceW: 256, previewH: 360 },
    ...extra,
  }
}

/** 서버(editor_states) — 'down' 이면 읽기도 쓰기도 500. */
let server: { state: PersistedEditor | null; updatedAt: string | null } | 'down'
let putDown = false
// 읽기만 끊기는 반쪽 고장 — 쓰기는 된다.
let getDown = false
let clock = 0
const puts: PersistedEditor[] = []
const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 0, minute)).toISOString()

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  useLocaleStore.setState({ locale: 'en' })
  server = { state: null, updatedAt: null }
  putDown = false
  getDown = false
  clock = 30
  puts.length = 0
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!String(url).startsWith('/api/editor/state')) return new Response('{}', { status: 200 })
    const method = init?.method ?? 'GET'
    if (server === 'down' || (method === 'PUT' && putDown) || (method === 'GET' && getDown)) return new Response(JSON.stringify({ error: 'db down' }), { status: 500 })
    if (method === 'GET') return new Response(JSON.stringify(server), { status: 200 })
    const body = JSON.parse(String(init?.body)) as { state: PersistedEditor }
    puts.push(body.state)
    server = { state: body.state, updatedAt: at(clock++) }
    return new Response(JSON.stringify({ ok: true, updatedAt: server.updatedAt }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  mocks.projectId = 'project-1'
  mocks.loadShotsResult.mockReturnValue(Promise.resolve({ data: dbShots, error: null }))
  mocks.createClient.mockReturnValue({ from: vi.fn(() => query(Promise.resolve({ data: dbClips, error: null }))) })
  useEditorStore.getState().reset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  ;(globalThis as { window?: unknown }).window = globalThis
  localStorage.clear()
})

/** 화면(page.tsx)의 여는 순서 그대로 — 편집 준비 표시 → 샷 읽기 → 저장한 편집 되살리기 → 마무리(처음이면 소리 나누기). */
async function openLikePage() {
  const store = useEditorStore.getState()
  store.reset()
  store.setEditorPrep({ done: 0, total: 0 })
  await store.loadData()
  const restored = await useEditorStore.getState().loadPersisted()
  await finishEditorOpen({
    projectId: mocks.projectId,
    restored,
    isCancelled: () => false,
    audioName: (shotType) => `${shotType ?? 'Video'} audio`,
    measureClips: async () => {},
    decodeAudio: async () => ({ durationSec: 4, peaks: [0.5, 0.5] }),
  })
  useEditorStore.getState().setEditorPrep(null)
}
const order = () => useEditorStore.getState().clipOrder['scene-1']
const subtitleOf = (shotId: string, state: { shots: Shot[] }) => state.shots.find((s) => s.shotId === shotId)?.subtitle?.text ?? null
/** 지금 편집에 사람이 한 번 고친다(샷 1 자막) — 서버 저장은 1.5초 뒤, 실패하면 0.75초 안에 세 번 시도하므로 4초를 넘긴다. */
async function editAndWait() {
  vi.useFakeTimers()
  useEditorStore.getState().setSubtitle('shot-1', { text: '고친 자막' })
  await vi.advanceTimersByTimeAsync(4_000)
  vi.useRealTimers()
}

describe('이 브라우저에 편집이 없을 때', () => {
  it('이 브라우저에 저장한 편집이 없으면 서버에 저장한 편집을 읽어 그대로 연다', async () => {
    // 왜: 다른 브라우저 · 다른 기기 · 저장 공간을 비운 브라우저에서 열면 예전에는 처음 상태(빼 둔 샷이 돌아오고 소리를 다시 나눔)로 열렸다(E2b, QA 2026-11-10).
    server = { state: edit(['shot-1']), updatedAt: at(10) }
    await openLikePage()
    expect(order()).toEqual(['shot-1'])
    expect(useEditorStore.getState().audioClips.map((a) => a.id)).toEqual(['audio-shot-1'])
  })

  it('서버에 샷이 있는 편집이 저장돼 있으면 처음 상태로 열어 그 편집을 덮지 않는다', async () => {
    // 왜: 예전에는 다른 브라우저가 연 처음 상태를 서버에 써서, 먼저 고친 브라우저의 편집이 사라졌다(E2b, 운영 3945d1e6).
    server = { state: edit(['shot-1']), updatedAt: at(10) }
    await openLikePage()
    expect(puts.some((p) => p.clipOrder['scene-1']?.includes('shot-2'))).toBe(false)
    await editAndWait()
    const last = puts[puts.length - 1]
    expect(last.clipOrder['scene-1']).toEqual(['shot-1'])
    expect(subtitleOf('shot-1', last)).toBe('고친 자막')
  })

  it('서버에서 연 편집은 이 브라우저에도 바로 저장한다', async () => {
    // 왜: 저장해 두지 않으면 이 브라우저에서 다시 열 때마다 서버를 기다리고, 서버가 잠시 고장 나면 열지 못한다.
    server = { state: edit(['shot-1']), updatedAt: at(10) }
    await openLikePage()
    const local = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor
    expect(local.clipOrder['scene-1']).toEqual(['shot-1'])
  })

  it('서버 편집을 읽지 못한 채 처음 상태로 연 화면은, 서버가 돌아왔을 때 다른 브라우저에서 저장한 편집이 있으면 덮지 않고 한 번 알린다', async () => {
    // 왜: 서버가 잠시 고장 나도 편집은 막지 않는다(약속: first-open). 그 사이 연 처음 상태를 서버에 쓰면 다른 브라우저의 편집을 덮는다.
    //   고장: 편집 저장 서버가 잠시 답하지 않을 때 다른 기기에서 처음 열기.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    server = 'down'
    const opening = openLikePage()
    await vi.advanceTimersByTimeAsync(2_000)
    await opening
    expect(order()).toEqual(['shot-1', 'shot-2'])
    const elsewhere = edit(['shot-2'])
    server = { state: elsewhere, updatedAt: at(40) }
    await vi.advanceTimersByTimeAsync(12_000)
    expect(server).toEqual({ state: elsewhere, updatedAt: at(40) })
    expect(puts).toHaveLength(0)
    const notice = translate('en', "There are edits saved in another browser. Changes you make here won't be saved to the server.")
    expect(mocks.toast.warning.mock.calls.filter(([text]) => text === notice)).toHaveLength(1)
  })
})

describe('이 브라우저에도 편집이 있을 때', () => {
  it('다른 브라우저가 더 나중에 서버에 저장했으면 이 브라우저의 옛 편집 대신 서버 편집을 연다', async () => {
    // 왜: A 에서 고치고 B 에서 더 고친 뒤 A 를 다시 열면, 예전에는 A 의 옛 편집이 열리고 그것을 서버에 써서 B 의 편집을 지웠다.
    localStorage.setItem(LOCAL_KEY, JSON.stringify(edit(['shot-1', 'shot-2'])))
    rememberServerSeenAt('project-1', at(10))
    server = { state: edit(['shot-2', 'shot-1']), updatedAt: at(20) }
    await openLikePage()
    expect(order()).toEqual(['shot-2', 'shot-1'])
  })

  it('이 브라우저가 마지막으로 저장한 뒤로 서버 편집이 바뀌지 않았으면 서버에 못 올린 이 브라우저 편집을 연다', async () => {
    // 왜: 정상 경로 고정 — 서버 저장이 잠시 실패한 동안 고친 것은 이 브라우저에만 있다. 서버 것을 열면 그 고침이 사라진다.
    server = { state: edit(['shot-1', 'shot-2']), updatedAt: at(10) }
    await openLikePage()
    putDown = true
    await editAndWait()
    expect(puts).toHaveLength(0)
    putDown = false
    await openLikePage()
    expect(subtitleOf('shot-1', useEditorStore.getState())).toBe('고친 자막')
  })

  it('이번 고침 전에 이 브라우저에 저장된 편집은 지금처럼 이 브라우저 것을 연다', async () => {
    // 왜: E2b 로 서버 편집이 처음 상태 · 빈 편집으로 덮인 프로젝트가 있다(운영 3945d1e6). 견줄 표시가 없는 옛 저장본은 이 브라우저 것이 진짜 편집이다.
    localStorage.setItem(LOCAL_KEY, JSON.stringify(edit(['shot-2', 'shot-1'])))
    server = { state: edit(['shot-1', 'shot-2']), updatedAt: at(20) }
    await openLikePage()
    expect(order()).toEqual(['shot-2', 'shot-1'])
  })

  it('서버 편집을 읽지 못해도 이 브라우저 편집으로 열고, 서버가 돌아왔을 때 그 사이 다른 곳에서 저장한 것이 없으면 고친 것을 서버에 저장한다', async () => {
    // 왜: 정상 경로 고정 — 서버가 잠시 고장 나도 이 브라우저 편집으로 일하고, 서버가 돌아오면 그대로 올라가야 다른 기기에서도 보인다.
    localStorage.setItem(LOCAL_KEY, JSON.stringify(edit(['shot-2', 'shot-1'])))
    rememberServerSeenAt('project-1', at(10))
    server = 'down'
    await openLikePage()
    expect(order()).toEqual(['shot-2', 'shot-1'])
    server = { state: edit(['shot-1', 'shot-2']), updatedAt: at(10) }
    await editAndWait()
    const last = puts[puts.length - 1]
    expect(last.clipOrder['scene-1']).toEqual(['shot-2', 'shot-1'])
    expect(subtitleOf('shot-1', last)).toBe('고친 자막')
  })

  it('서버 편집을 읽지 못하고 이 브라우저 편집으로 연 화면도, 서버가 돌아왔을 때 다른 브라우저가 더 나중에 저장했으면 덮지 않는다', async () => {
    // 왜: 이 브라우저가 마지막으로 본 뒤에 다른 브라우저가 고친 편집을 덮으면 그 고침이 사라진다(E2b). 여는 규칙과 같게 견준다.
    localStorage.setItem(LOCAL_KEY, JSON.stringify(edit(['shot-2', 'shot-1'])))
    rememberServerSeenAt('project-1', at(10))
    server = 'down'
    await openLikePage()
    const elsewhere = edit(['shot-1'])
    server = { state: elsewhere, updatedAt: at(20) }
    await editAndWait()
    expect(puts).toHaveLength(0)
    expect(server).toEqual({ state: elsewhere, updatedAt: at(20) })
  })

  it('이 브라우저 편집이 망가져 되살리지 못해도 서버에 샷이 있는 편집이 있으면 그것을 연다', async () => {
    // 왜: 망가진 저장본 때문에 처음 상태로 열면 그것을 서버에 써서 서버 편집까지 잃는다.
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...edit(['shot-2', 'shot-1']), audioClips: 'broken' }))
    server = { state: edit(['shot-1']), updatedAt: at(10) }
    await openLikePage()
    expect(order()).toEqual(['shot-1'])
  })
})

describe('다른 브라우저에서 올린 소리 파일', () => {
  it('다른 브라우저에서 올린 소리 파일이 이 브라우저에 없으면 자리와 파형은 남고 소리만 나지 않는다', async () => {
    // 왜: 올린 소리 파일은 올린 브라우저에만 있다(서버 보관은 3단계). 자리까지 지우면 그 브라우저로 돌아가도 음악 배치가 사라진다.
    const music: AudioTrackClip = { id: 'music', name: 'rain.wav', url: 'blob:http://other/1', blobKey: 'blob-music', startSec: 2, durationSec: 6, volume: 1, muted: false, peaks: [0.3, 0.4], trackId: 'atrack_1', linkedShotId: null }
    const saved = edit(['shot-1'])
    server = { state: { ...saved, audioClips: [...saved.audioClips, music] }, updatedAt: at(10) }
    await openLikePage()
    const st = useEditorStore.getState()
    const restored = st.audioClips.find((a) => a.id === 'music')
    expect(restored).toMatchObject({ startSec: 2, peaks: [0.3, 0.4], blobKey: 'blob-music' })
    expect(draftAudioClips(st.audioClips, st.audioTracks).map((a) => a.id)).not.toContain('music')
  })
})

describe('서버를 못 읽고 연 화면의 뒤처리 (검토 c, 2026-11-14)', () => {
  const SET_ASIDE_KEY = 'tale:editor:v1:set-aside:project-1'
  const noticeText = () => translate('en', "There are edits saved in another browser. Changes you make here won't be saved to the server.")

  it('서버를 못 읽고 처음 상태로 연 브라우저를 다시 열면, 그 사이 서버에 있는 다른 브라우저 편집을 연다 — 처음 상태로 덮지 않는다', async () => {
    // 왜: 검토 c 재현 — 서버 고장 중 B 처음 열기 → 서버 회복 · A 편집이 서버에 있음 → 알림대로 B 를 다시 열면 B 의 처음 상태가 열리고,
    //   영상 길이 재기로 클립이 바뀌면 1.5초 뒤 서버에 써서 A 편집이 사라졌다. 처음 상태로 열 때 "본 시각"을 아주 옛 값으로 적어 둔다.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    server = 'down'
    const opening = openLikePage()
    await vi.advanceTimersByTimeAsync(2_000)
    await opening
    vi.useRealTimers()
    const fromA = edit(['shot-2'])
    server = { state: fromA, updatedAt: at(40) }
    await openLikePage()
    expect(order()).toEqual(['shot-2'])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    useEditorStore.getState().updateVideoClip('shot-2', { actualDurationSec: 3.5 })
    await vi.advanceTimersByTimeAsync(4_000)
    expect((server as { state: PersistedEditor }).state.clipOrder['scene-1']).toEqual(['shot-2'])
  })

  it('서버가 끝내 돌아오지 않은 채 처음 상태로 연 브라우저에서 고친 것도, 나중에 다시 열 때 서버에 있는 다른 브라우저 편집을 덮지 않는다', async () => {
    // 왜: 알림이 뜰 일이 없었어도(서버가 그 화면 동안 계속 고장) 한 번 고친 것이 이 브라우저에 남아, 다음에 열 때 그것을 서버에 써서 A 편집을 지웠다.
    server = 'down'
    await openLikePage()
    await editAndWait()
    server = { state: edit(['shot-2']), updatedAt: at(40) }
    await openLikePage()
    expect(order()).toEqual(['shot-2'])
    await editAndWait()
    expect(puts.every((p) => p.clipOrder['scene-1'].join() === 'shot-2')).toBe(true)
  })

  it('서버를 못 읽고 연 화면은 쓰기 직전 다시 읽기도 실패하면 서버에 쓰지 않고, 다시 읽을 수 있을 때까지 뒤에서 다시 시도한다', async () => {
    // 왜: 열 때 · 쓰기 직전 읽기가 둘 다 끊겼다가 돌아오면 첫 저장이 처음 상태로 다른 브라우저 편집을 덮었다(검토 c 낮음 1). 이 브라우저에는 저장되니 잃는 것은 없다.
    getDown = true
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const opening = openLikePage()
    await vi.advanceTimersByTimeAsync(12_000)
    await opening
    expect(puts).toHaveLength(0)
    getDown = false
    await vi.advanceTimersByTimeAsync(6_000)
    expect(puts.length).toBeGreaterThan(0)
  })

  it('서버를 못 읽고 연 화면이 서버가 돌아와 한 번 저장한 뒤에는, 다음 저장 때 자기 저장을 다른 브라우저 편집으로 보지 않는다', async () => {
    // 왜: 검토 c 낮음 2 — 읽기만 끊긴 동안 쓴 뒤 '못 읽고 엶' 표시가 남아, 다음 다시 읽기에서 자기 저장을 남의 것으로 보고 알린 뒤 서버 쓰기를 멈췄다.
    getDown = true
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const opening = openLikePage()
    await vi.advanceTimersByTimeAsync(12_000)
    await opening
    useEditorStore.getState().setSubtitle('shot-1', { text: '첫 고침' })
    await vi.advanceTimersByTimeAsync(4_000)
    getDown = false
    await vi.advanceTimersByTimeAsync(6_000)
    const first = puts.length
    expect(first).toBeGreaterThan(0)
    useEditorStore.getState().setSubtitle('shot-2', { text: '두 번째 고침' })
    await vi.advanceTimersByTimeAsync(4_000)
    vi.useRealTimers()
    expect(puts.length).toBeGreaterThan(first)
    expect(puts[puts.length - 1].shots.find((x) => x.shotId === 'shot-2')?.subtitle?.text).toBe('두 번째 고침')
    expect(mocks.toast.warning.mock.calls.filter(([text]) => text === noticeText())).toHaveLength(0)
  })

  it('다른 브라우저 편집 때문에 서버 쓰기를 멈추면 "여기서 고친 것은 서버에 저장되지 않아요"라고 알리고, [다시 열기]를 누르면 서버 편집으로 다시 연다', async () => {
    // 왜: 검토 c 낮음 3 — 예전 알림은 다시 열면 그 화면에서 고친 것이 사라진다는 말을 하지 않았다. 다시 열기를 바로 누를 수 있게 한다.
    server = 'down'
    await openLikePage()
    server = { state: edit(['shot-2']), updatedAt: at(40) }
    await editAndWait()
    const call = mocks.toast.warning.mock.calls.find(([text]) => text === noticeText())
    expect(call).toBeDefined()
    const action = (call![1] as { action: { label: string; onClick: () => void } }).action
    expect(action.label).toBe(translate('en', 'Reopen'))
    const before = useEditorStore.getState().resetCount
    action.onClick()
    expect(useEditorStore.getState().resetCount).toBe(before + 1)
    await openLikePage()
    expect(order()).toEqual(['shot-2'])
  })

  it('서버 편집이 이겨 이 브라우저 편집 대신 열릴 때는, 이 브라우저 편집을 따로 칸에 한 벌 남겨 둔다', async () => {
    // 왜: 다른 곳 편집을 연 뒤 이 브라우저 편집은 덮인다 — 알림 뒤에 고친 것 · 서버에 못 올린 고침을 되살릴 길을 남긴다(검토 c 낮음 3 · A6).
    const mine = edit(['shot-1', 'shot-2'], { shots: [{ ...shot('shot-1'), subtitle: { text: '내 고침', x: 0.5, y: 0.9 } }, shot('shot-2')] })
    localStorage.setItem(LOCAL_KEY, JSON.stringify(mine))
    rememberServerSeenAt('project-1', at(10))
    server = { state: edit(['shot-2']), updatedAt: at(20) }
    await openLikePage()
    expect(order()).toEqual(['shot-2'])
    const kept = JSON.parse(localStorage.getItem(SET_ASIDE_KEY) ?? 'null') as PersistedEditor
    expect(kept.clipOrder['scene-1']).toEqual(['shot-1', 'shot-2'])
    expect(kept.shots[0].subtitle?.text).toBe('내 고침')
  })

  it('두 브라우저 모두 고침 전 저장본이 있어도, 고침 뒤 화면이 서버에 저장한 편집이 있으면 이 브라우저의 옛 저장본 대신 그 편집을 연다', async () => {
    // 왜: 검토 c (A6 다듬기) — 배포 뒤 A 가 고쳐 서버에 쓴 뒤 B 가 열면 B 의 옛 것이 열리고 길이 재기만으로 서버에 써서 A 고침이 사라졌다.
    //   고침 뒤 화면이 쓴 저장본에는 그 표시가 있다. 표시가 없을 때만 예전처럼 이 브라우저 것이 먼저다(E2b 로 비워진 프로젝트 되살리기).
    localStorage.setItem(LOCAL_KEY, JSON.stringify(edit(['shot-1', 'shot-2'])))
    server = { state: { ...edit(['shot-2']), serverAware: true }, updatedAt: at(20) }
    await openLikePage()
    expect(order()).toEqual(['shot-2'])
    expect(JSON.parse(localStorage.getItem(SET_ASIDE_KEY) ?? 'null').clipOrder['scene-1']).toEqual(['shot-1', 'shot-2'])
    // 고침 뒤 화면이 쓰는 저장본에는 그 표시가 들어간다.
    await editAndWait()
    expect(puts[puts.length - 1].serverAware).toBe(true)
  })

  it('서버가 비어 있던 프로젝트를 다른 기기에서 먼저 열기만 해도(처음 상태 · 길이 재기 · 소리 나누기만 저장), 진짜 편집을 가진 브라우저가 나중에 열면 자기 편집이 열리고 따로 칸으로 밀리지 않는다', async () => {
    // 왜: 재검토 c 2/2 — 열 때 저절로 생긴 저장에도 "고침 뒤 화면이 쓴 저장본" 표시가 붙어, 3945d1e6 처럼 서버가 비어 있던 프로젝트를
    //   다른 기기에서 열기만 해도 진짜 편집을 가진 브라우저의 편집이 따로 칸으로 밀렸다. 표시는 사람이 고친 뒤의 저장에만 붙인다.
    await openLikePage()
    vi.useFakeTimers()
    useEditorStore.getState().updateVideoClip('shot-1', { actualDurationSec: 3.9 })
    await vi.advanceTimersByTimeAsync(4_000)
    vi.useRealTimers()
    expect(puts.length).toBeGreaterThan(1)
    expect(puts.some((p) => p.serverAware)).toBe(false)
    localStorage.clear()
    localStorage.setItem(LOCAL_KEY, JSON.stringify(edit(['shot-2', 'shot-1'])))
    await openLikePage()
    expect(order()).toEqual(['shot-2', 'shot-1'])
    expect(localStorage.getItem(SET_ASIDE_KEY)).toBeNull()
  })

  it('다른 기기에서 연 뒤 사람이 한 번이라도 고쳐 저장했으면, 그 서버 편집이 고침 전 저장본보다 먼저 열린다', async () => {
    // 왜: A6 그대로 — 고침 뒤에 사람이 고친 편집이 다른 브라우저의 고침 전 저장본에 가려지면 그 브라우저 저장이 서버 고침을 덮는다.
    await openLikePage()
    await editAndWait()
    expect(puts[puts.length - 1].serverAware).toBe(true)
    localStorage.clear()
    localStorage.setItem(LOCAL_KEY, JSON.stringify(edit(['shot-2', 'shot-1'])))
    await openLikePage()
    expect(order()).toEqual(['shot-1', 'shot-2'])
    expect(subtitleOf('shot-1', useEditorStore.getState())).toBe('고친 자막')
  })

  it('사람이 고친 서버 편집을 연 기기가 길이 재기만 저장해도, 그 저장본은 여전히 고침 전 저장본보다 먼저 열린다', async () => {
    // 왜: 표시는 편집 내용을 따라간다 — 길이 재기 저장에서 표시가 빠지면 세 번째 브라우저의 고침 전 저장본이 이겨, 서버에 실린 사람 고침을
    //   그 브라우저 저장이 덮는다.
    server = { state: { ...edit(['shot-2']), serverAware: true }, updatedAt: at(20) }
    await openLikePage()
    vi.useFakeTimers()
    useEditorStore.getState().updateVideoClip('shot-2', { actualDurationSec: 3.9 })
    await vi.advanceTimersByTimeAsync(4_000)
    vi.useRealTimers()
    expect(puts.length).toBeGreaterThan(0)
    expect(puts[puts.length - 1].serverAware).toBe(true)
    localStorage.clear()
    localStorage.setItem(LOCAL_KEY, JSON.stringify(edit(['shot-1', 'shot-2'])))
    await openLikePage()
    expect(order()).toEqual(['shot-2'])
  })
})

