// Editor 제목 클립(문자 도구) — V 트랙을 눌러 만든 2초 글자 클립이 영상 위에 얹히고, 효과 컨트롤에서 글자 · 크기 · 위치 · 모션 · 불투명도를 바꾸며 저장되는지 검사한다 (2단계 ⑥, 시안 E2, 2026-11-14)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-title' as string | null }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: mocks.projectId }), {
    getState: () => ({ projectId: mocks.projectId }),
  }),
}))

import { saveEditorNow, selectProgramLayout, selectTitleDipsAt, selectTitlesAt, selectVideoLayout, useEditorStore } from '@/stores/editor-store'
import { useLocaleStore } from '@/stores/locale-store'
import { EffectControls } from '@/features/editor/effect-controls'
import { EDITOR_SHORTCUTS } from '@/features/editor/editor-workbar'
import { handleEditorKey } from '@/features/editor/use-editor-playback'
import { TitleClipFace, TitleTextLayer } from '@/features/editor/title-clip-layer'
import { defaultTitleText, titleLayersAt, titleTextBox } from '@/lib/editor/title-clip'
import { transitionWindows } from '@/lib/editor/transition'
import { editorChatContext } from '@/lib/editor/chat-context'
import { clipMenuTitle } from '@/features/editor/editor-labels'
import { translate } from '@/lib/i18n/translate'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { Shot, VideoClip } from '@/types'

