// 가우시안 흐림 [일정하게] · [시작 → 끝] — 흐림이 클립 처음에서 끝까지 곧은 줄로 바뀌고, 모니터 · 내보낸 파일 · 저장본 · 자르기 · 가장자리 · 교차 디졸브에서 같은 값을 쓰는지 검사한다 (D14, 2026-11-22)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-blur' as string | null }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: mocks.projectId }), {
    getState: () => ({ projectId: mocks.projectId }),
  }),
}))

import { saveEditorNow, selectFrameAt, selectTimelineLayout, useEditorStore } from '@/stores/editor-store'
import { drawPlanFrame, type FrameSources } from '@/lib/editor-draft-render'
import { blurAt, blurMode, hasVideoEffects, videoEffectFilter } from '@/lib/editor/video-effects'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { ClipEffects, Shot, VideoClip } from '@/types'

const LOCAL_KEY = 'tale:editor:v1:project-blur'
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
const clipOf = (id: string) => api().videoClips.find((c) => c.shotId === id)
/** 클립의 효과 칸을 바로 넣는다 — 화면에서 고르는 길은 효과 컨트롤 시험이 따로 본다. */
const setEffects = (id: string, effects: ClipEffects) =>
  useEditorStore.setState({ videoClips: api().videoClips.map((c) => (c.shotId === id ? { ...c, effects } : c)) })
/** 그 시각 그 클립 층의 흐림 세기(0 ~ 1) — 모니터와 내보내기가 같이 읽는 그릴 것 목록의 값. 흐림이 없으면 undefined. */
const blurOf = (id: string, t: number) => selectFrameAt(api(), t).layers.find((l) => l.shotId === id)?.blur
/** 내보내기가 그릴 바탕 — 영상은 이름표만 단 가짜 그림(1280×720), 클립 · 샷은 지금 스토어 값. */
function sources(): FrameSources {
  const st = api()
  return {
    label: (shotId) => shotId,
    video: (shotId) => (st.videoClips.find((c) => c.shotId === shotId)?.url ? ({ id: `vid-${shotId}`, videoWidth: 1280, videoHeight: 720 } as unknown as HTMLVideoElement) : null),
    titleCards: new Map(),
    shots: new Map(st.shots.map((x) => [x.shotId, x])),
    clips: new Map(st.videoClips.map((c) => [c.shotId, c])),
    filterOk: true,
  }
}
/** 내보내기가 그 시각 한 장(1280×720)을 그리며 캔버스에 넣은 filter 글 — 캔버스 대신 넣은 값을 적는다. */
function exportFilters(t: number): string[] {
  const filters: string[] = []
  const state: Record<string, unknown> = { globalAlpha: 1, filter: 'none', fillStyle: '#000000', font: '' }
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target) return target[key]
      if (key === 'measureText') return (s: string) => ({ width: String(s).length * 10 })
      return () => undefined
    },
    set(target, key, value) {
      if (typeof key === 'string') {
        target[key] = value
        if (key === 'filter') filters.push(String(value))
      }
      return true
    },
  })
  drawPlanFrame(ctx as unknown as CanvasRenderingContext2D, 1280, 720, selectFrameAt(api(), t), sources())
  return filters
}

beforeEach(() => {
  localStorage.clear()
  mocks.projectId = 'project-blur'
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  seed()
})
afterEach(() => {
  vi.unstubAllGlobals()
  ;(globalThis as { window?: unknown }).window = globalThis
  localStorage.clear()
})

