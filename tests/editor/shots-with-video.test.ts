// Editor 타임라인에는 영상이 있는 샷만 컷으로 들어오고 빈 칸이 깔리지 않으며, 나중에 영상이 생긴 샷은 제자리에 들어오는지 검사한다 (오너 답 8 "Editor에 영상이 있는 샷만 넣어줘", 2026-11-14)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // 저장 · 불러오기는 브라우저에서만 돈다 — window 를 먼저 둔다(localStorage 는 vitest.setup 의 대역).
  ;(globalThis as { window?: unknown }).window = globalThis
  return {
    createClient: vi.fn(),
    loadShotsResult: vi.fn(),
    cancelShotsLoad: vi.fn(),
    projectId: 'project-8' as string | null,
    toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
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

import { saveEditorNow, selectTimelineLayout, useEditorStore } from '@/stores/editor-store'
import { finishEditorOpen } from '@/features/editor/open-editor'
import { translate } from '@/lib/i18n/translate'
import { useLocaleStore } from '@/stores/locale-store'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

const LOCAL_KEY = 'tale:editor:v1:project-8'
const api = () => useEditorStore.getState()

function query(result: Promise<unknown>) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    abortSignal: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => result.then(resolve, reject),
  }
  return chain
}
const TYPES: Record<string, string> = { s1: 'WS', s2: 'CU', s3: 'MS', s4: 'MCU' }
/** DB 를 정한다 — withVideo 에 든 샷만 영상(완료 Take)이 있다. 영상 주소에 version 을 붙여 다시 만든 영상을 흉내 낸다. */
function db(ids: string[], withVideo: string[], version = 1, extra: Record<string, Record<string, unknown>> = {}) {
  const shots = ids.map((id) => ({ shot_id: id, scene_id: 'scene-1', shot_type: TYPES[id], duration_seconds: 4, ...extra[id] }))
  const clips = withVideo.map((id, i) => ({ id: `clip-${id}`, shot_id: id, url: `https://video.test/${id}-v${version}.mp4`, status: 'completed', is_final: true, take_number: 1, created_at: `2026-11-14T00:0${i}:00Z`, deleted_at: null, thumbnail_url: null }))
  mocks.loadShotsResult.mockReturnValue(Promise.resolve({ data: shots, error: null }))
  mocks.createClient.mockReturnValue({ from: vi.fn(() => query(Promise.resolve({ data: clips, error: null }))) })
}
const shot = (id: string): Shot => ({ shotId: id, sceneId: 'scene-1', shotType: TYPES[id] ?? 'MS', actionDescription: '', characters: [], durationSeconds: 4, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
const clip = (id: string, url: string | null): VideoClip => ({ shotId: id, url, status: url ? 'completed' : 'pending', thumbnailUrl: null })
/** 지난번에 저장해 둔 편집 — videoAt 은 저장할 때 영상이 있던 샷(그 영상 주소). */
function savedEdit(order: string[], videoAt: Record<string, string | null>, extra: Partial<PersistedEditor> = {}): PersistedEditor {
  const ids = Object.keys(videoAt)
  return {
    version: 1,
    shots: ids.map(shot),
    clipOrder: { 'scene-1': order },
    videoClips: ids.map((id) => clip(id, videoAt[id])),
    audioClips: [],
    audioSources: [],
    audioTracks: [{ id: 'atrack_1' }],
    panelSizes: { sourceW: 256, previewH: 360 },
    ...extra,
  }
}
/** 화면(page.tsx)의 여는 순서 그대로 — 처음이면 영상마다 소리를 나누어 놓는다. */
async function open() {
  api().reset()
  api().setEditorPrep({ done: 0, total: 0 })
  await api().loadData()
  const restored = await api().loadPersisted()
  await finishEditorOpen({
    projectId: mocks.projectId,
    restored,
    isCancelled: () => false,
    audioName: (shotType) => `${shotType ?? 'Video'} audio`,
    measureClips: async () => {},
    decodeAudio: async () => ({ durationSec: 4, peaks: [0.5, 0.5] }),
  })
  api().setEditorPrep(null)
}
const order = () => api().clipOrder['scene-1']

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  useLocaleStore.setState({ locale: 'en' })
  // 서버 저장본은 없다(E2b 읽기는 빈 답).
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  mocks.projectId = 'project-8'
})
afterEach(() => {
  vi.unstubAllGlobals()
  ;(globalThis as { window?: unknown }).window = globalThis
  localStorage.clear()
})

