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

import { selectTimelineLayout, useEditorStore } from '@/stores/editor-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { Shot, VideoClip } from '@/types'

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
function db(ids: string[], withVideo: string[], version = 1) {
  const shots = ids.map((id) => ({ shot_id: id, scene_id: 'scene-1', shot_type: TYPES[id], duration_seconds: 4 }))
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
async function open() {
  api().reset()
  api().setEditorPrep({ done: 0, total: 0 })
  await api().loadData()
  await api().loadPersisted()
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
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s1', 's3'], { s1: 'https://video.test/s1-v1.mp4', s2: null, s3: 'https://video.test/s3-v1.mp4' })))
    await open()
    expect(order()).toEqual(['s1', 's2', 's3'])
  })

  it('새로 영상이 생긴 샷은 이야기 순서의 제자리 — 같은 장면에서 바로 앞 샷 뒤 — 에 들어온다', async () => {
    // 왜: 장면 끝에 붙으면 이야기 순서가 틀린 채로 내보내질 수 있다. 사람이 순서를 바꿔 두었어도 앞 샷 바로 뒤가 가장 가까운 제자리다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s3', 's1'], { s1: 'https://video.test/s1-v1.mp4', s2: null, s3: 'https://video.test/s3-v1.mp4' })))
    await open()
    expect(order()).toEqual(['s3', 's1', 's2'])
  })

  it('앞 샷이 타임라인에 없으면 새로 영상이 생긴 샷은 장면의 첫 샷 앞에 들어온다 — 맨 앞의 타이틀 카드는 그대로 맨 앞이다', async () => {
    // 왜: 장면 첫 샷의 영상이 늦게 생겼을 때 그 샷이 장면 끝으로 가면 이야기가 뒤집힌다. 맨 앞에 넣어 둔 제목 카드는 제목으로 남아야 한다.
    db(['s1', 's2', 's3'], ['s1', 's2', 's3'])
    const title = { ...shot('title__tab12'), titleCard: { text: '제목', imageUrl: null } } as Shot
    const saved = savedEdit(['title__tab12', 's2', 's3'], { s1: null, s2: 'https://video.test/s2-v1.mp4', s3: 'https://video.test/s3-v1.mp4' })
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
    localStorage.setItem(LOCAL_KEY, JSON.stringify(savedEdit(['s1', 's3'], { s1: 'https://video.test/s1-v1.mp4', s2: null, s3: 'https://video.test/s3-v1.mp4' })))
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