describe('같이 정한 것', () => {
  it('[일정하게]면 흐림이 클립 처음부터 끝까지 같은 값이다', () => {
    // 왜: D14 "일정하게" — 지금까지의 흐림(값 하나) 그대로다. 정상 경로 고정.
    api().addVideoEffect('B', 'blur')
    expect(blurMode(clipOf('B')?.effects)).toBe('constant')
    for (const t of [4, 5, 6, 7.9]) expect(blurOf('B', t)).toBe(0.3)
    // 내보낸 파일 — 흐림 반지름 = 세기 × 틀 폭(1280)의 4%.
    expect(exportFilters(4)).toEqual(['blur(15.36px)'])
    expect(exportFilters(7.9)).toEqual(['blur(15.36px)'])
  })

  it('[시작 → 끝]이면 흐림이 클립이 시작할 때 시작 %에서 끝날 때 끝 %까지 곧은 줄로 바뀐다 — 한가운데는 두 값의 가운데다', () => {
    // 왜: D14 "시작%, 끝%" · "무조건 선형적으로". 30% → 0% 는 흐렸다가 또렷해지는 쓰임새(방안 D14)다. 클립 B 는 4초에 시작해 8초에 끝난다.
    setEffects('B', { blur: 0.3, blurEnd: 0 })
    expect(blurMode(clipOf('B')?.effects)).toBe('ramp')
    expect(blurOf('B', 4)).toBe(0.3)
    expect(blurOf('B', 5)).toBeCloseTo(0.225, 3)
    expect(blurOf('B', 6)).toBeCloseTo(0.15, 3)
    expect(blurOf('B', 7)).toBeCloseTo(0.075, 3)
    expect(blurAt({ blur: 0.3, blurEnd: 0 }, 1)).toBe(0)
    // 거꾸로(또렷 → 흐림)도 같은 곧은 줄이다.
    setEffects('B', { blur: 0.2, blurEnd: 1 })
    expect(blurOf('B', 6)).toBeCloseTo(0.6, 3)
  })

  it('같은 시각이면 모니터와 내보낸 파일의 흐림이 같은 값이다 — 모니터는 재생 중에도 멈춘 채 옮겨도 그 시각 흐림으로 그린다', () => {
    // 왜: D14 · 약속 R7(오너 답 3 "미리 보기의 모든 것") — 둘 다 같은 그릴 것 목록의 흐림 값을 같은 함수로 그린다.
    //   예전 모니터는 흐림을 그릴 때 한 번만 정해(시간에 따라 바뀌지 않음) 재생 고리가 장마다 쓰도록 옮겼다.
    setEffects('B', { blur: 0.3, blurEnd: 0 })
    expect(exportFilters(5)).toEqual(['blur(11.52px)'])
    expect(exportFilters(6)).toEqual(['blur(7.68px)'])
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/videoEffectFilter\([^\n]*layer\.blur\)/)
    expect(previewer).toMatch(/\.style\.filter = /)
    // 그릴 때 정하는 모양(위치 · 비율)에는 filter 를 싣지 않는다 — 두 곳이 쓰면 재생 고리 값을 덮어 깜빡인다.
    const layerStyle = previewer.match(/function layerStyle[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(layerStyle).not.toBe('')
    expect(layerStyle).not.toMatch(/filter/)
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/videoEffectFilter\([^\n]*layer\.blur\)/)
  })

  it('흑백 · 밝기 및 대비 · 모션 · 불투명도는 흐림이 [시작 → 끝]이어도 클립마다 값 하나다', () => {
    // 왜: D14 는 흐림만 — 다른 효과 · 모션 · 불투명도는 지금처럼 클립 처음부터 끝까지 같다.
    setEffects('B', { blackWhite: true, blur: 0.3, blurEnd: 0, brightnessContrast: { brightness: 0.2, contrast: 0 } })
    api().setClipOpacity(['B'], 0.8)
    const [early] = exportFilters(4.5)
    const [late] = exportFilters(7.5)
    expect(early).toMatch(/^grayscale\(1\) blur\([\d.]+px\) brightness\(1\.2\)$/)
    expect(late).toMatch(/^grayscale\(1\) blur\([\d.]+px\) brightness\(1\.2\)$/)
    expect(early).not.toBe(late)
    expect(selectFrameAt(api(), 4.5).layers.find((l) => l.shotId === 'B')?.alpha).toBe(0.8)
    expect(selectFrameAt(api(), 7.5).layers.find((l) => l.shotId === 'B')?.alpha).toBe(0.8)
  })

  it('예전 저장본의 흐림(값 하나)을 열면 [일정하게] 그 값이다', async () => {
    // 왜: 이미 있는 약속(옛 저장본은 그대로 열린다) — 끝 값 칸이 없는 저장본은 모두 [일정하게]다. 옮기기 코드 없이 그대로 읽는다.
    api().addVideoEffect('B', 'blur')
    await saveEditorNow('project-blur')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor
    // 예전 Editor 가 쓴 흐림 — 값 하나뿐(끝 값 칸 없음).
    saved.videoClips = saved.videoClips.map((c) => (c.shotId === 'B' ? { ...c, effects: { blur: 0.4 } } : c))
    localStorage.setItem(LOCAL_KEY, JSON.stringify(saved))
    seed()
    await api().loadPersisted()
    expect(clipOf('B')?.effects).toEqual({ blur: 0.4 })
    expect(blurMode(clipOf('B')?.effects)).toBe('constant')
    expect(blurOf('B', 4)).toBe(0.4)
    expect(blurOf('B', 7.5)).toBe(0.4)
  })
})

