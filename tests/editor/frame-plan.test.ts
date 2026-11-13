// 모니터 · 내보내기가 같이 쓰는 그릴 것 목록 — 시각마다 아래부터 그릴 영상 · 타이틀 카드 · 제목과 그 세기 · 원본 시각, 물들이기 막, 미리 불러 둘 층을 검사한다 (2단계 ⑦, 2026-11-14)
import { readFileSync } from 'node:fs'
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
    //   내보내기도 같은 목록을 쓰는 것은 ⑦-2 에서 이 파일에 더한다.
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

  it('재생 중 모든 영상 층은 같은 방법으로 시각을 맞춘다 — 조금 어긋나면 빠르기를 살짝 바꿔 따라잡고, 0.5초 넘게 어긋나면 다시 찾는다', () => {
    // 왜: 예전에는 교차 디졸브 층만 빠르기로 따라잡고 맨 위 · 아래 줄은 0.3초 넘으면 다시 찾아, 찾는 동안 그림이 멈췄다.
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/const rate = speed \* \(drift > 0\.04 \? 1\.25 : drift < -0\.04 \? 0\.8 : 1\)/)
    expect(previewer).toMatch(/if \(Math\.abs\(drift\) > 0\.5\) el\.currentTime = target/)
    expect(previewer.match(/syncLayerVideo\(/g)).toHaveLength(2)
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
