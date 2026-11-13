// 모니터 · 내보내기가 같이 쓰는 그릴 것 목록 — 시각마다 아래부터 그릴 영상 · 타이틀 카드 · 제목과 그 세기 · 원본 시각, 물들이기 막, 미리 불러 둘 층을 검사한다 (2단계 ⑦, 2026-11-14)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-frame' as string | null }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: mocks.projectId }), {
    getState: () => ({ projectId: mocks.projectId }),
  }),
}))

import { selectFrameAt, selectVideoLayout, useEditorStore, type FramePlan } from '@/stores/editor-store'
import { SEQUENCE_FPS } from '@/lib/editor/sequence-info'
import { canvasFilterSupported, drawPlanFrame, effectsInUse, lateLayers, layerClock, type FrameSources } from '@/lib/editor-draft-render'
import { clipDisplayName } from '@/features/editor/editor-labels'
import { syncLayerVideo } from '@/lib/editor/layer-sync'
import { TITLE_TEXT_WIDTH, drawTitleText, titleTextLines } from '@/lib/editor/title-clip'
import { TitleTextLayer } from '@/features/editor/title-clip-layer'
import { translate } from '@/lib/i18n/translate'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

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
const plan = (t: number, prerollSec = 0) => selectFrameAt(api(), t, { prerollSec })
/** 아래부터 그릴 층의 이름 · 세기. */
const layers = (t: number) => plan(t).layers.map((l) => [l.shotId, l.alpha])
/** 화면에 보이는 몫 — 위 층부터, 화면을 다 덮는 층(영상 · 타이틀 카드)이 그 세기만큼 아래를 가린다(이 시험의 영상은 모두 화면을 다 덮는다). */
function seen(p: FramePlan): Record<string, number> {
  const out: Record<string, number> = {}
  let left = 1
  for (const layer of [...p.layers].reverse()) {
    out[layer.shotId] = Math.round(left * layer.alpha * 1000) / 1000
    left *= 1 - layer.alpha
  }
  return out
}
const titleCardId = () => api().shots.find((s) => s.shotId.includes('__t'))!.shotId
const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
/** 내보내기가 그릴 바탕 — 영상은 이름표만 단 가짜 그림(1280×720), 제목 · 카드 · 클립은 지금 스토어 값, 자리표시 이름은 Editor 와 같은 이름. */
function sources(): FrameSources {
  const st = api()
  return {
    label: (shotId) => clipDisplayName(st, shotId, ko),
    video: (shotId) => (st.videoClips.find((c) => c.shotId === shotId)?.url ? ({ id: `vid-${shotId}`, videoWidth: 1280, videoHeight: 720 } as unknown as HTMLVideoElement) : null),
    titleCards: new Map(st.shots.filter((x) => x.titleCard).map((x) => [x.shotId, { card: x.titleCard!, image: null }])),
    shots: new Map(st.shots.map((x) => [x.shotId, x])),
    clips: new Map(st.videoClips.map((c) => [c.shotId, c])),
    filterOk: true,
  }
}
/** 그리기 기록 — 캔버스 대신 부른 차례를 글로 남긴다(숫자는 셋째 자리까지, 글자 폭은 글자 수 × 10). */
function recordingCanvas() {
  const calls: string[] = []
  const fmt = (v: unknown) =>
    typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v && typeof v === 'object' ? String((v as { id?: string }).id ?? 'obj') : String(v)
  const state: Record<string, unknown> = { globalAlpha: 1, filter: 'none', fillStyle: '#000000', strokeStyle: '#000000', font: '', textAlign: 'start', textBaseline: 'alphabetic', lineJoin: 'miter', lineWidth: 1 }
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        if (key === 'measureText') return { width: String(args[0]).length * 10 }
        calls.push(`${key}(${args.map(fmt).join(',')})`)
        return undefined
      }
    },
    set(target, key, value) {
      if (typeof key === 'string') {
        target[key] = value
        calls.push(`${key}=${fmt(value)}`)
      }
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}
/** 그림 · 세기 · 모션 · 효과만 — 칠하기 준비 글(fillStyle · font 등)은 뺀다. */
const drawn = (calls: string[]) => calls.filter((c) => /^(globalAlpha=|filter=|translate\(|scale\(|drawImage\(|fillText\()/.test(c))
const placeOf = (id: string) => selectVideoLayout(api()).find((l) => l.shotId === id)!

beforeEach(() => {
  localStorage.clear()
  mocks.projectId = 'project-frame'
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  seed()
})
afterEach(() => {
  vi.unstubAllGlobals()
  ;(globalThis as { window?: unknown }).window = globalThis
  localStorage.clear()
})

describe('같이 정한 것 — ⑦ 계획(리드 11/14)', () => {
  it('모니터는 시각마다 그릴 것 목록 하나를 아래 줄부터 그린다 — 영상 · 타이틀 카드 · 제목이 같은 목록에 줄 차례로 있다', () => {
    // 왜: 오너 답 3 "미리 보기의 모든 것"(R7) — 모니터와 내보낸 파일이 같은 목록으로 그려야 같은 그림이 나온다. 정상 경로 고정.
    //   내보내기도 같은 목록을 쓴다 — 아래 '⑦-2 내보내기' 묶음.
    const title = api().addTitleClip('v2', 5, '우산')!
    api().moveClipToTrack('C', 'v3', 5)
    api().setClipMotion(['C'], { scale: 0.5 })
    const p = plan(5.5)
    expect(p.layers.map((l) => [l.shotId, l.kind, l.trackId])).toEqual([['B', 'video', 'v1'], [title, 'title', 'v2'], ['C', 'video', 'v3']])
    expect(p.layers[0]).toMatchObject({ alpha: 1, sourceSec: 1.5, held: false })
    // 자막 · 길이 표시 · 고치는 무대는 그 시각 맨 위 영상(제목 아님)을 따른다.
    expect(p.topShotId).toBe('C')
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/selectFrameAt\(st, t, \{ prerollSec: st\.isPlaying \? PREROLL_SEC : 0 \}\)/)
    expect(previewer).toMatch(/data-testid="program-layer"/)
    // 예전 따로 셈(아래 줄 · 겹침 층 · 제목 층)은 없다.
    expect(previewer).not.toMatch(/selectStackAt\(|selectTitlesAt\(|crossOverlayAt\(|program-under-layer|program-cross-layer|program-title-layer/)
  })

  it('줄인 위 영상 아래 줄의 제목은 그 영상 아래에 그린다 — 화면을 다 덮는 위 영상 아래 제목은 그리지 않는다', () => {
    // 왜: 검토 c ⑥ 갈래 메모 — 제목을 영상 계산 밖에서 맨 위에 얹어, 더 위 줄의 줄인 영상 아래 제목도 그 영상 위로 그려졌다. 줄 차례가 그리는 차례다.
    const under = api().addTitleClip('v2', 5, '우산')!
    api().moveClipToTrack('C', 'v3', 5)
    api().setClipMotion(['C'], { scale: 0.5 })
    expect(plan(5.5).layers.map((l) => l.shotId)).toEqual(['B', under, 'C'])
    // 제목이 위 줄이면 줄인 영상 위다.
    seed()
    const over = api().addTitleClip('v3', 5, '우산')!
    api().moveClipToTrack('C', 'v2', 5)
    api().setClipMotion(['C'], { scale: 0.5 })
    expect(plan(5.5).layers.map((l) => l.shotId)).toEqual(['B', 'C', over])
    // 위 줄 영상이 화면을 다 덮으면 그 아래 제목은 보이지 않는다.
    seed()
    api().addTitleClip('v2', 5, '우산')
    api().moveClipToTrack('C', 'v3', 5)
    expect(plan(5.5).layers.map((l) => l.shotId)).toEqual(['C'])
  })

  it('같은 줄에서 제목과 영상이 맞닿은 컷의 교차 디졸브는 두 쪽 다 보인다 — 제목이 옅어지는 동안 영상이 짙어진다', () => {
    // 왜: 검토 c ⑥ 갈래 메모 — 겹침 층이 제목을 그리지 못해 경계 뒤 영상 쪽 반만 보였다(경계에서 제목이 갑자기 사라짐).
    const title = api().addTitleClip('v2', 2, '제목')!
    api().moveClipToTrack('C', 'v2', 4)
    api().dropTransition('C', 'start', 'cross')
    expect(layers(3.75)).toEqual([['A', 1], [title, 1], ['C', 0.25]])
    expect(layers(4.25)).toEqual([['B', 1], [title, 1], ['C', 0.75]])
    expect(layers(4.5)).toEqual([['C', 1]])
  })

  it('한쪽이 타이틀 카드인 교차 디졸브는 경계 앞뒤로 같은 두 층을 같은 차례로 그린다 — 경계에서 층을 다시 만들지 않는다', () => {
    // 왜: 검토 c (E) 4 — 겹침 층이 경계에서 타이틀 카드 판 ↔ 영상 판으로 옮겨 다시 만들어져 빈 장이 생길 수 있었다. 판을 하나(시퀀스 틀)로 합친다.
    api().addTitleCard(4)
    const card = titleCardId()
    api().dropTransition(card, 'start', 'cross')
    const at = placeOf(card).startSec
    const before = plan(at - 0.1).layers
    const after = plan(at + 0.1).layers
    expect(before.map((l) => [l.shotId, l.kind, l.alpha])).toEqual([['A', 'video', 1], [card, 'card', 0.4]])
    expect(after.map((l) => [l.shotId, l.kind, l.alpha])).toEqual([['A', 'video', 1], [card, 'card', 0.6]])
    // 앞 클립은 원본이 모자라 경계 뒤에서 끝 장에 멈춘다.
    expect(after[0]).toMatchObject({ sourceSec: Math.round((4 - 1 / SEQUENCE_FPS) * 1000) / 1000, held: true })
    // 모니터는 층마다 이름(shotId)으로 같은 요소를 계속 쓴다 — 타이틀 카드 판 · 영상 판이 따로 없다.
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/mounted\.map\(\(\{ id, kind \}\) =>/)
    expect(previewer).toMatch(/key=\{id\}\s+data-testid="program-layer"/)
    expect(previewer).not.toMatch(/overlay=\{/)
  })

  it('물들이기 막(검정 · 흰색)은 목록에 하나로 실린다 — 영상 컷 · 빈 끝 · 보이는 제목 끝 · 예전 디졸브', () => {
    // 왜: 모니터와 내보내기가 막을 따로 세면 어긋난다(⑤ 흰색 · 끝 전환, ⑥ 제목 끝 물들이기 F1). 정상 경로 고정.
    api().dropTransition('B', 'start', 'white')
    expect(plan(4)).toMatchObject({ black: 0, white: 1 })
    api().dropTransition('C', 'end', 'dissolve')
    expect(plan(11.75)).toMatchObject({ black: 0.5, white: 0 })
    const title = api().addTitleClip('v2', 1, '우산')!
    api().dropTransition(title, 'end', 'dissolve')
    expect(plan(2.75).black).toBe(0.5)
    api().toggleTrackVisible('v2')
    expect(plan(2.75).black).toBe(0)
    const store = read('src/stores/editor-store.ts')
    expect(store).toMatch(/black: Math\.max\(dissolveOpacityAt\(program, input\.videoClips, t\), dips\.black, titleDips\.black\)/)
    expect(store).toMatch(/const titleDips = selectTitleDipsAt\(input, t\)/)
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/dissolveRef\.current\.style\.opacity = String\(plan\.black\)/)
  })

  it('"비율 100%"는 시퀀스 틀을 꽉 채운 크기다 — 비율이 다른 클립은 잘려 꽉 차고, 그 클립을 줄이면 아래 줄이 비친다', () => {
    // 왜: 검토 c (D) — 모니터는 띠(contain), 내보내기는 꽉 채우기(cover)라 비율이 다른 클립의 모습이 달랐고, "비율 100% · 가운데면 덮음"이
    //   모니터에서 틀렸다. 둘 다 시퀀스 크기(긴 변 1280, 위 둘째 줄과 같은 값)를 꽉 채운다.
    api().moveClipToTrack('C', 'v2', 4)
    expect(plan(5).layers.map((l) => l.shotId)).toEqual(['C'])
    api().setClipMotion(['C'], { scale: 0.99 })
    expect(plan(5).layers.map((l) => l.shotId)).toEqual(['B', 'C'])
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/exportFrameSize\(projectFormat\)/)
    expect(previewer.match(/object-cover/g)).toHaveLength(1)
    // 소스 미리 보기만 원본 그대로(띠).
    expect(previewer.match(/object-contain/g)).toHaveLength(1)
  })
})

describe('혼자 정한 것', () => {
  it('교차 디졸브는 화면을 다 덮는 쪽을 위에 진행만큼 짙게, 다른 쪽을 아래에 그대로 그린다 — 경계에서 위아래가 바뀌지 않는다', () => {
    // 왜: 경계에서 위아래를 바꾸면, 한쪽이 화면을 다 덮지 않을 때(제목 · 줄인 영상) 경계 한 장에서 아래 줄이 갑자기 사라졌다. 보이는 몫은 같다.
    api().dropTransition('B', 'start', 'cross')
    expect(layers(3.75)).toEqual([['A', 1], ['B', 0.25]])
    expect(layers(4.25)).toEqual([['A', 1], ['B', 0.75]])
    expect(seen(plan(3.75))).toEqual({ A: 0.75, B: 0.25 })
    expect(seen(plan(4.25))).toEqual({ A: 0.25, B: 0.75 })
    // 들어오는 쪽이 화면을 다 덮지 않으면 덮는 쪽(앞 클립)이 위에서 옅어진다.
    api().setClipMotion(['B'], { scale: 0.5 })
    expect(layers(4.25)).toEqual([['B', 1], ['A', 0.25]])
  })

  it('교차 디졸브는 맨 위 줄이 아닌 줄의 컷에서도 섞는다 — 줄인 위 클립 아래 줄의 컷', () => {
    // 왜: 예전 모니터는 맨 위 클립의 컷만 섞어, 줄인 V2 클립 아래 V1 컷은 그냥 컷이었다.
    api().dropTransition('B', 'start', 'cross')
    api().moveClipToTrack('C', 'v2', 2)
    api().setClipMotion(['C'], { scale: 0.5 })
    expect(layers(4.25)).toEqual([['A', 1], ['B', 0.75], ['C', 1]])
  })

  it('빈 끝의 교차 디졸브로 나타나고 사라지는 타이틀 카드도 영상처럼 아래 줄(없으면 검정)이 비친다', () => {
    // 왜: 예전 모니터는 타이틀 카드를 따로 된 판에 그려 아래 줄을 못 비춰, 빈 끝 교차 디졸브를 늘 검은 막으로 그렸다.
    api().addTitleCard(12)
    const card = titleCardId()
    api().moveClipToTrack(card, 'v2', 1)
    api().dropTransition(card, 'start', 'cross')
    expect(layers(1.25)).toEqual([['A', 1], [card, 0.25]])
    expect(plan(1.25).black).toBe(0)
  })

  it('재생 중에는 1초 안에 나타날 층을 그 시각 원본 자리에 맞춰 미리 불러 둔다 — 그냥 컷 · 위 클립이 끝나 드러날 아래 클립', () => {
    // 왜: 예전 모니터는 교차 디졸브 짝만 미리 불렀다 — 그냥 컷 · 드러나는 아래 클립은 그 장에 불러오느라 검은 장이 생길 수 있었다.
    expect(plan(3.5, 1).preload).toEqual([{ shotId: 'B', kind: 'video', trackId: 'v1', alpha: 0, sourceSec: 0, held: true }])
    expect(plan(3.5).preload).toEqual([])
    api().moveClipToTrack('C', 'v2', 2)
    expect(plan(5.5).layers.map((l) => l.shotId)).toEqual(['C'])
    expect(plan(5.5, 1).preload).toEqual([{ shotId: 'B', kind: 'video', trackId: 'v1', alpha: 0, sourceSec: 1.5, held: false }])
  })

  it('재생 중 모든 영상 층은 모니터 · 내보내기가 같은 함수로 시각을 맞춘다 — 조금 어긋나면 빠르기를 살짝 바꿔 따라잡는다', () => {
    // 왜: 예전에는 교차 디졸브 층만 빠르기로 따라잡고 맨 위 · 아래 줄은 0.3초 넘으면 다시 찾아, 찾는 동안 그림이 멈췄다.
    //   내보내기도 같은 함수로 맞춘다(⑦-2 — 함수를 미리 보기 파일에서 두 곳이 같이 쓰는 파일로 옮겼다).
    //   (옛 이름: '… 조금 어긋나면 빠르기를 살짝 바꿔 따라잡고, 0.5초 넘게 어긋나면 다시 찾는다' — 다시 찾는 문턱은 리드 11/14 문장으로 맨 위 층 0.3초 · 그 밑 0.5초, 아래 시험.)
    const sync = read('src/lib/editor/layer-sync.ts')
    expect(sync).toMatch(/const rate = speed \* \(drift > 0\.04 \? 1\.25 : drift < -0\.04 \? 0\.8 : 1\)/)
    expect(read('src/features/editor/video-previewer.tsx').match(/syncLayerVideo\(/g)).toHaveLength(1)
    expect(read('src/lib/editor-draft-render.ts').match(/syncLayerVideo\(/g)).toHaveLength(1)
  })

  it('타이틀 카드 무대는 시퀀스 틀을 채운다 — 세로 시퀀스면 세로 카드이고, 고치는 무대는 그 시각 맨 위 타이틀 카드 하나다', () => {
    // 왜: 갈래 메모(⑥) — 무대가 16:9 로 고정돼 세로 시퀀스에서 카드 · 교차 디졸브 자리가 내보내기와 달랐다. 아래 줄 · 교차 디졸브 짝인
    //   타이틀 카드는 내보내기와 같은 그림(drawTitleCard)으로 그린다.
    const stage = read('src/features/editor/title-card-stage.tsx')
    expect(stage).not.toMatch(/aspect-video/)
    expect(stage).toMatch(/className="absolute inset-0 overflow-hidden bg-black" data-testid="title-card-stage"/)
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/id === activeShotId && pane === 'title' \? \(/)
    expect(previewer).toMatch(/drawTitleCard\(ctx, canvas\.width, canvas\.height, card, /)
  })
})

describe('검토 c ⑦-1 낮음 — 리드 11/14 같이 정한 것', () => {
  it('보이는 맨 위 층은 예전처럼 0.3초 넘게 어긋나면 바로 다시 찾는다 — 그 밑 층은 빠르기로 따라잡는다', () => {
    // 왜: 검토 c — 다시 찾는 문턱이 0.5초라 0.3~0.5초 어긋남을 1.25배로 1.2~2초 따라잡는 동안 그림이 소리와 그만큼 어긋났다(멈칫한 뒤 ·
    //   무거운 장면). 맨 위 층은 예전 문턱(0.3초) — 어느 경우도 예전보다 나빠지지 않는다.
    const video = (currentTime: number) => ({ currentTime, paused: false, playbackRate: 1, play: async () => {}, pause: () => {} }) as unknown as HTMLVideoElement
    const top = video(1.6)
    syncLayerVideo(top, { sourceSec: 2, held: false }, 1, true, true)
    expect(top.currentTime).toBe(2)
    const under = video(1.6)
    syncLayerVideo(under, { sourceSec: 2, held: false }, 1, true, false)
    expect(under.currentTime).toBe(1.6)
    expect(under.playbackRate).toBe(1.25)
    const far = video(1.4)
    syncLayerVideo(far, { sourceSec: 2, held: false }, 1, true, false)
    expect(far.currentTime).toBe(2)
    // 모니터 · 내보내기가 같은 잣대로 맨 위 층을 가린다.
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/syncLayerVideo\(el, layer, [^\n]*, layer\.shotId === plan\.topShotId\)/)
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/syncLayerVideo\(entry\.el, layer, [^\n]*, layer\.shotId === plan\.topShotId\)/)
  })
})

describe('⑦-2 내보내기 — 같이 정한 것(⑦ 계획 · 리드 11/14)', () => {
  it('내보낸 파일도 모니터와 같은 그릴 것 목록으로 그린다 — 목록의 층을 아래부터 그 세기 · 모션으로 그린다', () => {
    // 왜: 오너 답 3 "미리 보기의 모든 것"(R7) — 예전 내보내기는 맨 위 클립 하나만 녹화해 겹침 · 제목 · 모션이 빠졌다.
    const title = api().addTitleClip('v2', 5, '우산')!
    api().moveClipToTrack('C', 'v3', 5)
    api().setClipMotion(['C'], { scale: 0.5 })
    api().setClipOpacity(['C'], 0.5)
    const rec = recordingCanvas()
    drawPlanFrame(rec.ctx, 1280, 720, plan(5.5), sources())
    expect(drawn(rec.calls)).toEqual([
      'globalAlpha=1',
      'drawImage(vid-B,0,0,1280,720,0,0,1280,720)',
      'globalAlpha=1',
      'fillText(우산,640,360)',
      'globalAlpha=0.5',
      'translate(640,360)',
      'scale(0.5,0.5)',
      'translate(-640,-360)',
      'drawImage(vid-C,0,0,1280,720,0,0,1280,720)',
    ])
    expect(plan(5.5).layers.map((l) => l.shotId)).toEqual(['B', title, 'C'])
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).toMatch(/const plan = selectFrameAt\(input, clock, \{ prerollSec: PRELOAD_SEC \}\)/)
    expect(render).toMatch(/if \(!waiting\) drawPlanFrame\(ctx, W, H, plan, sources\)/)
  })

  it('내보낸 파일의 크기는 시퀀스 크기다(긴 변 1280, 위 둘째 줄과 같은 값) — 첫 영상 크기를 따르지 않는다', () => {
    // 왜: ⑦ 계획 a — "비율 100%"의 기준을 모니터와 같게. 예전에는 첫 영상의 실제 비율을 따라 세로 시퀀스도 첫 영상이 가로면 가로 파일이 됐다.
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).toMatch(/const \{ width: W, height: H \} = opts\.frameSize/)
    expect(render).not.toMatch(/resolveCanvasSize/)
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/frameSize: exportFrameSize\(useProjectFormatStore\.getState\(\)\.format\)/)
  })

  it('내보낸 파일에도 교차 디졸브 · 물들이기 · 영상 효과가 모니터와 같은 값으로 실린다', () => {
    // 왜: ⑤ 는 모니터에만 실었다(리드 승인) — 내보낸 파일에는 시작 검은 디졸브만 있었다.
    api().addVideoEffect('B', 'blackWhite')
    api().dropTransition('B', 'start', 'cross')
    api().dropTransition('C', 'start', 'white')
    let rec = recordingCanvas()
    drawPlanFrame(rec.ctx, 1280, 720, plan(4.25), sources())
    expect(drawn(rec.calls)).toEqual(['globalAlpha=1', 'drawImage(vid-A,0,0,1280,720,0,0,1280,720)', 'globalAlpha=0.75', 'filter=grayscale(1)', 'drawImage(vid-B,0,0,1280,720,0,0,1280,720)'])
    rec = recordingCanvas()
    drawPlanFrame(rec.ctx, 1280, 720, plan(8), sources())
    expect(rec.calls.slice(-2)).toEqual(['fillStyle=rgba(255,255,255,1)', 'fillRect(0,0,1280,720)'])
    // 줄인 클립의 흐림은 그 비율만큼 작다 — 모니터는 흐린 그림을 줄인다(흐림 반지름 = 틀 폭 × 4% × 세기 × 비율).
    api().addVideoEffect('B', 'blur')
    api().setClipMotion(['B'], { scale: 0.5 })
    rec = recordingCanvas()
    drawPlanFrame(rec.ctx, 1280, 720, plan(7), sources())
    expect(rec.calls).toContain('filter=grayscale(1) blur(7.68px)')
  })

  it('내보낸 파일에도 제목 클립이 모니터와 같은 글꼴 · 크기 · 줄 · 자리로 실린다 — 배경 띠도 같다', () => {
    // 왜: ⑥ 은 모니터에만 실었다 — 예전 내보내기 · 샷 ZIP 은 제목을 건너뛰었다. 줄은 같은 셈(글꼴로 잰 폭)으로 나눠 모니터와 같은 줄이 된다.
    const data = { text: '비가 그친 오후 우산을 접었다 그리고 천천히 걸어서 집으로 돌아왔다', size: 30, place: 'band' as const }
    const lines = titleTextLines(data.text, 320 * TITLE_TEXT_WIDTH, (s) => s.length * 10)
    expect(lines.length).toBeGreaterThan(1)
    // 모니터 글자 층(테스트에서는 같은 잣대 — 글자 수 × 10). 시퀀스 틀 320×180 과 같은 크기의 캔버스로 견준다.
    const markup = renderToStaticMarkup(createElement(TitleTextLayer, { data, frameWidth: 320, frameHeight: 180 }))
    expect([...markup.matchAll(/whitespace-pre[^>]*>([^<]*)<\/div>/g)].map((m) => m[1])).toEqual(lines)
    // 내보내기
    const rec = recordingCanvas()
    drawTitleText(rec.ctx, 320, 180, data)
    expect(rec.calls.filter((c) => c.startsWith('fillText(')).map((c) => c.slice('fillText('.length).split(',')[0])).toEqual(lines)
    // 띠 자리도 같다 — 아래 8%, 위아래 여백 글자 크기의 0.4배.
    const band = rec.calls.find((c) => c.startsWith('fillRect('))!
    const [, top, , height] = band.slice('fillRect('.length, -1).split(',').map(Number)
    expect(markup).toContain(`top:${top}px;height:${height}px`)
  })

  it('소리 페이드는 내보낸 파일에도 장마다 소리 크기 × 페이드 세기로 실린다', () => {
    // 왜: ⑤ 페이드는 미리 보기 소리에만 실었다 — 내보낸 파일은 소리 크기만 구웠다.
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/a\.volume \* audioFadeGain\(a\.clip, clock\)/)
  })

  it('캔버스가 효과를 못 그리는 브라우저면, 효과를 쓴 클립이 있을 때만 내보내기를 시작할 때 먼저 알린다 — 내보내기는 막지 않는다', () => {
    // 왜: 리드 11/14 — 긴 녹화가 끝난 뒤에 알면 늦다. 지원 여부는 추측하지 않고 넣어 보고 읽는다.
    expect(canvasFilterSupported({ filter: 'none' } as unknown as CanvasRenderingContext2D)).toBe(true)
    expect(canvasFilterSupported({} as unknown as CanvasRenderingContext2D)).toBe(false)
    const ignores = { get filter() { return 'none' }, set filter(_v: string) {} }
    expect(canvasFilterSupported(ignores as unknown as CanvasRenderingContext2D)).toBe(false)
    expect(canvasFilterSupported(null)).toBe(false)
    expect(effectsInUse(api())).toBe(false)
    api().addVideoEffect('B', 'blur')
    expect(effectsInUse(api())).toBe(true)
    // 눈 끈 줄의 클립은 내보내지 않으니 세지 않는다.
    api().toggleTrackVisible('v1')
    expect(effectsInUse(api())).toBe(false)
    const page = read('src/app/studio/editor/page.tsx')
    expect(page).toMatch(/if \(effectsInUse\(st\) && !canvasFilterSupported\(document\.createElement\('canvas'\)\.getContext\('2d'\)\)\) \{\s*toast\.warning\(t\("This browser can't export effects\. To include effects, export in Chrome\."\)\)\s*\}/)
    expect(page.indexOf('effectsInUse(st)')).toBeLessThan(page.indexOf('await renderDraftTimeline('))
    expect(translate('ko', "This browser can't export effects. To include effects, export in Chrome.")).toBe('이 브라우저는 효과를 내보내지 못해요. 효과까지 실으려면 Chrome 에서 내보내 주세요.')
    // 그리기는 효과 없이 이어 간다.
    const rec = recordingCanvas()
    api().toggleTrackVisible('v1')
    drawPlanFrame(rec.ctx, 1280, 720, plan(5), { ...sources(), filterOk: false })
    expect(rec.calls.some((c) => c.startsWith('filter='))).toBe(false)
    expect(rec.calls).toContain('drawImage(vid-B,0,0,1280,720,0,0,1280,720)')
  })

  it('자막은 그 시각 맨 위 영상의 자막을 층 위 · 물들이기 막 아래에 그린다', () => {
    // 왜: ⑦ 계획 h — 예전 내보내기와 같은 차례. 정상 경로 고정.
    useEditorStore.setState({ shots: api().shots.map((x) => (x.shotId === 'B' ? ({ ...x, dialogueLines: [{ text: '비가 온다' }] } as unknown as Shot) : x)) })
    api().dropTransition('B', 'start', 'dissolve')
    const rec = recordingCanvas()
    drawPlanFrame(rec.ctx, 1280, 720, plan(4.25), sources())
    const picture = rec.calls.findIndex((c) => c.startsWith('drawImage(vid-B'))
    const subtitle = rec.calls.findIndex((c) => c.startsWith('fillText(비가 온다'))
    const dip = rec.calls.indexOf('fillStyle=rgba(0,0,0,0.5)')
    expect(picture).toBeGreaterThan(-1)
    expect(picture).toBeLessThan(subtitle)
    expect(subtitle).toBeLessThan(dip)
  })
})

describe('⑦-2 내보내기 — 혼자 정한 것', () => {
  it('보이는 영상 층이 아직 그림을 내지 못한 장은 직전 장 그대로 둔다 — 8초 넘게 못 내면 그 내보내기에서는 못 불러온 클립으로 친다', () => {
    // 왜: 예전 내보내기와 같은 방법(로드 공백은 멈춤으로 흡수, 8초 넘으면 자리표시). 층이 여럿이라 하나라도 비면 그 장 전체를 미룬다.
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).toMatch(/const LOAD_TIMEOUT_MS = 8000/)
    expect(render).toMatch(/if \(!waiting\) drawPlanFrame\(ctx, W, H, plan, sources\)/)
  })

  it('곧 그릴 층은 1.5초 먼저 불러 둔다 — 그냥 컷 · 교차 디졸브 짝 · 드러날 아래 클립', () => {
    // 왜: ⑦ 계획 d — 내보내기는 다시 할 수 없어 모니터(1초)보다 넉넉히. ⑦-3 에서 끊김을 재며 맞춘다.
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/const PRELOAD_SEC = 1\.5/)
    expect(plan(3, 1.5).preload.map((l) => l.shotId)).toEqual(['B'])
  })

  it('맨 위 영상이 없거나 못 불러오면 자리표시(어두운 회색 + 이름)를 그리고, 아래 줄이면 건너뛴다 — 빈 타이틀 카드는 아무 글자도 찍지 않는다', () => {
    // 왜: 모니터와 같다(맨 위만 안내 판). 예전 내보내기도 맨 위 클립만 자리표시였다.
    useEditorStore.setState({ videoClips: api().videoClips.map((c) => (c.shotId === 'B' ? { ...c, url: null } : c)) })
    let rec = recordingCanvas()
    drawPlanFrame(rec.ctx, 1280, 720, plan(5), sources())
    // 이름은 Editor 와 같은 화면 이름(리드 11/14 L2 — 옛 기대: 'fillText(B · MS,640,360)', 내부 샷 id).
    expect(drawn(rec.calls)).toEqual(['globalAlpha=1', 'fillText(샷 2 · MS,640,360)'])
    api().moveClipToTrack('C', 'v2', 4)
    api().setClipMotion(['C'], { scale: 0.5 })
    rec = recordingCanvas()
    drawPlanFrame(rec.ctx, 1280, 720, plan(5), sources())
    expect(rec.calls.some((c) => c.startsWith('fillText('))).toBe(false)
    expect(rec.calls).toContain('drawImage(vid-C,0,0,1280,720,0,0,1280,720)')
    // 빈 타이틀 카드
    seed()
    api().addTitleCard(0)
    rec = recordingCanvas()
    drawPlanFrame(rec.ctx, 1280, 720, plan(1), sources())
    expect(rec.calls.some((c) => c.startsWith('fillText('))).toBe(false)
  })

  it('제목 줄바꿈은 문단마다 줄 길이를 고르게(6줄까지) 하는 같은 셈을 모니터와 내보내기가 쓴다', () => {
    // 왜: 모니터는 브라우저의 고른 줄바꿈(text-wrap: balance)을, 내보내기는 캔버스를 써서 줄이 달라질 수 있었다 — 한 셈으로 같게.
    const m = (s: string) => s.length * 10
    expect(titleTextLines('aaa bbb ccc ddd e', 160, m)).toEqual(['aaa bbb', 'ccc ddd e'])
    expect(titleTextLines('하나\n\n둘', 160, m)).toEqual(['하나', '', '둘'])
    expect(titleTextLines('   ', 160, m)).toEqual([])
    expect(read('src/features/editor/title-clip-layer.tsx')).toMatch(/titleTextLines\(data\.text, frameWidth \* TITLE_TEXT_WIDTH, /)
  })
})

describe('⑦-3 끊김 재기 — 같이 정한 것(⑦ 계획 i · 리드 11/14)', () => {
  it('내보내는 동안 장마다 그림을 못 낸 보이는 영상 층 수와 멈춘 장 · 가장 긴 멈춤을 결과 숫자에 남긴다 — 개발 서버에서만 콘솔에 찍고 화면 글은 없다', () => {
    // 왜: ⑦ 계획 3 · i — 실시간 녹화라 줄이 많고 기기가 느리면 그 장은 직전 장으로 찍힌다. e2e 가 2 · 3줄 · 교차 디졸브 시퀀스를 내보내며 이
    //   숫자를 읽어 보고한다. 손님 화면에는 숫자를 보이지 않는다.
    const render = read('src/lib/editor-draft-render.ts')
    // 기다릴 층 · 빼고 그릴 층을 따로 센다(리드 11/14 L1 — 옛 기대: const waiting = prepare(plan, true)).
    expect(render).toMatch(/const \{ wait: waiting, drop: dropped \} = prepare\(plan, true\)/)
    expect(render).toMatch(/if \(waiting\) \{\s*stalledFrames \+= 1\s*waitingLayers \+= waiting/)
    // 늦은 층을 빼고 그린 수도 남긴다(리드 11/14 L1 — 옛 기대: droppedLayers 없는 return).
    // 고리 간격 · 어긋남 · 굳은 장도 남긴다(리드 11/14 G5 · G6 — 옛 기대: droppedLayers 까지의 return).
    expect(render).toMatch(/return \{\s*durationSec: total,\s*bytes: blob\.size,\s*mimeType,\s*skippedClips: placeholderIds\.size,\s*frames,\s*stalledFrames,\s*longestStallMs: Math\.round\(longestStallMs\),\s*waitingLayers,\s*droppedLayers,\s*longestLoopGapMs: Math\.round\(longestLoopGapMs\),\s*maxDriftMs: Math\.round\(maxDriftSec \* 1000\),\s*frozenFrames,\s*\}/)
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/if \(process\.env\.NODE_ENV !== 'production'\) console\.info\('\[draft-render\]', JSON\.stringify\(stats\)\)/)
  })
})

describe('⑦-3 더함 — 리드 11/14 같이 정한 것(검토 c ⑦-2 · e853f360)', () => {
  it('내보낼 때 그림을 늦게 내는 층은 맨 위 · 화면을 다 덮는 층만 기다리고, 그 밖의 층(줄인 아래 줄 · 옅은 교차 디졸브 짝)은 그 장에서 빼고 그린다', () => {
    // 왜: 검토 c L1 — 보이는 층 하나라도 그림이 없으면 화면 전체가 최대 8초 직전 장에 멈췄다(예전에는 맨 위 클립만 기다렸다).
    //   빼고 그린 층 수는 끊김 숫자(droppedLayers)에 남는다.
    const top = api().addClipInstanceAt('A', 4, 'v3')!
    api().moveClipToTrack('C', 'v2', 4)
    api().setClipMotion(['C'], { scale: 0.5 })
    api().setClipMotion([top], { scale: 0.4 })
    const clips = new Map(api().videoClips.map((c) => [c.shotId, c]))
    const p = plan(5)
    expect(p.layers.map((l) => l.shotId)).toEqual(['B', 'C', top])
    expect(lateLayers(p, (id) => id === 'C', clips)).toEqual({ wait: 0, drop: 1 })
    expect(lateLayers(p, (id) => id === 'B', clips)).toEqual({ wait: 1, drop: 0 })
    expect(lateLayers(p, (id) => id === top, clips)).toEqual({ wait: 1, drop: 0 })
    // 교차 디졸브 경계 앞 — 옅은 뒤 클립이 늦으면 빼고, 그림을 다 덮는 앞 클립이 늦으면 기다린다.
    seed()
    api().dropTransition('B', 'start', 'cross')
    const cross = new Map(api().videoClips.map((c) => [c.shotId, c]))
    expect(lateLayers(plan(3.75), (id) => id === 'B', cross)).toEqual({ wait: 0, drop: 1 })
    expect(lateLayers(plan(3.75), (id) => id === 'A', cross)).toEqual({ wait: 1, drop: 0 })
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).toMatch(/const late = lateLayers\(plan, /)
    expect(render).toMatch(/droppedLayers \+= dropped/)
  })

  it('내보낸 파일의 영상 자리표시에는 내부 샷 id 대신 화면에 보이는 샷 이름(Editor 와 같은 이름)을 쓴다', () => {
    // 왜: 검토 c L2 — 예전 activeLabel 부터 '<샷 id> · <샷 종류>'가 파일에 찍혔다. 효과 컨트롤 머리와 같은 이름(샷 번호 · 종류 · Take).
    useEditorStore.setState({ videoClips: api().videoClips.map((c) => (c.shotId === 'C' ? { ...c, url: null } : c)) })
    const rec = recordingCanvas()
    drawPlanFrame(rec.ctx, 1280, 720, plan(9), sources())
    expect(rec.calls).toContain('fillText(샷 3 · MS,640,360)')
    expect(rec.calls.some((c) => c.includes('C · MS'))).toBe(false)
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/clipLabel: \(shotId\) => clipDisplayName\(st, shotId, t\)/)
    expect(read('src/features/editor/effect-controls.tsx')).toMatch(/clipDisplayName\(\{ shots, videoClips \}, item\.shotId, t\)/)
  })

  it('다시 찾는 중인 층은 다시 찾지 않는다 — 찾기가 0.3초보다 오래 걸려도 찾기를 겹쳐 걸어 멈칫하지 않는다', () => {
    // 왜: 검토 c(e853f360) — 느린 원본(네트워크)에서 찾기가 문턱보다 오래 걸리면 장마다 새 찾기가 앞 찾기를 끊어 그림이 서 있었다(⑦-1 전부터 같은 위험).
    const video = (currentTime: number, seeking: boolean) =>
      ({ currentTime, seeking, paused: false, playbackRate: 1, play: async () => {}, pause: () => {} }) as unknown as HTMLVideoElement
    const busy = video(1, true)
    syncLayerVideo(busy, { sourceSec: 2, held: false }, 1, true, true)
    expect(busy.currentTime).toBe(1)
    const idle = video(1, false)
    syncLayerVideo(idle, { sourceSec: 2, held: false }, 1, true, true)
    expect(idle.currentTime).toBe(2)
    // 멈춘 동안(고르기 · 끌기)도 같다 — 찾기가 끝나면 그때의 자리로 다시 찾는다.
    const paused = { ...video(1, true), paused: true } as unknown as HTMLVideoElement
    syncLayerVideo(paused, { sourceSec: 2, held: false }, 1, false)
    expect(paused.currentTime).toBe(1)
  })
})