describe('혼자 정한 것', () => {
  it('효과 탭에서 흐림을 끌어 놓으면 [일정하게] 30%로 들어간다', () => {
    // 왜: 지금 약속 · 출시 테스트 그대로(넣자마자 보이게 30%). 예전 Editor 가 흐림을 빼며 남긴 끝 값 칸이 있어도 새로 넣으면 [일정하게]다.
    api().addVideoEffect('B', 'blur')
    expect(clipOf('B')?.effects).toEqual({ blur: 0.3 })
    setEffects('C', { blurEnd: 0.5 })
    api().addVideoEffect('C', 'blur')
    expect(clipOf('C')?.effects).toEqual({ blur: 0.3 })
  })

  it('[일정하게]에서 [시작 → 끝]으로 바꾸면 시작은 지금 값, 끝은 0%다', () => {
    // 왜: 바꾸자마자 흐렸다가 또렷해지는 쓰임새(방안 D14)가 보인다 — 끝 = 시작이면 눌러도 그림이 그대로라 바뀐 줄 모른다.
    api().addVideoEffect('B', 'blur')
    api().setVideoEffect(['B'], { blur: 0.6 })
    api().setVideoEffect(['B'], { blurMode: 'ramp' })
    expect(clipOf('B')?.effects).toEqual({ blur: 0.6, blurEnd: 0 })
  })

  it('[시작 → 끝]에서 [일정하게]로 바꾸면 시작 값 하나로 일정해진다', () => {
    // 왜: 흐림 칸이 곧 시작 값이다. 끝 값은 되돌리기로만 돌아온다.
    setEffects('B', { blur: 0.6, blurEnd: 0.2 })
    api().setVideoEffect(['B'], { blurMode: 'constant' })
    expect(clipOf('B')?.effects).toEqual({ blur: 0.6 })
    for (const t of [4, 7.5]) expect(blurOf('B', t)).toBe(0.6)
  })

  it('[시작 → 끝]의 시작 · 끝은 각각 0 ~ 100%로 바뀐다', () => {
    // 왜: 지금 흐림 슬라이더와 같은 범위다. 밖의 값은 끝 값으로 자른다.
    setEffects('B', { blur: 0.3, blurEnd: 0 })
    api().setVideoEffect(['B'], { blur: 1.5, blurEnd: -0.2 })
    expect(clipOf('B')?.effects).toEqual({ blur: 1, blurEnd: 0 })
    api().setVideoEffect(['B'], { blurEnd: 0.45 })
    expect(clipOf('B')?.effects).toEqual({ blur: 1, blurEnd: 0.45 })
  })

  it('클립을 자르면 앞 조각은 시작 → 자른 자리 값, 뒤 조각은 자른 자리 값 → 끝이 되어 화면이 그대로다', () => {
    // 왜: 자르기만 해서 그림이 튀면 안 된다(지금 모션 · 효과를 두 조각이 이어받는 까닭과 같고, 프리미어도 키프레임이 제자리에 남는다).
    //   C 도구 · [여기서 분할] · Ctrl+K 가 모두 같은 나누기를 쓴다.
    setEffects('B', { blur: 0.3, blurEnd: 0 })
    const before = [4.5, 5.5, 6.5, 7.5].map((t) => blurOf('B', t) ?? NaN)
    api().splitVideoClipAt('B', 6)
    const piece = selectTimelineLayout(api()).find((l) => l.shotId.startsWith('B__c'))!.shotId
    expect(clipOf('B')?.effects).toEqual({ blur: 0.3, blurEnd: 0.15 })
    expect(clipOf(piece)?.effects).toEqual({ blur: 0.15, blurEnd: 0 })
    const after = [blurOf('B', 4.5), blurOf('B', 5.5), blurOf(piece, 6.5), blurOf(piece, 7.5)]
    after.forEach((value, i) => expect(value).toBeCloseTo(before[i], 2))
    // Ctrl+K — 고른 것이 없으면 플레이헤드에 걸린 클립을 나눈다(5초 = 앞 조각 B 의 한가운데).
    useEditorStore.setState({ currentTime: 5, selectedShotIds: [], selectedClipShotId: null, selectedAudioIds: [], selectedAudioId: null })
    api().splitAtPlayhead()
    const second = selectTimelineLayout(api()).find((l) => l.shotId.startsWith('B__c') && l.shotId !== piece)!.shotId
    expect(clipOf('B')?.effects).toEqual({ blur: 0.3, blurEnd: 0.225 })
    expect(clipOf(second)?.effects).toEqual({ blur: 0.225, blurEnd: 0.15 })
  })

  it('[일정하게]인 클립을 자르면 두 조각 모두 같은 값 하나다', () => {
    // 왜: 지금 약속 그대로(자른 두 조각은 효과를 그대로 이어받는다) — 나눌 값이 없다.
    api().addVideoEffect('B', 'blur')
    api().splitVideoClipAt('B', 6)
    const piece = selectTimelineLayout(api()).find((l) => l.shotId.startsWith('B__c'))!.shotId
    expect(clipOf('B')?.effects).toEqual({ blur: 0.3 })
    expect(clipOf(piece)?.effects).toEqual({ blur: 0.3 })
  })

  it('클립 가장자리를 끌어 늘이거나 줄이거나 속도를 바꾸면 시작 · 끝 %는 그대로이고, 바뀐 길이에 걸쳐 다시 곧게 바뀐다', () => {
    // 왜: 오너 "클립 처음에서 끝까지" — 손대지 않은 % 숫자가 저절로 바뀌지 않는다. 원본 시각에 붙이면 줄일 때 끝 % 가 저절로 바뀌고,
    //   늘일 때 없는 값을 지어내야 한다.
    setEffects('B', { blur: 0.3, blurEnd: 0 })
    api().setTrim('B', 0, 2) // B 는 4–6초
    expect(clipOf('B')?.effects).toEqual({ blur: 0.3, blurEnd: 0 })
    expect(blurOf('B', 4)).toBe(0.3)
    expect(blurOf('B', 5)).toBeCloseTo(0.15, 3)
    api().setTrim('B', 0, 4) // 다시 4–8초
    api().setSpeed('B', 2) // 두 배 빠르게 — 다시 4–6초
    expect(clipOf('B')?.effects).toEqual({ blur: 0.3, blurEnd: 0 })
    expect(blurOf('B', 5)).toBeCloseTo(0.15, 3)
  })

  it('교차 디졸브로 클립이 제자리 밖에서 그려지는 동안은 흐림이 시작 · 끝 값에 멈춘다', () => {
    // 왜: 맞닿은 컷의 교차 디졸브는 경계 앞뒤로 반씩 걸친다 — 원본 영상도 그 구간에서는 첫 장 · 끝 장에 멈춘다(같은 규칙).
    //   흐림 줄을 디졸브 구간까지 늘이지 않는다.
    setEffects('B', { blur: 0.3, blurEnd: 0.1 })
    setEffects('C', { blur: 0.5, blurEnd: 0 })
    api().dropTransition('C', 'start', 'cross') // 1초 — 7.5 ~ 8.5초
    // 8.25초: B 는 제 끝(8초)을 지나 그려진다 → 끝 값. 7.75초: C 는 제 시작(8초) 전에 그려진다 → 시작 값.
    expect(blurOf('B', 8.25)).toBe(0.1)
    expect(blurOf('C', 7.75)).toBe(0.5)
    // 제자리 안은 곧은 줄 그대로다.
    expect(blurOf('C', 10)).toBeCloseTo(0.25, 3)
  })

  it('여러 클립을 골랐으면 방식 바꾸기는 흐림을 넣은 클립 모두에, 끝 값은 [시작 → 끝]인 클립에만 들어간다', () => {
    // 왜: "넣은 효과에만 값을 바꾼다"(지금 효과 컨트롤 규칙) — 끝 값을 끌었다고 [일정하게]인 클립이 저절로 [시작 → 끝]이 되지 않는다.
    setEffects('B', { blur: 0.3, blurEnd: 0 })
    setEffects('C', { blur: 0.5 })
    api().setVideoEffect(['A', 'B', 'C'], { blurEnd: 0.4 })
    expect([clipOf('A')?.effects, clipOf('B')?.effects, clipOf('C')?.effects]).toEqual([undefined, { blur: 0.3, blurEnd: 0.4 }, { blur: 0.5 }])
    api().setVideoEffect(['A', 'B', 'C'], { blurMode: 'ramp' })
    expect([clipOf('A')?.effects, clipOf('B')?.effects, clipOf('C')?.effects]).toEqual([undefined, { blur: 0.3, blurEnd: 0.4 }, { blur: 0.5, blurEnd: 0 }])
  })

  it('흐림을 빼면 끝 값도 같이 빠진다', () => {
    // 왜: 빈 fx 표시가 남지 않게 — 흐림의 끝 값은 흐림의 칸이다. 예전 Editor 가 흐림만 빼 끝 값 칸만 남은 클립도 효과 없는 클립이다.
    setEffects('B', { blur: 0.3, blurEnd: 0 })
    api().removeVideoEffect(['B'], 'blur')
    expect(clipOf('B')).not.toHaveProperty('effects')
    setEffects('C', { blurEnd: 0.5 })
    expect(hasVideoEffects(clipOf('C'))).toBe(false)
    expect(blurOf('C', 9)).toBeUndefined()
  })

  it('저장본에는 끝 값 칸 하나만 더해지고 판은 2 그대로다 — 다시 열어도 [시작 → 끝] 그대로이고 자른 조각도 그렇다', async () => {
    // 왜: 리드 11/22 답 1(칸 하나 · 판 그대로). 판을 올리면 되돌린 예전 Editor 가 새로 저장된 모든 프로젝트에 서버 저장을 못 한다
    //   (서버가 낮은 판의 쓰기를 409 로 막는다).
    setEffects('B', { blur: 0.3, blurEnd: 0 })
    api().splitVideoClipAt('B', 6)
    await saveEditorNow('project-blur')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor
    expect(saved.version).toBe(2)
    expect(saved.videoClips.find((c) => c.shotId === 'B')?.effects).toEqual({ blur: 0.3, blurEnd: 0.15 })
    seed()
    await api().loadPersisted()
    const piece = selectTimelineLayout(api()).find((l) => l.shotId.startsWith('B__c'))!.shotId
    expect(clipOf('B')?.effects).toEqual({ blur: 0.3, blurEnd: 0.15 })
    expect(clipOf(piece)?.effects).toEqual({ blur: 0.15, blurEnd: 0 })
  })

  it('[시작 → 끝]으로 저장해도 흐림 칸은 시작 값 숫자 그대로라, 예전 Editor 로 되돌리면 시작 값으로 일정하게 보인다 — 끝 값은 지워지지 않는다', async () => {
    // 왜: 리드 11/22 답 1 — 되돌리기 등급(비쌈)의 근거다. 예전 Editor 는 시각 없이 흐림 칸만 읽어 그리고, 끝 값 칸은 효과 묶음째 옮겨 남긴다.
    setEffects('B', { blur: 0.3, blurEnd: 0 })
    await saveEditorNow('project-blur')
    const effects = (JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor).videoClips.find((c) => c.shotId === 'B')?.effects
    expect(typeof effects?.blur).toBe('number')
    // 예전 Editor 의 그리기 — 시각 없이 효과 묶음만 넘긴다.
    expect(videoEffectFilter(effects, 1000)).toBe('blur(12px)')
    expect(effects).toHaveProperty('blurEnd', 0)
  })
})
