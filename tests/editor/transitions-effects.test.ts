// Editor 전환 · 효과(효과 탭에서 끌어 놓기) — 끝마다 놓이는 전환 · 교차 디졸브 · 흰색으로 물들이기 · 페이드 · 흑백 · 흐림 · 밝기 및 대비가 클립 · 모니터 · 효과 컨트롤 · 저장본에 들어가는지 검사한다 (2단계 ⑤, 시안 E2 409:5316–5347, 2026-11-14)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-effects' as string | null }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: mocks.projectId }), {
    getState: () => ({ projectId: mocks.projectId }),
  }),
}))

import { saveEditorNow, selectProgramLayout, selectStackAt, selectTimelineLayout, selectVideoLayout, useEditorStore } from '@/stores/editor-store'
import { useLocaleStore } from '@/stores/locale-store'
import { EffectControls } from '@/features/editor/effect-controls'
import { EffectsPanel } from '@/features/editor/effects-panel'
import { ProjectPanel } from '@/features/editor/video-source-panel'
import { AudioFadeMarks, FxBadge, TransitionMarks } from '@/features/editor/timeline-transitions'
import {
  audioFadeGain,
  crossOverlayAt,
  crossSourceSec,
  dipOpacityAt,
  dissolveOpacityAt,
  dropEdge,
  edgeFadeAt,
  edgeTransition,
  transitionWindows,
} from '@/lib/editor/transition'
import { hasVideoEffects, videoEffectFilter } from '@/lib/editor/video-effects'
import { editorChatContext } from '@/lib/editor/chat-context'
import { SEQUENCE_FPS } from '@/lib/editor/sequence-info'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