describe('(G) 재기 더함 — 리드 11/14 같이 정한 것(검토 c ⑦-3)', () => {
  it('내보내는 동안 고리 사이 가장 긴 간격(벽시계)도 결과 숫자에 남긴다', () => {
    // 왜: 검토 c G5 — 기기가 바빠 장 고리(requestAnimationFrame)가 몇백 ms 안 오면, 그동안은 장도 멈춤도 세지 않아 "멈춘 장 0"이 거짓일 수 있었다.
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).toMatch(/if \(lastTick !== null\) longestLoopGapMs = Math\.max\(longestLoopGapMs, tick - lastTick\)/)
    expect(render).toMatch(/longestLoopGapMs: Math\.round\(longestLoopGapMs\)/)
  })

  it('그림은 있는데 재생 시각이 안 나아간(굳은) 보이는 층도 셈한다 — 보이는 층의 가장 큰 어긋남(|원본 목표 시각 − 영상 시각|)과 재생 중 시각이 안 나아간 장 수를 남긴다', () => {
    // 왜: 검토 c G6 — 그림이 있는지(readyState ≥ 2)만 보면 버퍼링 · 디코더 멈춤으로 직전 그림이 반복돼도 0 이었다.
    const p = plan(5)
    expect(p.layers.map((l) => [l.shotId, l.sourceSec])).toEqual([['B', 1]])
    expect(layerClock(p, () => ({ currentTime: 1.2, previousTime: 1.18 }))).toEqual({ maxDriftSec: 0.2, frozen: false })
    expect(layerClock(p, () => ({ currentTime: 0.9, previousTime: 0.9 }))).toEqual({ maxDriftSec: 0.1, frozen: true })
    // 그림이 아직 없는 층은 늦은 층(기다림 · 빼고 그림)으로 따로 센다.
    expect(layerClock(p, () => null)).toEqual({ maxDriftSec: 0, frozen: false })
    // 첫 장 · 끝 장에 멈춘 층(교차 디졸브 짝)은 굳은 것으로 치지 않는다.
    api().dropTransition('B', 'start', 'cross')
    const q = plan(4.25)
    expect(q.layers.map((l) => [l.shotId, l.held])).toEqual([['A', true], ['B', false]])
    expect(layerClock(q, (id) => (id === 'A' ? { currentTime: 3.967, previousTime: 3.967 } : { currentTime: 0.25, previousTime: 0.23 })).frozen).toBe(false)
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).toMatch(/const health = layerClock\(plan, /)
    expect(render).toMatch(/if \(health\.frozen\) frozenFrames \+= 1/)
  })
})