describe('처음 열 때', () => {
  it('처음 열면 영상이 있는 샷만 타임라인 컷이 되고, 영상 없는 샷은 빈 칸으로 깔리지 않는다', async () => {
    // 왜: 영상 5/10 상태로 넘기면 빈 회색 칸 5개가 타임라인에 그대로 깔렸다(40초) — 디자이너 실제 화면 확인 N 353:351, 오너 답 8.
    db(['s1', 's2', 's3'], ['s1', 's3'])
    await open()
    expect(order()).toEqual(['s1', 's3'])
    expect(selectTimelineLayout(api()).map((l) => l.shotId)).toEqual(['s1', 's3'])
    // 영상 없는 샷도 소스 칸에는 그대로 있다(상태 낱말로 보인다).
    expect(api().shots.map((s) => s.shotId)).toEqual(['s1', 's2', 's3'])
  })
})

describe('다시 열 때', () => {
  it('넘길 때 영상이 없던 샷에 나중에 영상이 생기면, 다음에 열 때 그 샷도 타임라인에 들어온다', async () => {
    // 왜: 오너 답 8(1단계 글자대로) — 영상이 생겼으니 이제 Editor 에 들어간다. 고장이 아니라 Director 에서 남은 영상을 만든 뒤 Editor 로 돌아올 때.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    // 새 저장본 — 영상이 없던 s2 는 저절로 빠져 있었고 사람이 뺀 샷은 없다.
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s1', 's3'], { s1: 'https://video.test/s1-v1.mp4', s2: null, s3: 'https://video.test/s3-v1.mp4' }, { removedShotIds: [] })))
    await open()
    expect(order()).toEqual(['s1', 's2', 's3'])
  })

  it('새로 영상이 생긴 샷은 이야기 순서의 제자리 — 같은 장면에서 바로 앞 샷 뒤 — 에 들어온다', async () => {
    // 왜: 장면 끝에 붙으면 이야기 순서가 틀린 채로 내보내질 수 있다. 사람이 순서를 바꿔 두었어도 앞 샷 바로 뒤가 가장 가까운 제자리다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s3', 's1'], { s1: 'https://video.test/s1-v1.mp4', s2: null, s3: 'https://video.test/s3-v1.mp4' }, { removedShotIds: [] })))
    await open()
    expect(order()).toEqual(['s3', 's1', 's2'])
  })

  it('앞 샷이 타임라인에 없으면 새로 영상이 생긴 샷은 장면의 첫 샷 앞에 들어온다 — 맨 앞의 타이틀 카드는 그대로 맨 앞이다', async () => {
    // 왜: 장면 첫 샷의 영상이 늦게 생겼을 때 그 샷이 장면 끝으로 가면 이야기가 뒤집힌다. 맨 앞에 넣어 둔 제목 카드는 제목으로 남아야 한다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    const title = { ...shot('title__tab12'), titleCard: { text: '제목', imageUrl: null } } as Shot
    const saved = savedEdit(['title__tab12', 's2', 's3'], { s1: null, s2: 'https://video.test/s2-v1.mp4', s3: 'https://video.test/s3-v1.mp4' }, { removedShotIds: [] })
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...saved, shots: [...saved.shots, title], videoClips: [...saved.videoClips, clip('title__tab12', null)] }))
    await open()
    expect(order()).toEqual(['title__tab12', 's1', 's2', 's3'])
  })

  it('저장해 둔 편집을 다시 열 때도 영상 없는 샷(예전 저장본의 빈 칸)은 타임라인에 두지 않는다', async () => {
    // 왜: 이번 고침 전에 저장한 편집에는 영상 없는 샷이 빈 칸으로 들어 있다 — 다시 열어도 빈 칸이 남으면 고친 보람이 없다.
    db(['s1', 's2', 's3'], ['s1', 's3'])
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s1', 's2', 's3'], { s1: 'https://video.test/s1-v1.mp4', s2: null, s3: 'https://video.test/s3-v1.mp4' })))
    await open()
    expect(order()).toEqual(['s1', 's3'])
  })

  it('들어온 샷과 저장 뒤 새로 생긴 샷은 그 영상 소리도 오디오 칸에 이어서 놓인다', async () => {
    // 왜: 처음 열 때처럼 영상과 소리가 함께 움직여야 한다(오너 2026-11-10 결정 4). 예전에는 새로 들어온 샷이 소리 없이 들어왔다.
    db(['s1', 's2', 's3', 's4'], ['s1', 's2', 's3', 's4'])
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s1', 's3'], { s1: 'https://video.test/s1-v1.mp4', s2: null, s3: 'https://video.test/s3-v1.mp4' }, { removedShotIds: [] })))
    await open()
    expect(order()).toEqual(['s1', 's2', 's3', 's4'])
    const layout = selectTimelineLayout(api())
    for (const id of ['s2', 's4']) {
      const audio = api().audioClips.find((a) => a.linkedShotId === id)
      expect(audio, id).toMatchObject({ url: `https://video.test/${id}-v1.mp4`, startSec: layout.find((l) => l.shotId === id)!.startSec, name: `${TYPES[id]} audio` })
    }
    // 새로 놓은 소리는 사람이 고친 것이 아니다 — 되돌리기 칸에 남지 않는다.
    expect(api().past).toEqual([])
  })

  it('사람이 타임라인에서 뺀 샷은 영상을 다시 만들어도 저절로 돌아오지 않는다', async () => {
    // 왜: 약속 "다시 들어와도 타임라인에서 지운 클립은 되살아나지 않는다"와 같다 — 뺄 때 영상이 있던 샷은 사람이 뺀 것이다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'], 2)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s1', 's3'], { s1: 'https://video.test/s1-v1.mp4', s2: 'https://video.test/s2-v1.mp4', s3: 'https://video.test/s3-v1.mp4' })))
    await open()
    expect(order()).toEqual(['s1', 's3'])
  })

  it('영상 파일이 없어진 샷은 잘라 낸 조각까지 타임라인에서 빠지고, 타이틀 카드는 영상이 없어도 그대로 남는다', async () => {
    // 왜: 빈 칸 없음(오너 답 8) — 잘라 낸 조각도 원본 영상을 이어 받아 재생하므로 원본 영상이 없으면 빈 칸이 된다. 고장: Director 에서 Take 를 지운 뒤.
    db(['s1', 's2'], ['s2'])
    const title = { ...shot('title__tab12'), titleCard: { text: '끝', imageUrl: null } } as Shot
    const saved = savedEdit(['s1', 's1__cpiece', 's2', 'title__tab12'], { s1: 'https://video.test/s1-v1.mp4', s2: 'https://video.test/s2-v1.mp4' })
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      ...saved,
      shots: [...saved.shots, shot('s1__cpiece'), title],
      videoClips: [...saved.videoClips, clip('s1__cpiece', 'https://video.test/s1-v1.mp4'), clip('title__tab12', null)],
    }))
    await open()
    expect(order()).toEqual(['s2', 'title__tab12'])
  })
})