const LOCAL_KEY = 'tale:editor:v1:project-effects'
const api = () => useEditorStore.getState()
const read = (file: string) => readFileSync(file, 'utf8')
const shot = (shotId: string): Shot =>
  ({ shotId, sceneId: 'sc_1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds: 4, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
const clip = (shotId: string): VideoClip => ({ shotId, url: `https://video.test/${shotId}.mp4`, status: 'completed', thumbnailUrl: null })
const linked = (shotId: string, startSec: number): AudioTrackClip => ({
  id: `a_${shotId}`, name: `${shotId} audio`, url: `https://video.test/${shotId}.mp4`, startSec, durationSec: 4, volume: 1, muted: false,
  sourceOffsetSec: 0, sourceDurationSec: 4, trackId: 'atrack_1', linkedShotId: shotId,
})
/** A · B · C 세 샷(4초씩)을 V1 에 붙여 깔고(0–4 · 4–8 · 8–12) 소리를 잇는다. */
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
const audioOf = (id: string) => api().audioClips.find((a) => a.id === id)
const windows = () => transitionWindows(selectVideoLayout(api()), api().videoClips)
const program = () => selectProgramLayout(api())
/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(tests/editor/panels.test.ts 와 같은 방법). */
function html(el: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useEditorStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(el)
}
/** 그린 글자만 — 태그 · 속성과 스크롤 판이 넣는 <style> 글은 뺀다. */
const text = (markup: string) =>
  markup.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
/** 골라져 있는(aria-pressed="true") 칩 글자. */
const pressed = (markup: string) => [...markup.matchAll(/aria-pressed="true"[^>]*>([^<]*)</g)].map((m) => m[1].trim())
const controls = () => text(html(createElement(EffectControls)))

beforeEach(() => {
  localStorage.clear()
  mocks.projectId = 'project-effects'
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
  it('프로젝트 옆 [효과] 탭에는 비디오 전환(교차 디졸브 · 검정으로 물들이기 · 흰색으로 물들이기) · 오디오 전환(지속 가감 (페이드)) · 비디오 효과(흑백 · 가우시안 흐림 · 밝기 및 대비)가 있다', () => {
    // 왜: 시안 E2 409:5308–5347. 정상 경로 고정 — 시안 차례 그대로, 맨 아래에 놓는 법 안내.
    const tabs = text(html(createElement(ProjectPanel, {
      shots: api().shots, videoClips: api().videoClips, audioSources: [], newItems: [],
      onOpenSource: () => {}, onAddClip: () => {}, onAddClipAtPlayhead: () => {}, onAddAudioFromSource: () => {},
      onAddAudioSource: () => {}, onRemoveAudioSource: () => {}, onBinDragStart: () => {}, onBinDragEnd: () => {}, onSetBinDropSec: () => {},
    })))
    expect(tabs).toMatch(/^프로젝트 효과 /)
    expect(text(html(createElement(EffectsPanel)))).toBe(
      '비디오 전환 ⇄ 교차 디졸브 ⇄ 검정으로 물들이기 ⇄ 흰색으로 물들이기 오디오 전환 ⇄ 지속 가감 (페이드) 비디오 효과 fx 흑백 fx 가우시안 흐림 fx 밝기 및 대비 클립 위로 끌어 놓아요 · 앞쪽 절반은 시작, 뒤쪽은 끝에 들어가요',
    )
  })

  it('전환을 클립 앞쪽 절반에 끌어 놓으면 시작에, 뒤쪽 절반에 놓으면 끝에 들어간다', () => {
    // 왜: 시안 E2 409:5347 "앞쪽 절반은 시작, 뒤쪽은 끝에 들어가요". 가운데는 뒤쪽이다.
    expect(dropEdge({ left: 100, width: 80 }, 120)).toBe('start')
    expect(dropEdge({ left: 100, width: 80 }, 140)).toBe('end')
    expect(dropEdge({ left: 100, width: 80 }, 175)).toBe('end')
    api().dropTransition('C', 'end', 'white')
    expect(clipOf('C')?.transitionOut).toEqual({ type: 'white', durationSec: 1 })
    api().dropTransition('A', 'start', 'cross')
    expect(clipOf('A')?.transitionIn).toEqual({ type: 'cross', durationSec: 1 })
    const panel = read('src/features/editor/effects-panel.tsx')
    expect(panel).toMatch(/startBinDrag\(/)
    expect(panel).toMatch(/dropEdge\(/)
  })

  it('전환이 없는 시작 · 끝은 효과 컨트롤에 "없음 · 효과 탭에서 끌어 놓아요"라고 쓴다', () => {
    // 왜: 시안 E1 409:4699–4701 · E3 409:5839–5845.
    api().selectClip('B')
    expect(controls()).toContain('전환 시작 없음 · 효과 탭에서 끌어 놓아요 끝 없음 · 효과 탭에서 끌어 놓아요')
  })

  it('앞 클립과 맞닿은 시작에 교차 디졸브가 있으면 효과 컨트롤에 "교차 디졸브 · 앞 클립과 이어짐"과 0.5 · 1 · 2초 칸이 보이고 지금 길이가 골라져 있다', () => {
    // 왜: 시안 E1 409:4689–4697.
    api().dropTransition('B', 'start', 'cross')
    api().selectClip('B')
    const markup = html(createElement(EffectControls))
    expect(text(markup)).toContain('시작 교차 디졸브 · 앞 클립과 이어짐 0.5초 1초 2초')
    expect(pressed(markup)).toContain('1초')
  })

  it('영상 효과가 있는 클립은 타임라인 이름 앞에 fx 표시가 붙는다', () => {
    // 왜: 시안 E2 409:5483 — 효과를 넣은 클립을 타임라인에서 바로 알아본다.
    expect(hasVideoEffects(clipOf('B'))).toBe(false)
    api().addVideoEffect('B', 'blackWhite')
    expect(hasVideoEffects(clipOf('B'))).toBe(true)
    expect(text(renderToStaticMarkup(createElement(FxBadge)))).toBe('fx')
    const timeline = read('src/features/editor/timeline.tsx')
    expect(timeline).toMatch(/hasVideoEffects\(clip\) \? <FxBadge \/> : null/)
  })

  it('교차 디졸브는 앞 클립과 뒤 클립을 섞는다 — 경계 앞에서는 뒤 클립이 점점 짙어지며 겹치고, 경계 뒤에서는 앞 클립이 점점 옅어진다', () => {
    // 왜: 오너 결정 4(교차 디졸브 = 앞뒤 클립을 섞는다). 1초 교차 디졸브는 경계(4초) 앞뒤 0.5초씩.
    api().dropTransition('B', 'start', 'cross')
    expect(crossOverlayAt(windows(), program(), 3.75)).toEqual({ shotId: 'B', opacity: 0.25 })
    expect(crossOverlayAt(windows(), program(), 4)).toEqual({ shotId: 'A', opacity: 0.5 })
    expect(crossOverlayAt(windows(), program(), 4.25)).toEqual({ shotId: 'A', opacity: 0.25 })
    expect(crossOverlayAt(windows(), program(), 3.4)).toBeNull()
    expect(crossOverlayAt(windows(), program(), 4.5)).toBeNull()
    // 검은 막은 없다.
    expect(dipOpacityAt(windows(), program(), 4)).toEqual({ black: 0, white: 0 })
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/crossOverlayAt\(windows, layout, t/)
    expect(previewer).toMatch(/data-testid="program-cross-layer"/)
  })

  it('예전 디졸브는 "검정으로 물들이기"로 읽힌다 — 옛 저장본의 디졸브는 검은 막 그대로다', async () => {
    // 왜: 오너 결정 4 · 리드 승인 — 예전 'dissolve' 는 이름만 바뀌었다(검정으로 물들이기). 옛 저장본도 같은 화면 · 같은 그림이다.
    const old = { version: 1, shots: ['A', 'B', 'C'].map(shot), clipOrder: { sc_1: ['A', 'B', 'C'] }, videoClips: [clip('A'), { ...clip('B'), transitionIn: { type: 'dissolve', durationSec: 2 } }, clip('C')], audioClips: [], audioSources: [], audioTracks: [{ id: 'atrack_1' }], panelSizes: { sourceW: 420, previewH: 380 } }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(old))
    canonical()
    await api().loadPersisted()
    expect(clipOf('B')?.transitionIn).toEqual({ type: 'dissolve', durationSec: 2 })
    expect(dipOpacityAt(windows(), program(), 4)).toEqual({ black: 1, white: 0 })
    expect(dissolveOpacityAt(program(), api().videoClips, 4)).toBe(1)
    api().selectClip('B')
    expect(controls()).toContain('시작 검정으로 물들이기 · 앞 클립과 이어짐 0.5초 1초 2초')
  })

  it('영어 화면의 이름은 프리미어와 같다 — Cross dissolve · Dip to black · Dip to white · Constant power · Black & White · Gaussian blur · Brightness & Contrast', () => {
    // 왜: 오너 결정 4 — 영어 이름은 프리미어 효과 이름 그대로.
    useLocaleStore.setState({ locale: 'en' })
    const markup = text(html(createElement(EffectsPanel)))
    for (const name of ['Cross dissolve', 'Dip to black', 'Dip to white', 'Constant power', 'Black & White', 'Gaussian blur', 'Brightness & Contrast']) {
      expect(markup).toContain(name)
    }
  })
})

describe('혼자 정한 것', () => {
  it('맞닿은 컷에는 전환이 하나다 — 앞 클립 끝에 놓아도 뒤 클립 시작에 놓아도 같은 전환이 바뀐다', () => {
    // 왜: 프리미어처럼 컷 하나 = 전환 하나. 앞 클립 끝과 뒤 클립 시작은 같은 컷이라 둘을 따로 두면 겹쳐 그려진다.
    api().dropTransition('A', 'end', 'cross')
    expect(clipOf('B')?.transitionIn).toEqual({ type: 'cross', durationSec: 1 })
    expect(clipOf('A')?.transitionOut).toBeUndefined()
    api().dropTransition('B', 'start', 'white')
    expect(edgeTransition(selectVideoLayout(api()), api().videoClips, 'A', 'end')).toEqual({ transition: { type: 'white', durationSec: 1 }, joined: true })
    expect(windows()).toHaveLength(1)
    // 앞 클립을 골라도 끝 줄에 같은 전환이 "뒤 클립과 이어짐"으로 보인다.
    api().selectClip('A')
    expect(controls()).toContain('끝 흰색으로 물들이기 · 뒤 클립과 이어짐')
  })

  it('교차 디졸브는 컷 앞뒤로 반씩 걸치고, 원본이 모자라면 첫 장 · 끝 장에 멈춘다 — 클립 길이와 자리는 그대로다', () => {
    // 왜: 프리미어 "가운데 정렬" 전환. 앞 클립 뒤 · 뒤 클립 앞에 남은 원본(손잡이)이 없으면 그 장을 멈춰 쓴다.
    const before = selectTimelineLayout(api())
    api().dropTransition('B', 'start', 'cross')
    expect(selectTimelineLayout(api())).toEqual(before)
    expect(windows()[0]).toMatchObject({ fromSec: 3.5, toSec: 4.5, outgoing: 'A', incoming: 'B' })
    // B 는 원본 0초부터 쓰므로 경계 앞에서는 첫 장(0초)에 멈춘다.
    expect(crossSourceSec({ startSec: 4 }, clipOf('B')!, 4, 3.75)).toEqual({ sec: 0, held: true })
    // A 는 원본 끝(4초)까지 쓰므로 경계 뒤에서는 끝 장에 멈춘다.
    expect(crossSourceSec({ startSec: 0 }, clipOf('A')!, 4, 4.25)).toEqual({ sec: 4 - 1 / SEQUENCE_FPS, held: true })
    // 잘라 둔 원본이 남아 있으면 그 장면을 이어 쓴다 — A 를 3초에서 끝냈으면 3 ~ 4초 원본이 남아 있다.
    const trimmed: VideoClip = { ...clipOf('A')!, trimEnd: 3 }
    expect(crossSourceSec({ startSec: 0 }, trimmed, 4, 3.25)).toEqual({ sec: 3.25, held: false })
  })

  it('빈 끝의 교차 디졸브는 아래 줄(없으면 검정)에서 나타나거나 아래 줄로 사라진다', () => {
    // 왜: 프리미어의 한쪽 전환 — 맞닿은 클립이 없는 끝은 그 클립 안쪽에서 투명해진다.
    api().dropTransition('C', 'end', 'cross')
    expect(edgeFadeAt(windows(), 'C', 11.5)).toBe(0.5)
    expect(edgeFadeAt(windows(), 'C', 10)).toBe(1)
    // V2 클립의 빈 시작 — 옅은 동안 아래 줄(V1)이 비쳐 보인다.
    api().moveClipToTrack('C', 'v2', 1)
    api().dropTransition('C', 'start', 'cross')
    expect(edgeFadeAt(windows(), 'C', 1.25)).toBe(0.25)
    expect(selectStackAt(api(), 1.25).map((l) => l.shotId)).toEqual(['A', 'C'])
    expect(selectStackAt(api(), 2.5).map((l) => l.shotId)).toEqual(['C'])
  })

  it('흰색으로 물들이기는 검정으로 물들이기와 같은 자리에서 흰 막으로 그린다', () => {
    // 왜: 오너 결정 4 — 검은 막과 같은 방법(영상 그림은 손대지 않는다), 색만 흰색.
    api().dropTransition('B', 'start', 'white')
    expect(dipOpacityAt(windows(), program(), 4)).toEqual({ black: 0, white: 1 })
    expect(dipOpacityAt(windows(), program(), 3.75)).toEqual({ black: 0, white: 0.5 })
    api().dropTransition('B', 'start', 'dissolve')
    expect(dipOpacityAt(windows(), program(), 3.75)).toEqual({ black: 0.5, white: 0 })
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/data-testid="dip-white-overlay"[^>]*bg-white/)
  })

  it('전환 길이는 0.5 · 1 · 2초 칸으로 고르고 처음은 1초다', () => {
    // 왜: 지금 디졸브 칸과 같다. 끌어 놓은 전환은 1초로 시작하고, 종류를 바꿔 놓아도 고른 길이는 그대로다.
    api().dropTransition('B', 'start', 'cross')
    api().setTransitionLength(['B'], 'start', 2)
    expect(clipOf('B')?.transitionIn).toEqual({ type: 'cross', durationSec: 2 })
    api().dropTransition('B', 'start', 'dissolve')
    expect(clipOf('B')?.transitionIn).toEqual({ type: 'dissolve', durationSec: 2 })
    api().selectClip('B')
    expect(pressed(html(createElement(EffectControls)))).toContain('2초')
  })

  it('클립 우클릭 메뉴의 시작 · 끝 전환은 세 전환(교차 디졸브 · 검정으로 물들이기 · 흰색으로 물들이기) 중에서 고르고 길이도 고른다', () => {
    // 왜: 예전 우클릭 메뉴는 검은 디졸브 하나였다 — 효과 탭과 같은 세 전환으로.
    const timeline = read('src/features/editor/timeline.tsx')
    expect(timeline).toMatch(/t\('Start transition'\)/)
    expect(timeline).toMatch(/t\('End transition'\)/)
    expect(timeline).toMatch(/VIDEO_TRANSITIONS\.map\(/)
    expect(timeline).toMatch(/TRANSITION_CHOICES\.map\(/)
    expect(timeline).toMatch(/onSetTransition\(targets, edge, /)
  })

  it('페이드를 소리 조각 앞쪽 절반에 놓으면 페이드 인, 뒤쪽 절반에 놓으면 페이드 아웃이고 길이는 0.5 · 1 · 2초(처음 1초)다', () => {
    // 왜: 프리미어 "지속 가감"(Constant power) — 소리가 0에서 커지거나 0으로 작아진다. 곡선은 사인(같은 힘)이다.
    api().dropAudioFade('a_A', 'start')
    api().dropAudioFade('a_A', 'end')
    expect(audioOf('a_A')).toMatchObject({ fadeInSec: 1, fadeOutSec: 1 })
    api().setAudioFade('a_A', 'start', 0.5)
    expect(audioOf('a_A')?.fadeInSec).toBe(0.5)
    const a = audioOf('a_A')!
    expect(audioFadeGain(a, 0)).toBe(0)
    expect(audioFadeGain(a, 0.25)).toBeCloseTo(Math.SQRT1_2, 3)
    expect(audioFadeGain(a, 2)).toBe(1)
    expect(audioFadeGain(a, 3.5)).toBeCloseTo(Math.SQRT1_2, 3)
    expect(read('src/features/editor/audio-meter.tsx')).toMatch(/audioFadeGain\(clip, state\.currentTime\)/)
    expect(read('src/features/editor/effects-panel.tsx')).toMatch(/dropAudioFade\(/)
  })

  it('소리 조각을 고르면 효과 컨트롤에 볼륨과 시작 · 끝 페이드가 보인다', () => {
    // 왜: 영상 클립의 전환 줄과 같은 꼴 — 소리의 전환은 페이드 하나다.
    api().dropAudioFade('a_A', 'start')
    api().selectAudioClip('a_A')
    const markup = controls()
    expect(markup).toContain('볼륨 볼륨 100%')
    expect(markup).toContain('전환 시작 지속 가감 (페이드) 0.5초 1초 2초 빼기 끝 없음 · 효과 탭에서 끌어 놓아요')
  })

  it('흑백은 켬 · 끔, 가우시안 흐림은 0 ~ 100%, 밝기 · 대비는 −100 ~ +100%로 바꾼다', () => {
    // 왜: 프리미어 값 범위. 흐림은 처음 30%(넣자마자 보이게), 밝기 · 대비는 0%에서 시작한다.
    api().addVideoEffect('B', 'blackWhite')
    api().addVideoEffect('B', 'blur')
    api().addVideoEffect('B', 'brightnessContrast')
    expect(clipOf('B')?.effects).toEqual({ blackWhite: true, blur: 0.3, brightnessContrast: { brightness: 0, contrast: 0 } })
    api().setVideoEffect(['B'], { blackWhite: false, blur: 1.5, brightness: -2, contrast: 0.4 })
    expect(clipOf('B')?.effects).toEqual({ blackWhite: false, blur: 1, brightnessContrast: { brightness: -1, contrast: 0.4 } })
    // 모니터 그림 — 흐림 100% 는 틀 폭의 4%.
    expect(videoEffectFilter({ blackWhite: true, blur: 0.5, brightnessContrast: { brightness: 0.2, contrast: -0.5 } }, 1000)).toBe('grayscale(1) blur(20px) brightness(1.2) contrast(0.5)')
    expect(videoEffectFilter({ blackWhite: false }, 1000)).toBeUndefined()
  })

  it('효과 컨트롤의 "효과" 묶음에서 넣은 효과를 고치고 [빼기]로 뺀다', () => {
    // 왜: 넣은 효과가 있을 때만 묶음이 보인다(시안 E1 · E3 의 효과 없는 클립 그대로).
    api().selectClip('B')
    expect(controls()).not.toMatch(/효과 흑백/)
    api().addVideoEffect('B', 'blackWhite')
    api().addVideoEffect('B', 'blur')
    api().addVideoEffect('B', 'brightnessContrast')
    api().selectClip('B')
    const markup = html(createElement(EffectControls))
    expect(text(markup)).toContain('효과 흑백 켬 끔 빼기 가우시안 흐림 빼기 흐림 30% 밝기 및 대비 빼기 밝기 0% 대비 0%')
    expect(pressed(markup)).toContain('켬')
    // 모션 · 불투명도 다음, 전환 앞.
    expect(text(markup).indexOf('불투명도')).toBeLessThan(text(markup).indexOf('효과 흑백'))
    expect(text(markup).indexOf('효과 흑백')).toBeLessThan(text(markup).indexOf('전환 시작'))
    api().removeVideoEffect(['B'], 'blur')
    api().removeVideoEffect(['B'], 'blackWhite')
    api().removeVideoEffect(['B'], 'brightnessContrast')
    expect(clipOf('B')).not.toHaveProperty('effects')
  })

  it('전환 · 효과는 모니터 미리 보기에 바로 보인다', () => {
    // 왜: 내보낸 영상에는 ⑦에서 싣는다 — 이 조각은 미리 보기만(리드 승인).
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/videoEffectFilter\(/)
    expect(previewer).toMatch(/dipOpacityAt\(windows, layout, t\)/)
    expect(previewer).toMatch(/edgeFadeAt\(windows, /)
    // 예전 검은 막 함수는 내보내기와 같이 그대로 쓴다.
    expect(previewer).toMatch(/dissolveOpacityAt\(layout, st\.videoClips, t\)/)
  })

  it('끌어 놓기 · 빼기 · 길이 바꾸기는 되돌리기 한 번에 하나씩 돌아간다', () => {
    // 왜: 지금 디졸브 칩 · 마커와 같다 — 한 번 한 일은 한 번에 되돌린다.
    const steps = api().past.length
    api().dropTransition('B', 'start', 'cross')
    api().setTransitionLength(['B'], 'start', 2)
    api().setClipTransition(['B'], 'start', null)
    api().addVideoEffect('B', 'blur')
    api().removeVideoEffect(['B'], 'blur')
    api().dropAudioFade('a_A', 'start')
    api().setAudioFade('a_A', 'start', 2)
    api().setAudioFade('a_A', 'start', null)
    expect(api().past).toHaveLength(steps + 8)
    api().undo()
    expect(audioOf('a_A')?.fadeInSec).toBe(2)
    api().undo()
    expect(audioOf('a_A')?.fadeInSec).toBe(1)
    api().undo()
    api().undo()
    expect(clipOf('B')?.effects).toEqual({ blur: 0.3 })
    api().undo()
    api().undo()
    expect(clipOf('B')?.transitionIn).toEqual({ type: 'cross', durationSec: 2 })
    api().undo()
    expect(clipOf('B')?.transitionIn).toEqual({ type: 'cross', durationSec: 1 })
  })

  it('타이틀 카드에는 전환만 넣고 영상 효과는 넣지 않는다', () => {
    // 왜: 타이틀 카드는 검은 카드라 효과를 쓸 데가 없다(제목은 ⑥ 제목 클립에서 다시 본다).
    api().addTitleCard(0)
    const title = api().shots.find((s) => s.shotId.startsWith('title__'))!.shotId
    api().dropTransition(title, 'start', 'cross')
    expect(clipOf(title)?.transitionIn).toEqual({ type: 'cross', durationSec: 1 })
    api().addVideoEffect(title, 'blackWhite')
    expect(clipOf(title)).not.toHaveProperty('effects')
    api().selectClip(title)
    const markup = controls()
    expect(markup).toContain('전환 시작 교차 디졸브')
    expect(markup).not.toMatch(/효과 흑백|모션/)
    // 효과 탭의 영상 효과는 타이틀 카드 위에 놓이지 않는다.
    expect(read('src/features/editor/effects-panel.tsx')).toMatch(/\[data-clip-drop="video"\]:not\(\[data-title-card\]\)/)
  })

  it('전환 · 효과 · 페이드는 저장했다 다시 열어도 남는다', async () => {
    // 왜: 편집기 저장본(editor_states)에만 있다 — 원본 클립 · 자른 조각 · 소리 조각 모두 되살린다.
    api().dropTransition('C', 'end', 'white')
    api().addVideoEffect('B', 'blur')
    api().splitVideoClipAt('B', 6)
    api().dropAudioFade('a_A', 'end')
    await saveEditorNow('project-effects')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor
    expect(saved.videoClips.find((c) => c.shotId === 'C')).toMatchObject({ transitionOut: { type: 'white', durationSec: 1 } })
    canonical()
    await api().loadPersisted()
    const piece = selectTimelineLayout(api()).find((l) => l.shotId.startsWith('B__c'))!.shotId
    expect(clipOf('C')?.transitionOut).toEqual({ type: 'white', durationSec: 1 })
    expect(clipOf('B')?.effects).toEqual({ blur: 0.3 })
    expect(clipOf(piece)?.effects).toEqual({ blur: 0.3 })
    expect(audioOf('a_A')?.fadeOutSec).toBe(1)
  })
})

describe('구현하며 더한 것', () => {
  it('효과를 끌어 놓으면 그 클립이 골라져 효과 컨트롤에 보인다', () => {
    // 왜: 놓은 효과의 값을 바로 고치게 — 프리미어는 따로 눌러야 해서 놓은 뒤 어디서 고치는지 헤맨다.
    api().dropTransition('B', 'start', 'cross')
    expect(api().selectedShotIds).toEqual(['B'])
    api().addVideoEffect('C', 'blur')
    expect(api().selectedShotIds).toEqual(['C'])
    api().dropAudioFade('a_A', 'start')
    expect(api().selectedAudioIds).toEqual(['a_A'])
  })

  it('잘라 나눈 두 조각은 영상 효과를 이어받고, 시작 전환은 앞 조각 · 끝 전환은 뒷조각에 남는다 — 나눈 자리에는 전환이 없다', () => {
    // 왜: 예전에는 뒷조각이 시작 전환까지 베껴 가져 나눈 자리에 디졸브가 생겼다. 효과는 모션 · 불투명도처럼 이어받는다.
    api().rippleDeleteClip('C')
    api().dropTransition('B', 'start', 'dissolve')
    api().dropTransition('B', 'end', 'cross')
    api().addVideoEffect('B', 'blackWhite')
    api().splitVideoClipAt('B', 6)
    const piece = selectTimelineLayout(api()).find((l) => l.shotId.startsWith('B__c'))!.shotId
    expect(clipOf('B')).toMatchObject({ transitionIn: { type: 'dissolve', durationSec: 1 }, effects: { blackWhite: true } })
    expect(clipOf('B')?.transitionOut).toBeUndefined()
    expect(clipOf(piece)?.transitionIn ?? null).toBeNull()
    expect(clipOf(piece)).toMatchObject({ transitionOut: { type: 'cross', durationSec: 1 }, effects: { blackWhite: true } })
  })

  it('잘라 나눈 소리 조각은 페이드 인을 앞 조각에, 페이드 아웃을 뒷조각에 남긴다', () => {
    // 왜: 나눈 자리에서 소리가 꺼졌다 켜지지 않게.
    api().dropAudioFade('a_A', 'start')
    api().dropAudioFade('a_A', 'end')
    api().splitAudioClipAt('a_A', 2)
    const [front, back] = api().audioClips.filter((a) => a.url === audioOf('a_A')!.url).sort((x, y) => x.startSec - y.startSec)
    expect(front).toMatchObject({ fadeInSec: 1 })
    expect(front).not.toHaveProperty('fadeOutSec')
    expect(back).toMatchObject({ fadeOutSec: 1 })
    expect(back).not.toHaveProperty('fadeInSec')
  })

  it('타임라인의 전환은 컷 위에 반투명 칸으로 그 이름과 함께 보이고, 페이드는 소리 조각 끝에 같은 칸으로 보인다', () => {
    // 왜: 시안 E2 409:5498 "교차 디졸브" 칸. 칸은 눌리지 않는다 — 아래 클립의 가장자리 끌기를 막지 않게.
    api().dropTransition('B', 'start', 'cross')
    api().dropTransition('C', 'end', 'white')
    const markup = html(createElement(TransitionMarks, { windows: windows(), trackId: 'v1', pxPerSec: 10, top: 12, height: 72 }))
    expect(text(markup)).toBe('교차 디졸브 흰색으로 물들이기')
    expect(markup).toMatch(/data-testid="timeline-transition"[^>]*pointer-events-none/)
    expect(markup).toContain('left:35px;width:10px')
    expect(markup).toContain('left:115px;width:10px')
    api().dropAudioFade('a_A', 'start')
    const fades = html(createElement(AudioFadeMarks, { clip: audioOf('a_A')!, pxPerSec: 10 }))
    expect(fades).toMatch(/data-testid="timeline-audio-fade"[^>]*pointer-events-none[^>]*style="left:0;width:10px"/)
  })

  it('Lumi 조언에 싣는 타임라인 요약은 전환 종류를 가려 말한다 — 교차 디졸브 · 흰색으로 물들이기 · 빈 끝의 전환', () => {
    // 왜: 요약이 시작 전환을 모두 "검은 화면으로"라고 적어, 교차 디졸브를 넣은 컷에도 Lumi 가 검은 전환으로 알고 조언했다(⑤에서 종류가 셋이 됨).
    api().dropTransition('B', 'start', 'cross')
    api().dropTransition('C', 'start', 'white')
    api().dropTransition('C', 'end', 'cross')
    const context = editorChatContext(api())
    expect(context).toContain('cross dissolves from the cut before (1s)')
    expect(context).toContain('fades through white from the cut before (1s)')
    expect(context).toContain('cross dissolves at its end (1s)')
  })

  it('효과를 끄는 동안 놓일 자리(전환 · 페이드는 앞쪽 · 뒤쪽 절반, 영상 효과는 클립 전체)가 클립 위에 보인다', () => {
    // 왜: 놓기 전에 시작 · 끝 어느 쪽에 들어갈지 보인다.
    const timeline = read('src/features/editor/timeline.tsx')
    expect(timeline).toMatch(/data-clip-drop="video"/)
    expect(timeline).toMatch(/data-clip-drop="audio"/)
    expect(timeline.match(/EFFECT_DROP_CLASS/g)?.length).toBeGreaterThanOrEqual(2)
    expect(read('src/features/editor/effects-panel.tsx')).toMatch(/dataset\.effectDrop = /)
  })
})
