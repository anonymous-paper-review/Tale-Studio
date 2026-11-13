// Editor 의 Ctrl+K 나누기 · 끌 때 스냅 · 마커가 약속대로 움직이는지 — 나누는 클립, 붙는 자리, 마커 달기 · 지우기 · 저장 · 편집점을 검사한다 (2단계 ③, 시안 E1, 2026-11-14)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-markers' as string | null }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: mocks.projectId }), {
    getState: () => ({ projectId: mocks.projectId }),
  }),
}))

import { saveEditorNow, selectTimelineLayout, selectVideoLayout, useEditorStore } from '@/stores/editor-store'
import { useLocaleStore } from '@/stores/locale-store'
import { editPointTarget } from '@/lib/editor/timeline-segments'
import { draggedIds, makeSnapper, snapTargets } from '@/lib/editor/snap'
import { handleEditorKey } from '@/features/editor/use-editor-playback'
import { RulerMarkers, SnapMarkerButtons } from '@/features/editor/timeline-markers'
import { EDITOR_SHORTCUTS, ShortcutsList } from '@/features/editor/editor-workbar'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

const LOCAL_KEY = 'tale:editor:v1:project-markers'
const api = () => useEditorStore.getState()
const read = (file: string) => readFileSync(file, 'utf8')
const shot = (shotId: string, durationSeconds = 4): Shot =>
  ({ shotId, sceneId: 'sc_1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
const clip = (shotId: string): VideoClip => ({ shotId, url: `https://video.test/${shotId}.mp4`, status: 'completed', thumbnailUrl: null })
const linked = (shotId: string, startSec: number): AudioTrackClip => ({
  id: `a_${shotId}`, name: `${shotId} audio`, url: `https://video.test/${shotId}.mp4`, startSec, durationSec: 4, volume: 1, muted: false,
  sourceOffsetSec: 0, sourceDurationSec: 4, trackId: 'atrack_1', linkedShotId: shotId,
})
const music: AudioTrackClip = { id: 'bgm', name: '잔잔한 피아노.mp3', url: 'blob:bgm', startSec: 0, durationSec: 10, volume: 0.6, muted: false, sourceOffsetSec: 0, sourceDurationSec: 10, trackId: 'atrack_2', linkedShotId: null }

/** A · B · C · D 네 샷(4초씩)을 V1 에 깔고 소리를 잇고, D 를 V2 3초로 올린다 — V1: A 0–4 · B 4–8 · C 8–12, V2: D 3–7, A2: 음악 0–10. */
function seed() {
  api().reset()
  const ids = ['A', 'B', 'C', 'D']
  useEditorStore.setState({
    shots: ids.map((id) => shot(id)),
    videoClips: ids.map(clip),
    clipOrder: { sc_1: [...ids] },
    audioClips: [...ids.map((id, i) => linked(id, i * 4)), music],
    selectedSceneId: 'sc_1',
    loadStatus: 'ready',
  })
  api().moveClipToTrack('D', 'v2', 3)
  useEditorStore.setState({ past: [], future: [] })
}
/** loadData 가 DB 에서 다시 만든 모습 — 원본 샷만 V1 에. */
function canonical() {
  api().reset()
  const ids = ['A', 'B', 'C', 'D']
  useEditorStore.setState({ shots: ids.map((id) => shot(id)), videoClips: ids.map(clip), clipOrder: { sc_1: [...ids] }, loadStatus: 'ready' })
}
const v1 = () => selectTimelineLayout(api()).map((l) => [l.shotId, l.startSec, l.durationSec])
const on = (trackId: string) => selectVideoLayout(api()).filter((l) => l.trackId === trackId).map((l) => [l.shotId, l.startSec, l.durationSec])
const sounds = () => api().audioClips.map((a) => [a.linkedShotId ?? a.id, a.startSec, a.durationSec])
const piece = (from: string) => expect.stringMatching(new RegExp(`^${from}__c`))
/** 키 하나를 누른다 — Editor 가 받는 단축키 처리 그대로. 브라우저 기본 동작을 막았는지 돌려준다. */
function press(key: string, mods: { ctrl?: boolean; shift?: boolean; code?: string } = {}) {
  const preventDefault = vi.fn()
  handleEditorKey({ key, code: mods.code ?? '', ctrlKey: !!mods.ctrl, metaKey: false, shiftKey: !!mods.shift, target: null, preventDefault } as unknown as KeyboardEvent)
  return preventDefault
}
/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(tests/editor/panels.test.ts 와 같은 방법). */
function html(el: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useEditorStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(el)
}
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

beforeEach(() => {
  localStorage.clear()
  mocks.projectId = 'project-markers'
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  useLocaleStore.setState({ locale: 'ko' })
  seed()
})
afterEach(() => {
  vi.unstubAllGlobals()
  ;(globalThis as { window?: unknown }).window = globalThis
  useLocaleStore.setState({ locale: 'en' })
  localStorage.clear()
})

describe('같이 정한 것', () => {
  it('Ctrl+K를 누르면 플레이헤드 자리에서 나뉜다', () => {
    // 왜: 시안 Lumi 안내 416:4930 "자르기(C) · Ctrl+K" · 결정 페이지 G10. 정상 경로 고정 — 이어진 소리도 같은 자리에서 나뉜다(오너 결정 4).
    api().seek(5)
    const prevented = press('k', { ctrl: true })
    // 브라우저의 Ctrl+K(주소창 검색)로 새지 않는다.
    expect(prevented).toHaveBeenCalled()
    expect(v1()).toEqual([['A', 0, 4], ['B', 4, 1], [piece('B'), 5, 3], ['C', 8, 4]])
    expect(sounds()).toContainEqual(['B', 4, 1])
    expect(sounds()).toContainEqual([piece('B'), 5, 3])
  })

  it('스냅이 켜져 있으면 끌 때 경계와 플레이헤드에 붙고, [스냅 켬]으로 끄고 켠다', () => {
    // 왜: 시안 E1 409:4795 [스냅 켬] · 결정 페이지 G12. 정상 경로 고정 — 확대 40(1초 = 40px)에서 8px 는 0.2초다.
    const targets = snapTargets({ currentTime: 5, markers: [], videoLayout: selectVideoLayout(api()), audioClips: api().audioClips })
    const snapOn = makeSnapper(true, targets, 40)
    expect(snapOn.start(7.85, 2)).toBe(8) // 시작이 C 시작(8)에
    expect(snapOn.start(5.9, 2)).toBe(6) // 끝이 C 시작(8)에
    expect(snapOn.start(5.15, 2)).toBe(5) // 플레이헤드에
    expect(snapOn.point(11.9)).toBe(12) // 가장자리 끌기 — C 끝에
    const snapOff = makeSnapper(false, targets, 40)
    expect(snapOff.start(5.15, 2)).toBe(5.15)
    expect(snapOff.point(11.9)).toBe(11.9)
    api().toggleSnap()
    expect(api().snapEnabled).toBe(false)
    api().toggleSnap()
    expect(api().snapEnabled).toBe(true)
    // 단추 글이 지금 상태를 말한다 — 켜져 있으면 고른 칩 모습.
    expect(html(createElement(SnapMarkerButtons, { snapEnabled: true, onToggleSnap: () => {}, onAddMarker: () => {} }))).toMatch(/aria-pressed="true"[^>]*>스냅 켬</)
    expect(html(createElement(SnapMarkerButtons, { snapEnabled: false, onToggleSnap: () => {}, onAddMarker: () => {} }))).toMatch(/aria-pressed="false"[^>]*>스냅 끔</)
    const page = read('src/app/studio/editor/page.tsx')
    expect(page).toMatch(/<SnapMarkerButtons snapEnabled=\{snapEnabled\} onToggleSnap=\{toggleSnap\}/)
    expect(page).toMatch(/snapEnabled=\{snapEnabled\}\s+markers=\{markers\}/)
  })

  it('[마커]를 누르면 플레이헤드 자리에 마커가 생긴다', () => {
    // 왜: 시안 E1 409:4797 [마커] · 결정 페이지 G13. 정상 경로 고정.
    api().seek(4.2)
    api().addMarker()
    expect(api().markers).toEqual([4.2])
    expect(text(html(createElement(SnapMarkerButtons, { snapEnabled: true, onToggleSnap: () => {}, onAddMarker: () => {} })))).toContain('마커')
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/onAddMarker=\{addMarker\}/)
  })

  it('마커는 이름 없이 시각만 남고, 내보낸 영상에는 찍히지 않는다. 되돌리기는 50칸이다', async () => {
    // 왜: 결정 페이지 추천(오너 "나머지는 추천대로") — 마커는 편집하는 사람의 표시다. 되돌리기 50칸은 지금 Editor 그대로(마커도 그 칸을 쓴다).
    api().seek(4.2)
    api().addMarker()
    await saveEditorNow('project-markers')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as PersistedEditor
    expect(saved.markers).toEqual([4.2])
    expect(read('src/lib/editor-draft-render.ts')).not.toMatch(/marker/i)
    expect(read('src/lib/editor-zip-export.ts')).not.toMatch(/marker/i)
    expect(read('src/app/studio/editor/page.tsx')).not.toMatch(/renderDraftTimeline\(\{[^}]*markers/)

    seed()
    for (let sec = 1; sec <= 51; sec++) {
      api().seek(sec)
      api().addMarker()
    }
    expect(api().past).toHaveLength(50)
    for (let i = 0; i < 60; i++) api().undo()
    expect(api().markers).toEqual([1])
  })
})

describe('혼자 정한 것 — Ctrl+K', () => {
  it('Ctrl+K는 고른 클립이 있으면 그 클립만, 없으면 잠기지 않은 모든 줄에서 플레이헤드에 걸린 클립(영상 · 소리)을 나눈다', () => {
    // 왜: 소리와 함께 나뉘게(결정 페이지 H6). 고른 것만 나누는 것은 지금 자르기 도구 · 프리미어와 같다.
    api().seek(5)
    // 고른 영상 클립만 — V2 의 D · 음악은 그대로.
    api().selectClip('B')
    press('k', { ctrl: true })
    expect(v1()).toEqual([['A', 0, 4], ['B', 4, 1], [piece('B'), 5, 3], ['C', 8, 4]])
    expect(on('v2')).toEqual([['D', 3, 4]])
    expect(sounds()).toContainEqual(['bgm', 0, 10])
    api().undo()
    // 고른 소리 조각만.
    api().selectAudioClip('bgm')
    press('k', { ctrl: true })
    expect(sounds().filter(([id]) => id !== 'A' && id !== 'B' && id !== 'C' && id !== 'D')).toEqual([['bgm', 0, 5], [expect.stringMatching(/^audio_/), 5, 5]])
    expect(v1()).toEqual([['A', 0, 4], ['B', 4, 4], ['C', 8, 4]])
    api().undo()
    // 아무것도 고르지 않으면 잠기지 않은 모든 줄 — 잠근 V2 의 D 는 그대로.
    api().clearAudioSelection()
    api().clearClipSelection()
    api().toggleTrackLock('v2')
    press('k', { ctrl: true })
    expect(v1()).toEqual([['A', 0, 4], ['B', 4, 1], [piece('B'), 5, 3], ['C', 8, 4]])
    expect(on('v2')).toEqual([['D', 3, 4]])
    expect(sounds()).toContainEqual(['bgm', 0, 5])
  })

  it('Ctrl+K 한 번은 되돌리기 한 칸이다 — 여러 줄을 함께 나눠도 한 번에 돌아간다', () => {
    // 왜: 구현하며 더한 것. 한 번 누른 것을 줄마다 따로 되돌리면 몇 번 눌러야 하는지 모른다.
    const before = { v1: v1(), v2: on('v2'), sounds: sounds() }
    api().seek(5)
    press('k', { ctrl: true })
    expect(on('v2')).toEqual([['D', 3, 2], [piece('D'), 5, 2]])
    expect(api().past).toHaveLength(1)
    api().undo()
    expect({ v1: v1(), v2: on('v2'), sounds: sounds() }).toEqual(before)
  })

  it('고른 클립을 Ctrl+K로 나누면 두 조각 모두 골라진 채 남는다', () => {
    // 왜: 구현하며 더한 것. 고른 것은 같은 영상 그대로다 — 플레이헤드를 옮겨 Ctrl+K 를 또 누르면 뒤 조각도 나뉜다.
    api().selectClip('B')
    api().seek(5)
    press('k', { ctrl: true })
    expect(api().selectedShotIds).toEqual(['B', piece('B')])
    api().seek(6.5)
    press('k', { ctrl: true })
    expect(v1()).toEqual([['A', 0, 4], ['B', 4, 1], [piece('B'), 5, 1.5], [piece('B'), 6.5, 1.5], ['C', 8, 4]])
  })

  it('잠근 줄의 영상에 이어진 소리는 아무것도 고르지 않은 Ctrl+K로 나누지 않는다 — 영상과 떨어지지 않게', () => {
    // 왜: 구현하며 더한 것. 소리를 직접 나누면 영상에서 떨어진다(결정 4) — 잠가 둔 영상의 소리가 몰래 떨어지면 안 된다.
    api().toggleTrackLock('v1')
    api().toggleTrackLock('v2')
    api().seek(5)
    press('k', { ctrl: true })
    expect(v1()).toEqual([['A', 0, 4], ['B', 4, 4], ['C', 8, 4]])
    expect(api().audioClips.find((a) => a.id === 'a_B')).toMatchObject({ startSec: 4, durationSec: 4, linkedShotId: 'B' })
    expect(sounds()).toContainEqual(['bgm', 0, 5])
  })

  it('느린 클립 가장자리 근처에서 아무것도 고르지 않은 Ctrl+K 는 이어진 소리만 나누지 않는다', () => {
    // 왜: 검토 c(③ 보통) — 영상은 원본 초로 0.1초 한계를 재어 나뉘지 않는데 소리는 타임라인 초로 재어 나뉘며 영상에서 떨어졌다(0.5배 ·
    //   클립 시작 0.15초 뒤 · 끝 0.15초 앞). 이어진 소리는 영상과 함께만 나뉜다 — 소리만 따로 나누려면 그 조각을 골라 Ctrl+K.
    api().toggleTrackLock('v2')
    useEditorStore.setState({ audioClips: api().audioClips.filter((a) => a.id !== 'bgm') })
    api().setSpeed('B', 0.5)
    const steps = api().past.length
    const b = selectVideoLayout(api()).find((l) => l.shotId === 'B')!
    for (const at of [b.startSec + 0.15, b.startSec + b.durationSec - 0.15]) {
      api().seek(at)
      press('k', { ctrl: true })
    }
    expect(v1().map(([id]) => id)).toEqual(['A', 'B', 'C'])
    expect(api().audioClips.filter((a) => a.url.endsWith('/B.mp4'))).toEqual([expect.objectContaining({ id: 'a_B', linkedShotId: 'B' })])
    expect(api().past).toHaveLength(steps)
  })

  it('플레이헤드가 클립의 처음 · 끝 0.1초 안이면 Ctrl+K는 그 클립을 나누지 않는다', () => {
    // 왜: 지금 자르기 도구와 같은 한계 — 0.1초보다 짧은 조각은 만들지 않는다. 편집점 위에서 누르면 아무것도 바뀌지 않는다.
    api().toggleTrackLock('v2')
    useEditorStore.setState({ audioClips: api().audioClips.filter((a) => a.id !== 'bgm') })
    api().seek(4.05)
    press('k', { ctrl: true })
    api().seek(8)
    press('k', { ctrl: true })
    expect(v1()).toEqual([['A', 0, 4], ['B', 4, 4], ['C', 8, 4]])
    expect(api().past).toHaveLength(0)
  })
})

describe('혼자 정한 것 — 스냅', () => {
  it('스냅은 처음에 켜져 있다. 붙는 곳은 0초 · 플레이헤드 · 모든 줄 클립의 시작 · 끝 · 마커(8px 안). 영상 클립 옮기기 · 소리 옮기기 · 가장자리 끌기에 쓴다', () => {
    // 왜: 지금 소리 끌기 스냅(0 · 플레이헤드 · 클립 경계)을 모든 줄 · 마커로 넓힌다(결정 페이지 H8). 8px 는 화면 거리라 확대하면 초로는 좁아진다.
    api().reset()
    expect(api().snapEnabled).toBe(true)
    seed()
    const targets = snapTargets({ currentTime: 5, markers: [10.5], videoLayout: selectVideoLayout(api()), audioClips: api().audioClips })
    for (const sec of [0, 5, 4, 8, 12, 3, 7, 10, 10.5]) expect(targets).toContain(sec)
    expect(makeSnapper(true, targets, 40).point(10.65)).toBe(10.5) // 마커까지 0.15초 = 6px
    expect(makeSnapper(true, targets, 40).point(10.75)).toBe(10.75) // 10px — 붙지 않는다
    expect(makeSnapper(true, targets, 80).point(10.65)).toBe(10.65) // 확대하면 같은 0.15초가 12px
    expect(makeSnapper(true, targets, 40).start(0.1, 2)).toBe(0) // 0초에
    const timeline = read('src/features/editor/timeline.tsx')
    expect(timeline).toMatch(/makeSnapper\(snapEnabled, snapTargets\(/)
    expect(timeline).toMatch(/placeAtSec: snap\.start\(Math\.max\(0, sec - grabOffset\), item\.durationSec\)/) // 영상 클립 옮기기
    expect(timeline).toMatch(/const snapped = snapStart\(raw, clip\.durationSec, clip\.id\)/) // 소리 옮기기
    expect(timeline.match(/snap\.point\(clientXToSec\(cx\)\)/g)).toHaveLength(2) // 영상 가장자리 둘
    expect(timeline.match(/snapPoint\(clientXToSec\(ev\.clientX\), clip\.id\)/g)?.length).toBeGreaterThanOrEqual(2) // 소리 가장자리
  })

  it('끄는 클립과 그 클립에 이어진 소리의 가장자리에는 붙지 않는다 — 함께 움직이는 것이라서', () => {
    // 왜: 구현하며 더한 것. 자기 원래 자리에 붙으면 조금 옮기려 해도 제자리로 돌아간다.
    expect(draggedIds('D', api().audioClips)).toEqual(['D', 'a_D'])
    const layout = selectVideoLayout(api())
    const all = snapTargets({ currentTime: 0, markers: [], videoLayout: layout, audioClips: api().audioClips })
    const moving = snapTargets({ currentTime: 0, markers: [], videoLayout: layout, audioClips: api().audioClips }, new Set(draggedIds('D', api().audioClips)))
    expect(all).toContain(3)
    expect(all).toContain(7)
    expect(moving).not.toContain(3)
    expect(moving).not.toContain(7)
  })

  it('스냅 켬/끔은 저장하지 않는다. 다시 열면 켜져 있다', async () => {
    // 왜: 편집이 아니라 도구 설정이다 — 다른 기기 · 다음에 열 때 끈 채로 열리면 왜 안 붙는지 모른다.
    api().toggleSnap()
    await saveEditorNow('project-markers')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as Record<string, unknown>
    expect(Object.keys(saved).filter((key) => /snap/i.test(key))).toEqual([])
    // Editor 를 열면(loadData) 다시 켜진다.
    mocks.projectId = null
    await api().loadData()
    expect(api().snapEnabled).toBe(true)
  })
})

describe('혼자 정한 것 — 마커', () => {
  it('마커는 자 위에 작은 표시로 보인다. 누르면 그 시각으로 가고, 우클릭 [마커 지우기]로 지운다. 같은 시각(0.05초 안)에는 하나만 둔다', () => {
    // 왜: 시안에 마커 그림이 단추뿐이다(결정 페이지 H9). 이름 · 색은 두지 않는다.
    const markup = html(createElement(RulerMarkers, { markers: [4.2, 10], pxPerSec: 40, onSeek: () => {}, onRemove: () => {} }))
    expect(markup).toMatch(/left:168px/)
    expect(markup).toMatch(/left:400px/)
    expect(markup).toContain('aria-label="마커 00:00:04:06"')
    const src = read('src/features/editor/timeline-markers.tsx')
    expect(src).toMatch(/onClick=\{\(\) => onSeek\(sec\)\}/)
    expect(src).toMatch(/onSelect=\{\(\) => onRemove\(sec\)\}/)
    expect(src).toMatch(/t\('Delete marker'\)/)
    expect(read('src/features/editor/timeline.tsx')).toMatch(/<RulerMarkers markers=\{markers\} pxPerSec=\{pxPerSec\} onSeek=\{onSeek\} onRemove=\{onRemoveMarker\} \/>/)
    api().seek(4.2)
    api().addMarker()
    api().seek(4.24)
    api().addMarker()
    expect(api().markers).toEqual([4.2])
    api().seek(4.3)
    api().addMarker()
    expect(api().markers).toEqual([4.2, 4.3])
    api().removeMarker(4.2)
    expect(api().markers).toEqual([4.3])
  })

  it('M 키로도 마커를 단다(프리미어와 같다). 단축키 창에 더한다', () => {
    // 왜: 편집 기본기 — 재생하며 누르는 키다. 한글 입력 상태(ㅡ)여도 같은 자리 키면 단다(구현하며 더한 것).
    api().seek(7)
    press('m')
    expect(api().markers).toEqual([7])
    api().seek(9)
    press('ㅡ', { code: 'KeyM' })
    expect(api().markers).toEqual([7, 9])
    api().seek(11)
    press('m', { ctrl: true })
    expect(api().markers).toEqual([7, 9])
    expect(EDITOR_SHORTCUTS.map((s) => s.keys)).toEqual(expect.arrayContaining(['Ctrl+K', 'M']))
    const markup = text(html(createElement(ShortcutsList)))
    expect(markup).toContain('플레이헤드 자리에서 나누기')
    expect(markup).toContain('마커 달기')
  })

  it('마커 달기 · 지우기는 되돌리기 한 칸이다. 저장본에 markers(초 목록)로 남는다', async () => {
    // 왜: 결정 페이지 H10 · 추천 "되돌리기 50칸". 다시 열어도 다시 찾아갈 수 있어야 마커다.
    api().seek(3)
    api().addMarker()
    expect(api().past).toHaveLength(1)
    api().undo()
    expect(api().markers).toEqual([])
    api().redo()
    expect(api().markers).toEqual([3])
    api().removeMarker(3)
    expect(api().markers).toEqual([])
    api().undo()
    expect(api().markers).toEqual([3])
    await saveEditorNow('project-markers')
    canonical()
    expect(api().markers).toEqual([])
    await api().loadPersisted()
    expect(api().markers).toEqual([3])
  })

  it('앞 · 다음 편집점(Ctrl+← · → · 모니터 단추)도 마커에 멈춘다', () => {
    // 왜: 마커는 다시 찾아가려고 단다. 편집점 단추와 단축키는 같은 자리로 간다(2단계 ①).
    api().seek(6)
    api().addMarker()
    api().seek(7.5)
    api().addMarker()
    api().seek(4.5)
    press('ArrowRight', { ctrl: true })
    expect(api().currentTime).toBe(6)
    press('ArrowRight', { ctrl: true })
    expect(api().currentTime).toBe(7)
    press('ArrowRight', { ctrl: true })
    expect(api().currentTime).toBe(7.5)
    press('ArrowLeft', { ctrl: true })
    expect(api().currentTime).toBe(7)
    expect(editPointTarget(selectVideoLayout(api()), 4.5, 1, [6])).toBe(6)
    expect(editPointTarget(selectVideoLayout(api()), 4.5, 1)).toBe(7)
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/editPointTarget\(layout, st\.currentTime, -1, st\.markers\)/)
    expect(previewer).toMatch(/editPointTarget\(layout, st\.currentTime, 1, st\.markers\)/)
    expect(read('src/features/editor/use-editor-playback.ts')).toMatch(/editPointTarget\(layout, s\.currentTime, dir, s\.markers\)/)
  })
})
