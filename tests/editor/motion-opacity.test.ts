// Editor 효과 컨트롤의 모션(위치 X · 위치 Y · 비율) · 불투명도와 모니터 겹쳐 그리기 — 값 범위 · 처음 값 · 되돌리기 · 저장 · 여러 클립 · 아래 줄 비침을 검사한다 (2단계 ④, 시안 E1 · E3, 2026-11-14)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-motion' as string | null }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: mocks.projectId }), {
    getState: () => ({ projectId: mocks.projectId }),
  }),
}))

import { saveEditorNow, selectStackAt, selectTimelineLayout, useEditorStore } from '@/stores/editor-store'
import { useLocaleStore } from '@/stores/locale-store'
import { EffectControls, armOnStepKey, sliderHistory } from '@/features/editor/effect-controls'
import { Slider } from '@/components/ui/slider'
import { handleEditorKey } from '@/features/editor/use-editor-playback'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

const LOCAL_KEY = 'tale:editor:v1:project-motion'
const api = () => useEditorStore.getState()
const read = (file: string) => readFileSync(file, 'utf8')
const shot = (shotId: string): Shot =>
  ({ shotId, sceneId: 'sc_1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds: 4, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
const clip = (shotId: string): VideoClip => ({ shotId, url: `https://video.test/${shotId}.mp4`, status: 'completed', thumbnailUrl: null })
const linked = (shotId: string, startSec: number): AudioTrackClip => ({
  id: `a_${shotId}`, name: `${shotId} audio`, url: `https://video.test/${shotId}.mp4`, startSec, durationSec: 4, volume: 1, muted: false,
  sourceOffsetSec: 0, sourceDurationSec: 4, trackId: 'atrack_1', linkedShotId: shotId,
})
/** A · B · C 세 샷(4초씩)을 V1 에 깔고 소리를 잇는다. */
function seed() {
  api().reset()
  const ids = ['A', 'B', 'C']
  useEditorStore.setState({
    shots: ids.map(shot),
    videoClips: ids.map(clip),
    clipOrder: { sc_1: [...ids] },
    audioClips: ids.map((id, i) => linked(id, i * 4)),
    selectedSceneId: 'sc_1',
    loadStatus: 'ready',
  })
}
function canonical() {
  api().reset()
  const ids = ['A', 'B', 'C']
  useEditorStore.setState({ shots: ids.map(shot), videoClips: ids.map(clip), clipOrder: { sc_1: [...ids] }, loadStatus: 'ready' })
}
const clipOf = (shotId: string) => api().videoClips.find((c) => c.shotId === shotId)
const stack = (t: number) => selectStackAt(api(), t).map((l) => l.shotId)
/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(tests/editor/panels.test.ts 와 같은 방법). */
function html(el: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useEditorStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(el)
}
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

beforeEach(() => {
  localStorage.clear()
  mocks.projectId = 'project-motion'
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
  it('고른 클립의 효과 컨트롤에 모션(위치 X · 위치 Y · 비율)과 불투명도가 있다', () => {
    // 왜: 시안 E1 409:4659–4685. 정상 경로 고정 — 처음 값은 0% · 0% · 100% · 100%.
    api().selectClip('B')
    const markup = text(html(createElement(EffectControls)))
    expect(markup).toMatch(/모션 위치 X 0% 위치 Y 0% 비율 100%/)
    expect(markup).toMatch(/불투명도 불투명도 100%/)
    // 시안 차례 — 모션 · 불투명도 다음에 전환 · 속도.
    expect(markup.indexOf('모션')).toBeLessThan(markup.indexOf('전환'))
  })

  it('위 줄 클립을 줄이거나 옮기거나 투명하게 하면 모니터에서 아래 줄 클립이 비쳐 보인다', () => {
    // 왜: 시안 E3 "배경 위에 샷" · 큰 결정 1 · 2단계 ② "겹쳐 그리기는 ④에서". 위 클립이 화면을 다 덮으면 아래는 그리지 않는다.
    api().moveClipToTrack('C', 'v2', 1)
    expect(stack(2)).toEqual(['C'])
    api().setClipMotion(['C'], { scale: 0.5 })
    expect(stack(2)).toEqual(['A', 'C'])
    api().setClipMotion(['C'], { scale: 1, x: 0.3 })
    expect(stack(2)).toEqual(['A', 'C'])
    api().setClipMotion(['C'], { x: 0 })
    api().setClipOpacity(['C'], 0.5)
    expect(stack(2)).toEqual(['A', 'C'])
    // 눈을 끈 줄은 비치지도 가리지도 않는다.
    api().toggleTrackVisible('v2')
    expect(stack(2)).toEqual(['A'])
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/selectStackAt\(st, t\)/)
    expect(previewer).toMatch(/data-testid="program-under-layer"/)
  })

  it('슬라이더 색 · 모서리는 지금 토큰을 쓴다', () => {
    // 왜: 결정 페이지 "파랑 슬라이더는 토큰 색으로" — 볼륨 슬라이더와 같은 공용 부품.
    const src = read('src/features/editor/effect-controls.tsx')
    expect(src).toMatch(/import \{ Slider \} from '@\/components\/ui\/slider'/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(|oklch\(/)
  })
})

describe('혼자 정한 것', () => {
  it('위치 X · Y 는 −100% ~ +100%, 비율은 10% ~ 300%, 불투명도는 0% ~ 100% 이고 처음 값은 0 · 0 · 100 · 100 이다', () => {
    // 왜: 시안 슬라이더 자리(0%가 가운데, 비율 100%가 왼쪽에서 3할). 화면 폭 · 높이에 대한 비율이라 화면 크기가 바뀌어도 같은 자리다.
    expect(clipOf('B')?.motion).toBeUndefined()
    expect(clipOf('B')?.opacity).toBeUndefined()
    api().setClipMotion(['B'], { x: 1.5, y: -2, scale: 0.05 })
    expect(clipOf('B')?.motion).toEqual({ x: 1, y: -1, scale: 0.1 })
    api().setClipMotion(['B'], { scale: 4 })
    expect(clipOf('B')?.motion?.scale).toBe(3)
    api().setClipOpacity(['B'], -0.2)
    expect(clipOf('B')?.opacity).toBe(0)
  })

  it('값은 클립마다 하나고, 시간에 따라 바뀌지 않는다', () => {
    // 왜: 시안에 키프레임(시계) 표시가 없다 — 클립 처음부터 끝까지 같은 자리 · 크기 · 투명도다.
    api().moveClipToTrack('C', 'v2', 1)
    api().setClipMotion(['C'], { scale: 0.5 })
    expect(stack(1.5)).toEqual(['A', 'C'])
    expect(stack(4.5)).toEqual(['B', 'C'])
    expect(clipOf('C')?.motion).toEqual({ x: 0, y: 0, scale: 0.5 })
  })

  it('끄는 동안 모니터에 바로 보이고, 놓으면 되돌리기 한 칸이다', () => {
    // 왜: 지금 볼륨 슬라이더와 같다 — 값이 처음 바뀔 때 한 칸, 끄는 동안의 값은 칸을 쌓지 않는다.
    const steps = api().past.length
    api().pushHistory()
    for (const scale of [0.9, 0.7, 0.5]) api().setClipMotion(['B'], { scale })
    expect(api().past).toHaveLength(steps + 1)
    api().undo()
    expect(clipOf('B')?.motion).toBeUndefined()
    const src = read('src/features/editor/effect-controls.tsx')
    expect(src.match(/onStart=\{\(\) => pushHistory\(\)\}/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('슬라이더를 누르기만 하거나 끝 값에서 ← → 를 눌러 값이 그대로면 되돌리기 칸이 쌓이지 않는다 — 값이 처음 바뀔 때 한 칸', () => {
    // 왜: 검토 c (D) 낮음 2 — 누름 · 화살표마다 칸을 쌓아 아무것도 바뀌지 않은 되돌리기가 생겼다(볼륨 슬라이더도 예전부터 같았다).
    //   슬라이더는 값이 그대로면 값 바뀜을 알리지 않는다 — 누름 · 화살표는 준비만 하고 첫 바뀜에 한 칸을 쌓는다.
    let pushes = 0
    const applied: number[] = []
    const history = sliderHistory(() => {
      pushes += 1
    })
    history.arm()
    expect(pushes).toBe(0)
    history.change(() => applied.push(1))
    history.change(() => applied.push(2))
    expect([pushes, applied]).toEqual([1, [1, 2]])
    history.arm()
    history.change(() => applied.push(3))
    expect(pushes).toBe(2)
    const src = read('src/features/editor/effect-controls.tsx')
    expect(src).not.toMatch(/onPointerDown=\{onStart\}|onPointerDown=\{\(\) => pushHistory\(\)\}/)
    expect(src.match(/onValueChange=\{\(\[v\]\) => (history|volumeHistory)\.change\(/g)?.length).toBe(2)
  })

  it('타임라인 소리 조각을 누르기만 하거나 볼륨 선을 누르기만 하면 되돌리기 칸이 쌓이지 않는다 — 옮기거나 값이 바뀔 때 한 칸', () => {
    // 왜: 구현하며 더한 것(검토 c (D) 낮음 2 와 같은 고장) — 소리 조각을 눌러 고르기만 해도, 볼륨 선을 누르기만 해도 빈 되돌리기 칸이 생겼다.
    const timeline = read('src/features/editor/timeline.tsx')
    expect(timeline).not.toMatch(/onSelect\(\)\s+onPushHistory\(\)/)
    // 소리 조각 끌기는 자리 · 줄이 실제로 바뀔 때 한 칸(검토 c (E) 6 — 예전 글자: if (!moved) onPushHistory()).
    expect(timeline).toMatch(/if \(!pushed && \(Math\.abs\(snapped - origStart\) > 1e-6 \|\| tid !== rowTrackId\)\) \{\s*pushed = true\s*onPushHistory\(\)/)
    expect(timeline).toMatch(/pushed = true\s+onPushHistory\(\)/)
  })

  it('슬라이더에서 ← → 를 누르고 있어도(키 반복) 되돌리기는 한 칸이다', () => {
    // 왜: 검토 c (E) 5 — 키를 누르고 있으면 반복되는 키마다 다시 준비돼 한 걸음마다 한 칸이 쌓였다. 2초쯤 누르면 되돌리기 50칸이 차서
    //   그 앞 편집을 되돌릴 수 없었다(모션 · 불투명도는 ④부터, 소리 볼륨은 (D) 낮음 2 부터).
    let pushes = 0
    const history = sliderHistory(() => {
      pushes += 1
    })
    armOnStepKey(history, { key: 'ArrowRight', repeat: false })
    history.change(() => {})
    for (let i = 0; i < 20; i++) {
      armOnStepKey(history, { key: 'ArrowRight', repeat: true })
      history.change(() => {})
    }
    expect(pushes).toBe(1)
    armOnStepKey(history, { key: 'ArrowLeft', repeat: false })
    history.change(() => {})
    expect(pushes).toBe(2)
    expect(read('src/features/editor/effect-controls.tsx').match(/onKeyDown=\{\(e\) => armOnStepKey\((history|volumeHistory), e\)\}/g)).toHaveLength(2)
  })

  it('이어진 소리 조각을 끌었다가 제자리에 놓으면(값 그대로) 되돌리기 칸이 쌓이지 않는다', () => {
    // 왜: 검토 c (E) 6 — 2px 넘게 끌었다 붙는 자리로 돌아오면 아무것도 안 바뀌었는데 한 칸이 쌓였다. 자리 · 줄이 실제로 바뀔 때만 쌓는다.
    const timeline = read('src/features/editor/timeline.tsx')
    expect(timeline).toMatch(/if \(!pushed && \(Math\.abs\(snapped - origStart\) > 1e-6 \|\| tid !== rowTrackId\)\) \{\s*pushed = true\s*onPushHistory\(\)\s*\}\s*if \(pushed\) onMove\(snapped, tid\)/)
    // 같은 자리로 옮기기는 저장 쪽도 아무것도 바꾸지 않는다(소리를 영상에서 떼지 않는다).
    const before = api().audioClips.find((a) => a.id === 'a_B')
    api().moveAudioClip('a_B', before!.startSec, before!.trackId)
    expect(api().audioClips.find((a) => a.id === 'a_B')).toEqual(before)
  })

  it('% 글자를 두 번 누르면 처음 값으로 돌아간다', () => {
    // 왜: 프리미어의 ↺ 단추 대신 — 칸을 늘리지 않는다. 처음 값으로 돌아가면 저장본에도 칸이 없다.
    api().setClipMotion(['B'], { x: 0.4, scale: 1.5 })
    api().setClipMotion(['B'], { x: 0 })
    expect(clipOf('B')?.motion).toEqual({ x: 0, y: 0, scale: 1.5 })
    api().setClipMotion(['B'], { scale: 1 })
    expect(clipOf('B')?.motion).toBeUndefined()
    api().setClipOpacity(['B'], 0.3)
    api().setClipOpacity(['B'], 1)
    expect(clipOf('B')?.opacity).toBeUndefined()
    expect(read('src/features/editor/effect-controls.tsx')).toMatch(/onDoubleClick=\{onReset\}/)
  })

  it('여러 클립을 골랐으면 고른 클립 모두에 같은 값이 들어간다', () => {
    // 왜: 지금 속도 · 전환 칩과 같다.
    api().setClipSelection(['A', 'B'])
    api().setClipMotion(api().selectedShotIds, { scale: 0.5 })
    expect([clipOf('A')?.motion?.scale, clipOf('B')?.motion?.scale, clipOf('C')?.motion]).toEqual([0.5, 0.5, undefined])
    expect(read('src/features/editor/effect-controls.tsx')).toMatch(/setClipMotion\(targets, /)
  })

  it('화면 밖으로 나간 부분은 잘리고, 비친 자리에 아래 줄 클립이 없으면 검정이다', () => {
    // 왜: 내보낸 영상 크기(긴 변 1280)는 그대로다 — 모니터의 틀도 시퀀스 비율이고 그 밖은 그리지 않는다.
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/data-testid="program-frame"\s+className="[^"]*\boverflow-hidden\b/)
    expect(previewer).toMatch(/data-testid="program-picture" className="[^"]*\bbg-black\b/)
  })

  it('저장본에 클립마다 motion · opacity 로 남고, 처음 값이면 적지 않는다 — 다시 열어도 그대로다', async () => {
    // 왜: 예전 저장본 · 효과를 안 쓴 클립은 그대로 열린다. 자른 조각과 원본 샷 모두 되살린다.
    api().setClipMotion(['B'], { x: -0.25, scale: 0.6 })
    api().setClipOpacity(['B'], 0.8)
    api().splitVideoClipAt('B', 6)
    await saveEditorNow('project-motion')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor
    expect(saved.videoClips.find((c) => c.shotId === 'B')).toMatchObject({ motion: { x: -0.25, y: 0, scale: 0.6 }, opacity: 0.8 })
    expect(saved.videoClips.find((c) => c.shotId === 'A')).not.toHaveProperty('motion')
    expect(saved.videoClips.find((c) => c.shotId === 'A')).not.toHaveProperty('opacity')
    canonical()
    await api().loadPersisted()
    const piece = selectTimelineLayout(api()).find((l) => l.shotId.startsWith('B__c'))!.shotId
    expect(clipOf('B')).toMatchObject({ motion: { x: -0.25, y: 0, scale: 0.6 }, opacity: 0.8 })
    expect(clipOf(piece)).toMatchObject({ motion: { x: -0.25, y: 0, scale: 0.6 }, opacity: 0.8 })
  })

  it('타이틀 카드 · 소리 조각에는 모션 · 불투명도 칸이 없다', () => {
    // 왜: 타이틀 카드는 화면 전체 카드다(제목은 ⑥ 제목 클립에서 다시 본다). 소리 조각은 볼륨만.
    api().addTitleCard(0)
    const title = api().shots.find((s) => s.shotId.startsWith('title__'))!.shotId
    api().selectClip(title)
    expect(text(html(createElement(EffectControls)))).not.toContain('모션')
    api().selectAudioClip('a_A')
    expect(text(html(createElement(EffectControls)))).not.toContain('모션')
  })

  it('잘라 나눈 두 조각은 모션 · 불투명도를 그대로 이어받는다', () => {
    // 왜: 구현하며 더한 것 — 나눈 뒤 한쪽만 원래 크기로 돌아가면 컷이 튄다(프리미어도 같다).
    api().setClipMotion(['B'], { scale: 0.5 })
    api().setClipOpacity(['B'], 0.7)
    api().splitVideoClipAt('B', 6)
    const piece = selectTimelineLayout(api()).find((l) => l.shotId.startsWith('B__c'))!.shotId
    expect(clipOf(piece)).toMatchObject({ motion: { x: 0, y: 0, scale: 0.5 }, opacity: 0.7 })
  })

  it('효과 컨트롤 슬라이더에 손을 둔 채 ← → 를 누르면 그 값만 바뀌고 플레이헤드는 움직이지 않는다', () => {
    // 왜: 구현하며 더한 것 — 슬라이더(role=slider)는 글 입력칸이 아니라 단축키가 함께 돌아 플레이헤드까지 한 장씩 움직였다(볼륨 슬라이더도 같았다).
    api().seek(2)
    const slider = { tagName: 'SPAN', isContentEditable: false, getAttribute: (name: string) => (name === 'role' ? 'slider' : null) }
    handleEditorKey({ key: 'ArrowRight', code: 'ArrowRight', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: slider, preventDefault: () => {} } as unknown as KeyboardEvent)
    expect(api().currentTime).toBe(2)
  })
})

describe('슬라이더 이름', () => {
  it('슬라이더 손잡이는 화면 읽기에 이름이 들린다', () => {
    // 왜: 리드 11/14(혼자 정한 것 · 쉬움) — 공용 슬라이더가 이름(aria-label)을 바깥 틀에만 붙여, 손잡이(role=slider)에 손을 두어도 무슨
    //   슬라이더인지 들리지 않았다. 효과 컨트롤 · Writer 굵기 · 밝기 · Artist 보드 축척 · 생성 틀이 같은 부품을 쓴다.
    const thumbNamed = (markup: string, name: string) =>
      [...markup.matchAll(/<span[^>]*role="slider"[^>]*>/g)].some((m) => m[0].includes(`aria-label="${name}"`))
    expect(thumbNamed(renderToStaticMarkup(createElement(Slider, { 'aria-label': '볼륨', value: [50] })), '볼륨')).toBe(true)
    api().selectClip('B')
    const markup = html(createElement(EffectControls))
    for (const name of ['위치 X', '위치 Y', '비율', '불투명도']) expect(thumbNamed(markup, name)).toBe(true)
  })
})