const LOCAL_KEY = 'tale:editor:v1:project-title'
const api = () => useEditorStore.getState()
const read = (file: string) => readFileSync(file, 'utf8')
const shot = (shotId: string): Shot =>
  ({ shotId, sceneId: 'sc_1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds: 4, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
const clip = (shotId: string): VideoClip => ({ shotId, url: `https://video.test/${shotId}.mp4`, status: 'completed', thumbnailUrl: null })
/** A · B · C 세 샷(4초씩)을 V1 에 붙여 깐다(0–4 · 4–8 · 8–12). */
function seed() {
  api().reset()
  const ids = ['A', 'B', 'C']
  useEditorStore.setState({ shots: ids.map(shot), videoClips: ids.map(clip), clipOrder: { sc_1: [...ids] }, selectedSceneId: 'sc_1', loadStatus: 'ready' })
}
function canonical() {
  api().reset()
  const ids = ['A', 'B', 'C']
  useEditorStore.setState({ shots: ids.map(shot), videoClips: ids.map(clip), clipOrder: { sc_1: [...ids] }, loadStatus: 'ready' })
}
const shotOf = (id: string) => api().shots.find((s) => s.shotId === id)
const clipOf = (id: string) => api().videoClips.find((c) => c.shotId === id)
const placeOf = (id: string) => selectVideoLayout(api()).find((l) => l.shotId === id)
function html(el: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useEditorStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(el)
}
const text = (markup: string) =>
  markup.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const pressed = (markup: string) => [...markup.matchAll(/aria-pressed="true"[^>]*>([^<]*)</g)].map((m) => m[1].trim())
const key = (k: string, code: string) =>
  handleEditorKey({ key: k, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: null, preventDefault: () => {} } as unknown as KeyboardEvent)

beforeEach(() => {
  localStorage.clear()
  mocks.projectId = 'project-title'
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
  it('문자 도구(T)로 V 트랙을 누르면 그 자리에 2초짜리 제목 클립이 생긴다 — V1 을 누르면 V2 에 생긴다', () => {
    // 왜: 시안 E2 409:5374 "문자 도구(T)로 V 트랙을 누르면 제목이 생겨요" · 결정 페이지 "새 제목은 V2 위 2초 글자 클립".
    const id = api().addTitleClip('v2', 3, '우산')!
    expect(placeOf(id)).toMatchObject({ trackId: 'v2', startSec: 3, durationSec: 2 })
    expect(shotOf(id)?.titleText).toEqual({ text: '우산', size: 30, place: 'middle' })
    const other = api().addTitleClip('v1', 6, '비')!
    expect(placeOf(other)).toMatchObject({ trackId: 'v2', startSec: 6, durationSec: 2 })
    const timeline = read('src/features/editor/timeline.tsx')
    expect(timeline).toMatch(/textMode/)
    expect(timeline).toMatch(/onAddTitle\(/)
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/addTitleClip\(/)
  })

  it('고른 제목의 효과 컨트롤에는 "제목 · 글자" 머리 · 자리 줄 · 텍스트 칸 · 크기(처음 30) · 위치(위 · 가운데 · 아래 · 배경 띠, 처음 가운데) · 모션 · 불투명도가 차례로 있다', () => {
    // 왜: 시안 E2 409:5231–5280.
    const id = api().addTitleClip('v2', 3, '우산')!
    api().selectClip(id)
    const markup = html(createElement(EffectControls))
    const words = text(markup)
    expect(words).toContain('제목 · 우산')
    expect(words).toContain('V2 · 00:00:03:00 → 00:00:05:00 · 2.00초')
    expect(markup).toMatch(/<input[^>]*value="우산"/)
    expect(words).toContain('크기 30')
    expect(words).toContain('위치 위 가운데 아래 배경 띠')
    expect(pressed(markup)).toContain('가운데')
    const order = ['텍스트', '크기', '위치 위', '모션', '불투명도', '전환'].map((w) => words.indexOf(w))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('제목 글자는 모니터에서 아래 영상 위로 겹쳐 보인다', () => {
    // 왜: 시안 E2 409:5288 — 영상 위에 글자만 얹는다(검은 바탕이 아니다).
    const id = api().addTitleClip('v2', 3, '우산')!
    expect(selectTitlesAt(api(), 4).map((l) => l.shotId)).toEqual([id])
    // 영상 그림은 그대로 V1 클립이다.
    expect(selectProgramLayout(api()).find((l) => 4 >= l.startSec && 4 < l.startSec + l.durationSec)?.shotId).toBe('B')
    const layer = renderToStaticMarkup(createElement(TitleTextLayer, { data: { text: '우산', size: 30, place: 'middle' }, frameHeight: 640 }))
    expect(text(layer)).toBe('우산')
    expect(layer).toContain('font-size:48px')
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/data-testid="program-title-layer"/)
  })

  it('타임라인 제목 클립은 "T 글자" 이름으로 보인다', () => {
    // 왜: 시안 E2 409:5500 "T The Shared Umbrella". 색은 결정 페이지대로 지금 토큰(장미색 대신).
    const face = html(createElement(TitleClipFace, { text: '우산' }))
    expect(text(face)).toBe('T 우산')
    expect(face).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
    expect(read('src/features/editor/timeline.tsx')).toMatch(/<TitleClipFace text=/)
  })

  it('지금 타이틀 카드는 [새 항목 ▾]에 그대로 남는다', () => {
    // 왜: 결정 페이지 "지금 타이틀 카드는 [새 항목 ▾]에 남김 · 자막은 지금 그대로".
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/newItems=\{\[\{ label: t\('Title card'\), onSelect: handleAddTitleCard \}\]\}/)
  })

  it('도구 열은 선택 · 자르기 · 문자 도구 셋이다 — ⇹ · ✥ 는 만들지 않는다', () => {
    // 왜: 시안 E2 도구 열의 ⇹ · ✥ 는 뜻을 디자이너에게 여쭐 것(결정 페이지) — 뜻을 모르는 단추는 두지 않는다.
    const page = read('src/app/studio/editor/page.tsx')
    expect(page.match(/className=\{toolButton\(/g)).toHaveLength(3)
    expect(page).toMatch(/title=\{t\('Type tool \(T\)'\)\}/)
  })
})

describe('같이 정한 것 — 리드 11/14 더함', () => {
  it('제목 글자 칸에 치는 동안에는 단축키가 듣지 않는다 — T · V · C · M 은 도구 · 마커를 바꾸지 않고, Backspace · Delete 는 글자만 지우고 골라 둔 클립을 지우지 않는다(Ctrl+Z 도 글자 칸 안에서는 글자 되돌리기)', () => {
    // 왜: 리드 11/14 — 제목 글자에 "t · v · c · m"이 들어 있으면 치는 도중 도구가 바뀌거나 마커가 달리고, 지우기 키가 제목 클립을 지웠다간
    //   글자를 고칠 수 없다. 한글 조합 중(Process · ㅅ)인 키도 같다. 칸은 효과 컨트롤이 그린 제목 글자 칸 그대로다.
    const id = api().addTitleClip('v2', 3, '우산')!
    api().selectClip(id)
    const markup = html(createElement(EffectControls))
    const tag = /<(input)\b([^>]*)value="우산"/.exec(markup)
    expect(tag).not.toBeNull()
    const field = { tagName: tag![1].toUpperCase(), type: /\btype="([^"]+)"/.exec(tag![2])?.[1] ?? 'text', isContentEditable: false, getAttribute: () => null }
    const press = (k: string, code: string, extra: Partial<KeyboardEvent> = {}, target: unknown = field) =>
      handleEditorKey({ key: k, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, target, preventDefault: () => {}, ...extra } as unknown as KeyboardEvent)
    const before = { tool: api().toolMode, markers: [...api().markers], past: api().past.length, selected: [...api().selectedShotIds] }
    for (const [k, code] of [['t', 'KeyT'], ['v', 'KeyV'], ['c', 'KeyC'], ['m', 'KeyM'], ['ㅅ', 'KeyT'], ['Backspace', 'Backspace'], ['Delete', 'Delete']]) press(k, code)
    press('Process', 'KeyT', { isComposing: true })
    press('z', 'KeyZ', { ctrlKey: true })
    expect({ tool: api().toolMode, markers: api().markers, past: api().past.length, selected: api().selectedShotIds }).toEqual(before)
    expect(placeOf(id)).toBeDefined()
    // 같은 키를 글자 칸 밖(타임라인)으로 보내면 듣는다 — 도구가 바뀌고, 마커가 달리고, 골라 둔 제목이 빠진다(헛통과가 아니게).
    press('t', 'KeyT', {}, null)
    expect(api().toolMode).toBe('text')
    press('m', 'KeyM', {}, null)
    expect(api().markers).toHaveLength(before.markers.length + 1)
    api().selectClip(id)
    press('Delete', 'Delete', {}, null)
    expect(placeOf(id)).toBeUndefined()
  })

  it('Lumi 조언의 타임라인 요약은 제목 클립을 "V2 제목 \'글자\' · 시작 → 끝"처럼 말한다 — 영상 클립으로 잘못 말하지 않는다', () => {
    // 왜: 리드 11/14 — 요약이 제목을 모르면 조언 채팅이 제목을 영상 컷으로 알고 말한다. V1 로 옮긴 제목도 제목으로 말한다.
    const id = api().addTitleClip('v2', 3, '우산')!
    const context = editorChatContext(api())
    expect(context).toContain('Cuts on the timeline: 3')
    expect(context).toContain('Titles over the video: V2 title "우산" 3.0s–5.0s')
    api().moveClipToTrack(id, 'v1', 12)
    const moved = editorChatContext(api())
    expect(moved).toMatch(/4\. 12\.0s–14\.0s \(2\.0s\) Title "우산"/)
    expect(moved).not.toMatch(/Title "우산"[^\n]*no video yet/)
  })
})

describe('같이 정한 것 — 리드 11/14 더함(둘째)', () => {
  it('Lumi 조언 요약은 제목 클립에 붙은 전환 · 모션 · 불투명도도 영상 컷과 같은 꼴로 말한다', () => {
    // 왜: 리드 11/14 — 요약이 제목의 들어오는 모양 · 자리 · 투명도를 모르면 조언이 틀린다. 영상 컷도 모션 · 불투명도(④)를 같은 꼴로 싣는다.
    const id = api().addTitleClip('v2', 3, '우산')!
    api().dropTransition(id, 'start', 'cross')
    api().setClipMotion([id], { y: -0.3 })
    api().setClipOpacity([id], 0.8)
    api().setClipMotion(['B'], { scale: 0.5 })
    const context = editorChatContext(api())
    expect(context).toContain('Titles over the video: V2 title "우산" 3.0s–5.0s · cross dissolves from the cut before (1s) · position 0% -30% · opacity 80%')
    expect(context).toMatch(/2\. 4\.0s–8\.0s \(4\.0s\) MS · "" · scale 50%/)
  })
})

describe('혼자 정한 것', () => {
  it('T 키는 문자 도구이고 한글 입력 상태에서도 키 자리로 알아본다 — 단축키 창에도 있다', () => {
    // 왜: V · C 와 같다(한글 입력 상태에서는 ㅅ 으로 들어온다).
    key('ㅅ', 'KeyT')
    expect(api().toolMode).toBe('text')
    key('v', 'KeyV')
    expect(api().toolMode).toBe('select')
    expect(EDITOR_SHORTCUTS).toContainEqual({ keys: 'T', action: 'Type tool' })
  })

  it('그 줄 그 자리에 클립이 있으면 그 클립 뒤에 놓이고 뒤 클립은 민다 · 잠근 줄에는 만들지 않는다', () => {
    // 왜: 지금 줄 놓기 규칙 그대로(같은 줄의 클립은 겹치지 않는다).
    const first = api().addTitleClip('v2', 3, '하나')!
    const second = api().addTitleClip('v2', 4, '둘')!
    expect(placeOf(first)).toMatchObject({ startSec: 3 })
    expect(placeOf(second)).toMatchObject({ startSec: 5 })
    api().toggleTrackLock('v3')
    expect(api().addTitleClip('v3', 1, '셋')).toBeNull()
  })

  it('새 제목의 처음 글자는 프로젝트 이름이고, 이름이 없으면 "제목"이다', () => {
    // 왜: 시안 E2 의 첫 제목이 프로젝트 이름("The Shared Umbrella")이다.
    expect(defaultTitleText('비 오는 날', '제목')).toBe('비 오는 날')
    expect(defaultTitleText('   ', '제목')).toBe('제목')
    expect(defaultTitleText(null, '제목')).toBe('제목')
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/defaultTitleText\(projectTitle, t\('New title'\)\)/)
  })

  it('제목을 만들면 선택 도구로 돌아가고 새 제목이 골라지며, 만들기는 되돌리기 한 칸이다', () => {
    // 왜: 만든 뒤 효과 컨트롤 텍스트 칸에서 바로 고친다 — 문자 도구가 남아 있으면 다음 누름이 또 제목을 만든다.
    api().setToolMode('text')
    const steps = api().past.length
    const id = api().addTitleClip('v2', 3, '우산')!
    expect(api().toolMode).toBe('select')
    expect(api().selectedShotIds).toEqual([id])
    expect(api().past).toHaveLength(steps + 1)
    api().undo()
    expect(shotOf(id)).toBeUndefined()
  })

  it('크기는 10 ~ 100(처음 30)이고 글자 높이는 화면 높이 × 크기 ÷ 400 — 위치는 위 12% · 가운데 · 아래 12% · 아래쪽 배경 띠다', () => {
    // 왜: 시안 E2 의 크기 30 · 9:16 틀에서 두 줄 제목의 글자 높이(틀 높이의 약 7%).
    expect(titleTextBox({ text: 'a', size: 30, place: 'middle' }, 640)).toEqual({ fontPx: 48, place: 'middle', offsetPct: 0 })
    expect(titleTextBox({ text: 'a', size: 30, place: 'top' }, 640)).toMatchObject({ place: 'top', offsetPct: 12 })
    expect(titleTextBox({ text: 'a', size: 30, place: 'bottom' }, 640)).toMatchObject({ place: 'bottom', offsetPct: 12 })
    expect(titleTextBox({ text: 'a', size: 30, place: 'band' }, 640)).toMatchObject({ place: 'band', offsetPct: 8 })
    const id = api().addTitleClip('v2', 3, '우산')!
    api().updateTitleText(id, { size: 300 })
    expect(shotOf(id)?.titleText?.size).toBe(100)
    api().updateTitleText(id, { size: 2, place: 'band' })
    expect(shotOf(id)?.titleText).toMatchObject({ size: 10, place: 'band' })
  })

  it('모션 · 불투명도는 제목 글자 덩어리에 입힌다', () => {
    // 왜: 영상 클립과 같은 칸 · 범위 — 제목을 옮기고 줄이고 투명하게 한다.
    const id = api().addTitleClip('v2', 3, '우산')!
    api().setClipMotion([id], { x: 0.2, scale: 1.5 })
    api().setClipOpacity([id], 0.5)
    expect(clipOf(id)).toMatchObject({ motion: { x: 0.2, y: 0, scale: 1.5 }, opacity: 0.5 })
    const layer = renderToStaticMarkup(createElement(TitleTextLayer, { data: { text: '우산', size: 30, place: 'middle' }, frameHeight: 640, motion: { x: 0.2, y: 0, scale: 1.5 } }))
    expect(layer).toContain('transform:translate(20%, 0%) scale(1.5)')
  })

  it('제목에도 전환은 넣지만 영상 효과 · 속도는 없다', () => {
    // 왜: 타이틀 카드와 같다 — 글자에 흑백 · 흐림은 쓸 데가 없고 원본이 없어 빠르기가 뜻이 없다.
    const id = api().addTitleClip('v2', 3, '우산')!
    api().dropTransition(id, 'start', 'cross')
    expect(clipOf(id)?.transitionIn).toEqual({ type: 'cross', durationSec: 1 })
    api().addVideoEffect(id, 'blackWhite')
    expect(clipOf(id)).not.toHaveProperty('effects')
    api().selectClip(id)
    expect(text(html(createElement(EffectControls)))).not.toMatch(/속도|효과 흑백/)
  })

  it('제목 길이는 가장자리를 끌어 0.5 ~ 600초로 바꾼다 — 원본 영상 끝이 없다', () => {
    // 왜: 타이틀 카드와 같다(원본이 없어 늘린 만큼 길어진다).
    const id = api().addTitleClip('v2', 3, '우산')!
    api().setTrim(id, 0, 7)
    expect(placeOf(id)?.durationSec).toBe(7)
    expect(shotOf(id)?.durationSeconds).toBe(7)
    expect(read('src/features/editor/timeline.tsx')).toMatch(/isTitleClipShotId\(item\.shotId\) \|\| isTitleCardShotId\(item\.shotId\)\s*\?\s*startSec \+ 600/)
  })

  it('제목 글자 · 크기 · 위치 바꾸기는 되돌리기 한 칸씩이다 — 글자는 입력을 시작할 때, 크기는 값이 처음 바뀔 때 한 칸', () => {
    // 왜: 한 글자마다 칸이 쌓이면 되돌리기로 돌아갈 수 없다(슬라이더 · 볼륨과 같은 규칙).
    const id = api().addTitleClip('v2', 3, '우산')!
    const steps = api().past.length
    api().pushHistory()
    for (const value of ['우', '우산이', '우산이 둘']) api().updateTitleText(id, { text: value })
    expect(api().past).toHaveLength(steps + 1)
    api().undo()
    expect(shotOf(id)?.titleText?.text).toBe('우산')
    const controls = read('src/features/editor/effect-controls.tsx')
    expect(controls).toMatch(/onFocus=\{textHistory\.arm\}/)
    expect(controls).toMatch(/textHistory\.change\(\(\) => updateTitleText\(/)
  })

  it('빈 글자의 제목은 아무것도 그리지 않는다', () => {
    // 왜: 타이틀 카드 약속 J7 과 같다 — 빈 칸이나 내부 이름을 찍지 않는다.
    expect(renderToStaticMarkup(createElement(TitleTextLayer, { data: { text: '  ', size: 30, place: 'band' }, frameHeight: 640 }))).toBe('')
  })

  it('제목은 화면을 다 덮지 않는다 — 아래 영상은 그대로 그리고, 화면을 다 덮는 영상이 더 위 줄에 있으면 그 아래 제목은 가려진다', () => {
    // 왜: 프리미어처럼 위 줄이 아래 줄을 가린다(시안 E3). 제목은 영상 계산(맨 위 클립 · 전환)에 끼지 않는다 — 내보내기도 ⑦ 전까지는 건너뛴다.
    const id = api().addTitleClip('v2', 3, '우산')!
    expect(selectProgramLayout(api()).some((l) => l.shotId === id)).toBe(false)
    api().moveClipToTrack('C', 'v3', 3)
    expect(selectTitlesAt(api(), 4).map((l) => l.shotId)).toEqual([])
    api().setClipMotion(['C'], { scale: 0.5 })
    expect(selectTitlesAt(api(), 4).map((l) => l.shotId)).toEqual([id])
    api().toggleTrackVisible('v2')
    expect(selectTitlesAt(api(), 4)).toEqual([])
  })

  it('빈 끝의 교차 디졸브로 제목이 서서히 나타나고 사라지며, 맞닿은 두 제목 사이 교차 디졸브는 앞 제목이 옅어지는 동안 뒤 제목이 짙어진다', () => {
    // 왜: 제목의 전환은 제목 글자만 옅게 한다(아래 영상은 그대로).
    const a = api().addTitleClip('v2', 2, '하나')!
    const b = api().addTitleClip('v2', 4, '둘')!
    api().dropTransition(a, 'start', 'cross')
    api().dropTransition(b, 'start', 'cross')
    const titles = selectVideoLayout(api()).filter((l) => l.trackId === 'v2')
    const windows = transitionWindows(selectVideoLayout(api()), api().videoClips)
    expect(titleLayersAt(titles, windows, 2.25)).toEqual([{ shotId: a, fade: 0.25 }])
    expect(titleLayersAt(titles, windows, 3.75)).toEqual([{ shotId: a, fade: 0.75 }, { shotId: b, fade: 0.25 }])
    expect(titleLayersAt(titles, windows, 4.25)).toEqual([{ shotId: a, fade: 0.25 }, { shotId: b, fade: 0.75 }])
    expect(titleLayersAt(titles, windows, 5)).toEqual([{ shotId: b, fade: 1 }])
  })

  it('제목 클립은 저장했다 다시 열어도 줄 · 자리 · 길이 · 글자 · 크기 · 위치 · 모션 · 불투명도 · 전환 그대로다', async () => {
    // 왜: 제목은 편집기 저장본(editor_states)에만 있다 — DB 에 없는 클립이다.
    const id = api().addTitleClip('v3', 5, '우산')!
    api().updateTitleText(id, { size: 50, place: 'top' })
    api().setTrim(id, 0, 3)
    api().setClipMotion([id], { y: -0.3 })
    api().setClipOpacity([id], 0.8)
    api().dropTransition(id, 'end', 'cross')
    await saveEditorNow('project-title')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor
    expect(saved.placements?.[id]).toEqual({ trackId: 'v3', startSec: 5 })
    canonical()
    await api().loadPersisted()
    expect(placeOf(id)).toMatchObject({ trackId: 'v3', startSec: 5, durationSec: 3 })
    expect(shotOf(id)?.titleText).toEqual({ text: '우산', size: 50, place: 'top' })
    expect(clipOf(id)).toMatchObject({ motion: { x: 0, y: -0.3, scale: 1 }, opacity: 0.8, transitionOut: { type: 'cross', durationSec: 1 } })
  })
})

describe('검토 c ⑥ (F) — 리드 11/14 같이 정한 것', () => {
  it('제목 끝 물들이기는 화면 전체 막이고, 눈 끈 줄 · 가려진 제목은 그리지 않는다', () => {
    // 왜: 검토 c ⑥ U4(보통) — 제목 자리를 모두 세어, 눈을 끈 V2 의 제목 · V3 전체 화면 영상에 덮인 제목의 검정 물들이기도 0.5 로 그렸다.
    //   그 시각 화면에 보이는 제목만 센다 — ⑦ 내보내기도 같은 셈을 쓴다.
    const id = api().addTitleClip('v2', 1, '우산')!
    api().dropTransition(id, 'end', 'dissolve')
    expect(selectTitleDipsAt(api(), 2.75)).toEqual({ black: 0.5, white: 0 })
    api().toggleTrackVisible('v2')
    expect(selectTitleDipsAt(api(), 2.75)).toEqual({ black: 0, white: 0 })
    api().toggleTrackVisible('v2')
    api().moveClipToTrack('C', 'v3', 2)
    expect(selectTitleDipsAt(api(), 2.75)).toEqual({ black: 0, white: 0 })
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/selectTitleDipsAt\(st, t\)/)
  })

  it('제목 클립 우클릭 메뉴 머리는 "제목 · 2.0s"(영어 "Title clip · 2.0s")다', () => {
    // 왜: 검토 c ⑥(낮음) — 만들 때 붙인 샷 종류 "WS"가 메뉴 머리에 보였다(타이틀 카드에서 디자이너가 짚은 N 353:351 과 같은 고장).
    const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
    const en = (key: string, params?: Record<string, string | number>) => translate('en', key, params)
    expect(clipMenuTitle({ isTitleCard: false, isTitleClip: true, shotType: 'WS', durationSec: 2 }, ko)).toBe('제목 · 2.0s')
    expect(clipMenuTitle({ isTitleCard: false, isTitleClip: true, shotType: 'WS', durationSec: 2 }, en)).toBe('Title clip · 2.0s')
    expect(read('src/features/editor/timeline.tsx')).toMatch(/clipMenuTitle\(\{ isTitleCard: isTitleCardShotId\(item\.shotId\), isTitleClip: isTitleClipShotId\(item\.shotId\)/)
  })

  it('문자 도구로 V1 을 누르면 그 위 가장 가까운 잠기지 않은 V 줄에 제목이 생기고, 그런 줄이 없으면 만들지 않고 까닭을 한 줄 알린다', () => {
    // 왜: 검토 c ⑥(낮음) — V2 를 지웠거나 잠갔으면 V1 을 눌러도 말없이 아무 일도 없었다.
    api().toggleTrackLock('v2')
    const id = api().addTitleClip('v1', 1, '우산')!
    expect(placeOf(id)?.trackId).toBe('v3')
    api().toggleTrackLock('v3')
    expect(api().addTitleClip('v1', 4, '비')).toBeNull()
    const page = read('src/app/studio/editor/page.tsx')
    expect(page).toMatch(/if \(!created && trackId === 'v1'\) toast\.info\(t\('There is no track to put the title on\. Add V2 or unlock a track\.'\)\)/)
    expect(translate('ko', 'There is no track to put the title on. Add V2 or unlock a track.')).toBe('제목을 놓을 줄이 없어요. V2 를 더하거나 잠금을 풀어 주세요.')
  })
})