describe('소스 칸에서 더하기', () => {
  it('영상 없는 샷은 소스 칸에서 타임라인으로 끌어 놓거나 더할 수 없다', async () => {
    // 왜: 빈 칸이 다시 생기지 않게(오너 답 8). 예전에는 영상 없는 샷 카드를 끌어 놓으면 빈 칸이 생겼다.
    db(['s1', 's2'], ['s1'])
    await open()
    api().addClipAtPlayhead('s2')
    expect(api().addClipInstanceAt('s2', 0)).toBeNull()
    expect(order()).toEqual(['s1'])
    // 화면: 영상 없는 카드는 끌기를 시작하지 않고, [타임라인에 넣기]가 꺼져 있다.
    const panel = readFileSync('src/features/editor/video-source-panel.tsx', 'utf8')
    expect(panel).toMatch(/onPointerDown=\{hasVideo \? \(e\) =>/)
    expect(panel).toMatch(/disabled=\{!hasVideo\}/)
  })
})

describe('저절로 빠지고 들어오는 샷 (검토 c, 2026-11-14)', () => {
  const save = () => saveEditorNow('project-8')
  const audioOf = (shotId: string) => api().audioClips.find((a) => a.linkedShotId === shotId)

  it('사람이 뺀 샷은 그 뒤 영상이 지워졌다가 다시 생겨도 돌아오지 않는다', async () => {
    // 왜: 검토 c 재현 — 영상 있던 s2 를 사람이 뺌 → Director 에서 s2 Take 를 모두 지움 → Editor 열고 저장 → s2 영상을 다시 만들고 열면
    //   s2 가 돌아왔다(저장 때 영상 주소가 비었나로 짐작했다). 사람이 뺀 샷은 저장본에 따로 적는다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    await open()
    api().deleteClip('s2')
    await save()
    db(['s1', 's2', 's3'], ['s1', 's3'])
    await open()
    await save()
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'], 2)
    await open()
    expect(order()).toEqual(['s1', 's3'])
  })

  it('영상 파일이 없어져 저절로 빠진 샷은 사람이 뺀 샷이 아니어서, 영상이 다시 생기면 다시 열 때 돌아온다', async () => {
    // 왜: 리드 — 영상이 없어져 저절로 빠진 것(C8)과 사람이 뺀 것(C6)이 엇갈리면 안 된다. 영상이 다시 생기면 C2 대로 제자리에 들어온다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    await open()
    await save()
    db(['s1', 's2', 's3'], ['s1', 's3'])
    await open()
    expect(order()).toEqual(['s1', 's3'])
    await save()
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'], 2)
    await open()
    expect(order()).toEqual(['s1', 's2', 's3'])
  })

  it('자른 샷의 영상이 없어졌다가 다시 생기면, 그 샷은 조각 없이 전체 길이의 처음 상태로 들어오고 소리도 처음 상태로 놓인다 — 남은 옛 조각은 버린다', async () => {
    // 왜: 검토 c 재현 — 앞 조각(0–2초)만 돌아오고 뒤 조각(2–4초)은 사라졌고, 소리 크기 · 음소거도 처음으로 돌아갔다.
    //   리드 판단: 새로 들어오는 샷은 새 영상이니 처음 상태로 넣고, 샷 목록에만 남는 유령 조각이 없게 한다.
    db(['s1', 's2'], ['s1', 's2'])
    await open()
    api().splitVideoClipAt('s1', 2)
    await save()
    db(['s1', 's2'], ['s2'])
    await open()
    await save()
    db(['s1', 's2'], ['s1', 's2'], 2)
    await open()
    expect(order()).toEqual(['s1', 's2'])
    expect(selectTimelineLayout(api()).find((l) => l.shotId === 's1')?.durationSec).toBe(4)
    expect(api().shots.some((x) => x.shotId.startsWith('s1__'))).toBe(false)
    expect(audioOf('s1')).toMatchObject({ volume: 1, muted: false, url: 'https://video.test/s1-v2.mp4' })
  })

  it('영상이 새로 생겨 들어온 샷은 전에 고친 구간 · 빠르기 없이 처음 상태로 들어오고, 서버의 구간 · 빠르기도 처음으로 되돌린다', async () => {
    // 왜: 새 영상에 옛 영상에 맞춘 구간을 입히면 엉뚱한 부분이 잘린다. 서버(DB)에 남은 옛 구간이 다음에 열 때 다시 입혀지지 않게 한다.
    db(['s1', 's2'], ['s1', 's2'])
    await open()
    await save()
    db(['s1', 's2'], ['s1'], 1, { s2: { trim_start: 1, trim_end: 3, speed: 2 } })
    await open()
    await save()
    db(['s1', 's2'], ['s1', 's2'], 2, { s2: { trim_start: 1, trim_end: 3, speed: 2 } })
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await open()
    await vi.advanceTimersByTimeAsync(1_000)
    vi.useRealTimers()
    const c2 = api().videoClips.find((c) => c.shotId === 's2')
    expect(c2?.trimStart ?? null).toBeNull()
    expect(c2?.trimEnd ?? null).toBeNull()
    expect(c2?.speed ?? 1).toBe(1)
    const bodies = fetchMock.mock.calls.map(([url, init]) => [String(url), JSON.parse(String((init as RequestInit | undefined)?.body ?? 'null'))] as const)
    expect(bodies).toContainEqual(['/api/editor/trim', { projectId: 'project-8', shotId: 's2', trimStart: null, trimEnd: null }])
    expect(bodies).toContainEqual(['/api/editor/speed', { projectId: 'project-8', shotId: 's2', speed: 1 }])
  })

  it('영상이 새로 생겨 들어온 샷은 전에 넣은 모션 · 불투명도 · 영상 효과도 없이 처음 상태로 들어오고, 계속 영상이 있던 샷은 고친 그대로다', async () => {
    // 왜: 검토 c (D) 낮음 1 — 구간 · 빠르기 · 전환만 처음으로 돌려, 새 영상이 옛 영상에 맞춘 자리 · 크기 · 투명도(④) · 효과(⑤)를 이어받았다.
    //   고장이 나는 때: Director 에서 Take 를 지워 영상이 없어진 샷에 새 영상을 만들고 Editor 로 돌아올 때.
    db(['s1', 's2'], ['s1', 's2'])
    await open()
    for (const id of ['s1', 's2']) {
      api().setClipMotion([id], { x: 0.3, scale: 0.5 })
      api().setClipOpacity([id], 0.5)
      api().addVideoEffect(id, 'blackWhite')
    }
    await save()
    db(['s1', 's2'], ['s1'])
    await open()
    await save()
    db(['s1', 's2'], ['s1', 's2'], 2)
    await open()
    const clipOf = (id: string) => api().videoClips.find((c) => c.shotId === id)
    expect(clipOf('s1')).toMatchObject({ motion: { x: 0.3, y: 0, scale: 0.5 }, opacity: 0.5, effects: { blackWhite: true } })
    for (const key of ['motion', 'opacity', 'effects']) expect(clipOf('s2')).not.toHaveProperty(key)
  })

  it('영상이 새로 생겨 들어온 샷의 이어진 소리는 페이드 없이 처음 상태로 놓이고, 계속 영상이 있던 샷의 소리 페이드는 그대로다', async () => {
    // 왜: 리드 결정(11/14) — 새 영상으로 다시 들어온 샷은 옛 영상에 맞춘 꾸밈을 다 비운다: 전체 길이 · 빠르기 1 · 전환 없음 · 모션 없음 ·
    //   불투명도 100% · 효과 없음 · 소리 페이드 없음. 고장이 나는 때: 페이드를 넣은 샷의 Take 를 지웠다가 새로 만들고 Editor 로 돌아올 때.
    db(['s1', 's2'], ['s1', 's2'])
    await open()
    for (const id of ['s1', 's2']) {
      const audio = audioOf(id)!
      api().dropAudioFade(audio.id, 'start')
      api().dropAudioFade(audio.id, 'end')
    }
    // 처음에는 두 샷 소리 모두 페이드가 있다(헛통과가 아니게).
    expect(audioOf('s2')).toMatchObject({ fadeInSec: 1, fadeOutSec: 1 })
    await save()
    db(['s1', 's2'], ['s1'])
    await open()
    await save()
    db(['s1', 's2'], ['s1', 's2'], 2)
    await open()
    expect(audioOf('s1')).toMatchObject({ fadeInSec: 1, fadeOutSec: 1 })
    expect(audioOf('s2')?.url).toBe('https://video.test/s2-v2.mp4')
    expect(audioOf('s2')).not.toHaveProperty('fadeInSec')
    expect(audioOf('s2')).not.toHaveProperty('fadeOutSec')
  })

  it('영상 자리가 저절로 바뀌면 그 자리 뒤에서 시작하는 사람이 놓은 소리도 같은 만큼 옮기고, 그 자리 전부터 깔린 소리는 그대로 둔다', async () => {
    // 왜: 검토 c — 고침 전 저장본을 처음 열 때 빈 칸이 빠지며 뒤 컷만 당겨지고 효과음 · 음악은 제자리라 어긋났다(되돌리기 칸도 비어 되돌릴 수 없다).
    //   영상이 생긴 샷이 들어올 때는 반대로 어긋났다. 리드 판단: 2단계 ㉠ "뒤 모든 줄을 같이 민다"와 같은 원칙.
    const sfx = (startSec: number): AudioTrackClip => ({ id: 'sfx', name: 'door.wav', url: 'blob:sfx', startSec, durationSec: 1, volume: 1, muted: false, trackId: 'atrack_1', linkedShotId: null })
    const bgm: AudioTrackClip = { id: 'bgm', name: 'bgm.mp3', url: 'blob:bgm', startSec: 0, durationSec: 30, volume: 1, muted: false, trackId: 'atrack_1', linkedShotId: null }
    // 고침 전 저장본 — 영상 없는 s2 가 빈 칸으로 4~8초에 있었고, 효과음은 s3 시작(8초)에 맞춰 두었다.
    db(['s1', 's2', 's3'], ['s1', 's3'])
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s1', 's2', 's3'], { s1: 'https://video.test/s1-v1.mp4', s2: null, s3: 'https://video.test/s3-v1.mp4' }, { audioClips: [bgm, sfx(8)] })))
    await open()
    expect(selectTimelineLayout(api()).map((l) => [l.shotId, l.startSec])).toEqual([['s1', 0], ['s3', 4]])
    expect(api().audioClips.find((a) => a.id === 'sfx')?.startSec).toBe(4)
    expect(api().audioClips.find((a) => a.id === 'bgm')?.startSec).toBe(0)
    // 영상이 생긴 s2 가 들어오면 효과음도 s3 를 따라 다시 8초로.
    await save()
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    await open()
    expect(selectTimelineLayout(api()).map((l) => [l.shotId, l.startSec])).toEqual([['s1', 0], ['s2', 4], ['s3', 8]])
    expect(api().audioClips.find((a) => a.id === 'sfx')?.startSec).toBe(8)
    expect(api().audioClips.find((a) => a.id === 'bgm')?.startSec).toBe(0)
  })

  it('영상 자리가 저절로 바뀌면 열 때 한 번 "영상 없는 샷 N개가 빠져 뒤 컷과 소리를 옮겼어요"라고 알린다', async () => {
    // 왜: 사람이 하지 않은 일로 자리가 바뀌었는데 말이 없으면 왜 어긋났는지 모른다. 들어온 쪽도 같은 꼴로 알린다.
    db(['s1', 's2', 's3'], ['s1', 's3'])
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s1', 's2', 's3'], { s1: 'https://video.test/s1-v1.mp4', s2: null, s3: 'https://video.test/s3-v1.mp4' })))
    useLocaleStore.setState({ locale: 'ko' })
    await open()
    expect(mocks.toast.info).toHaveBeenCalledTimes(1)
    expect(mocks.toast.info).toHaveBeenCalledWith(translate('ko', 'Shots without video ({count}) were taken out, so the cuts and sounds after them moved.', { count: 1 }))
    mocks.toast.info.mockClear()
    await save()
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    await open()
    expect(mocks.toast.info).toHaveBeenCalledWith(translate('ko', 'New shots ({count}) came in, so the cuts and sounds after them moved.', { count: 1 }))
  })

  it('최종 Take 가 바뀌면 다시 열 때 이어진 소리도 새 영상의 소리로 바뀐다 — 사람이 바꾼 소리 크기 · 음소거는 남는다', async () => {
    // 왜: 검토 c — ★ 최종 Take 가 바뀌면 Editor 는 새 영상에 옛 Take 의 소리를 틀었고, 내보낸 영상에도 옛 소리가 실렸다.
    db(['s1', 's2'], ['s1', 's2'])
    await open()
    const id = api().audioClips.find((a) => a.linkedShotId === 's1')!.id
    api().setAudioVolume(id, 0.6)
    api().toggleAudioMute(id)
    await save()
    db(['s1', 's2'], ['s1', 's2'], 2)
    await open()
    expect(audioOf('s1')).toMatchObject({ url: 'https://video.test/s1-v2.mp4', volume: 0.6, muted: true })
    expect(audioOf('s2')?.url).toBe('https://video.test/s2-v2.mp4')
  })
})

describe('다른 장면으로 옮긴 샷 (재검토 c, 2026-11-14)', () => {
  const save = () => saveEditorNow('project-8')
  const SCENES = { s3: { scene_id: 'scene-2' }, s4: { scene_id: 'scene-2' } }
  /** 서버에 구간 · 빠르기를 처음으로 되돌리라고 보낸 요청. */
  const resets = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls
      .map(([url, init]) => [String(url), JSON.parse(String((init as RequestInit | undefined)?.body ?? 'null'))] as const)
      .filter(([url, body]) => (url === '/api/editor/trim' && body?.trimStart === null) || (url === '/api/editor/speed' && body?.speed === 1))
  async function reopenWatching() {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await open()
    await vi.advanceTimersByTimeAsync(1_000)
    vi.useRealTimers()
    return fetchMock
  }
  const timelineIds = () => selectTimelineLayout(api()).map((l) => l.shotId)
  const trimOf = (shotId: string) => {
    const c = api().videoClips.find((x) => x.shotId === shotId)
    return [c?.trimStart ?? null, c?.trimEnd ?? null]
  }

  it('클립을 다른 장면으로 옮겨 저장한 뒤 다시 열어도, 그 샷은 옮긴 자리에 한 번만 있고 고친 구간 그대로다', async () => {
    // 왜: 재검토 c(H3) — 다시 열면 옮긴 샷을 '영상이 새로 생긴 샷'으로 보고 원래 장면에 한 번 더 깔았고(4초 · 12초 두 번),
    //   구간 · 빠르기를 서버까지 처음으로 되돌렸다. 저장한 어느 장면 순서에든 있는 샷은 새로 들이지 않는다.
    db(['s1', 's2', 's3', 's4'], ['s1', 's2', 's3', 's4'], 1, SCENES)
    await open()
    api().setTrim('s2', 1, 3)
    api().moveClipToIndex('s2', 2)
    await save()
    // 손잡이로 바꾼 구간은 서버(DB)에도 적혀 있다.
    db(['s1', 's2', 's3', 's4'], ['s1', 's2', 's3', 's4'], 1, { ...SCENES, s2: { trim_start: 1, trim_end: 3 } })
    const fetchMock = await reopenWatching()
    expect(api().clipOrder).toEqual({ 'scene-1': ['s1'], 'scene-2': ['s3', 's2', 's4'] })
    expect(timelineIds()).toEqual(['s1', 's3', 's2', 's4'])
    expect(trimOf('s2')).toEqual([1, 3])
    expect(resets(fetchMock)).toEqual([])
  })

  it('저장한 뒤 Writer 에서 샷의 장면을 바꿔도, 다시 열면 그 샷은 저장한 자리에 한 번만 있고 고친 구간 그대로다', async () => {
    // 왜: 재검토 c(H2) — Writer 에서 장면을 바꾼 샷이 바뀐 장면에 '새로 생긴 샷'으로 한 번 더 깔렸다. Editor 자리는 사람이 정한 그대로 둔다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    await open()
    api().setTrim('s3', 1, 3)
    await save()
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'], 1, { s3: { scene_id: 'scene-2', trim_start: 1, trim_end: 3 } })
    const fetchMock = await reopenWatching()
    expect(timelineIds()).toEqual(['s1', 's2', 's3'])
    expect(trimOf('s3')).toEqual([1, 3])
    expect(resets(fetchMock)).toEqual([])
  })

  it('저장할 때의 장면이 지금은 없으면, 그 장면에 있던 샷은 지금 장면의 이야기 순서 제자리로 들어오고 고친 구간은 그대로다', async () => {
    // 왜: Writer 가 장면을 합치면 저장한 장면 순서가 통째로 남는다 — 그 샷을 빼면 컷이 사라지고(33060feb), 새 영상으로 보면 고친 구간이
    //   서버까지 처음으로 돌아갔다(96da2120). 사람이 고친 샷이니 고친 그대로 이야기 순서 제자리에 둔다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'], 1, { s3: { scene_id: 'scene-2' } })
    await open()
    api().setTrim('s3', 1, 3)
    await save()
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'], 1, { s3: { trim_start: 1, trim_end: 3 } })
    const fetchMock = await reopenWatching()
    expect(order()).toEqual(['s1', 's2', 's3'])
    expect(trimOf('s3')).toEqual([1, 3])
    expect(resets(fetchMock)).toEqual([])
  })

  it('저장 뒤 Writer 에서 새로 생긴 샷이 들어와 자리가 바뀌어도 "샷 N개가 새로 들어와 뒤 컷과 소리를 옮겼어요"라고 알린다', async () => {
    // 왜: 재검토 c 2/2 — 알림이 "영상이 생긴 샷"이라고 했는데 Writer 에서 새로 생긴 샷도 섞여 있었다. 들어온 사실대로 말한다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'], 1, { s3: { scene_id: 'scene-2' } })
    await open()
    await save()
    db(['s1', 's2', 's4', 's3'], ['s1', 's2', 's4', 's3'], 1, { s3: { scene_id: 'scene-2' } })
    useLocaleStore.setState({ locale: 'ko' })
    await open()
    expect(timelineIds()).toEqual(['s1', 's2', 's4', 's3'])
    expect(mocks.toast.info).toHaveBeenCalledTimes(1)
    expect(mocks.toast.info).toHaveBeenCalledWith('샷 1개가 새로 들어와 뒤 컷과 소리를 옮겼어요.')
  })
})
