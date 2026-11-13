// Editor 타임라인의 클립이 놓인 자리(줄 + 시작 초)에 머물고, 빼면 빈 곳이 남고 잔물결 삭제로만 당겨지며, 저장 · 다시 열기에도 자리가 그대로인지 검사한다 (오너 답 1 "자유 배치 — 추천대로", 2026-11-14)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // 저장 · 불러오기는 브라우저에서만 돈다 — window 를 먼저 둔다(localStorage 는 vitest.setup 의 대역).
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-free' as string | null }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: { getState: () => ({ projectId: mocks.projectId }) },
}))

import { saveEditorNow, selectTimelineLayout, timelineEnd, timelineSegments, useEditorStore } from '@/stores/editor-store'
import { drawGap } from '@/lib/editor-draft-render'
import type { PersistedEditor } from '@/lib/editor-persistence'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

const LOCAL_KEY = 'tale:editor:v1:project-free'
const BEFORE_V2_KEY = 'tale:editor:v1:before-v2:project-free'
const api = () => useEditorStore.getState()
const read = (file: string) => readFileSync(file, 'utf8')

const shot = (shotId: string, durationSeconds = 4): Shot => ({ shotId, sceneId: 'sc_1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
const clip = (shotId: string, patch: Partial<VideoClip> = {}): VideoClip => ({ shotId, url: `https://video.test/${shotId}.mp4`, status: 'completed', thumbnailUrl: null, ...patch })
/** 영상에 이어진 소리 — 처음 열 때 나눈 것과 같다. */
const linked = (shotId: string, startSec: number, durationSec = 4): AudioTrackClip => ({
  id: `a_${shotId}`, name: `${shotId} audio`, url: `https://video.test/${shotId}.mp4`, startSec, durationSec, volume: 1, muted: false,
  sourceOffsetSec: 0, sourceDurationSec: durationSec, trackId: 'atrack_1', linkedShotId: shotId,
})
/** 사람이 놓은 음악(영상에 이어지지 않음). */
const music = (startSec: number): AudioTrackClip => ({ id: 'bgm', name: 'bgm.mp3', url: 'blob:bgm', startSec, durationSec: 30, volume: 1, muted: false, trackId: 'atrack_1', linkedShotId: null })

/** A · B · C · D 네 샷(4초씩)을 빈 곳 없이 깔고 소리를 잇는다. */
function seed(ids = ['A', 'B', 'C', 'D']) {
  api().reset()
  useEditorStore.setState({
    shots: ids.map((id) => shot(id)),
    videoClips: ids.map((id) => clip(id)),
    clipOrder: { sc_1: [...ids] },
    audioClips: [...ids.map((id, i) => linked(id, i * 4)), music(0)],
    selectedSceneId: 'sc_1',
    loadStatus: 'ready',
  })
}
/** [shotId, 시작, 길이] — 소수 셋째 자리까지. */
const layout = () => selectTimelineLayout(api()).map((l) => [l.shotId, Math.round(l.startSec * 1000) / 1000, Math.round(l.durationSec * 1000) / 1000])
const audioAt = (shotId: string) => api().audioClips.find((a) => a.linkedShotId === shotId)?.startSec
const bgm = () => api().audioClips.find((a) => a.id === 'bgm')?.startSec

beforeEach(() => {
  localStorage.clear()
  mocks.projectId = 'project-free'
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  seed()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  ;(globalThis as { window?: unknown }).window = globalThis
  localStorage.clear()
})

describe('빼기와 잔물결 삭제', () => {
  it('클립을 빼면 그 자리에 빈 곳이 남고, 뒤 클립과 그 소리는 움직이지 않는다', () => {
    // 왜: 시안 E4 · N2 "빈 곳 남기고 잔물결 삭제"(오너 답 1). 예전에는 빼자마자 뒤 클립이 당겨져 맞춰 둔 음악 · 자막 자리가 어긋났다.
    api().deleteClip('B')
    expect(layout()).toEqual([['A', 0, 4], ['C', 8, 4], ['D', 12, 4]])
    expect(audioAt('B')).toBeUndefined()
    expect(audioAt('C')).toBe(8)
  })

  it('빈 곳의 잔물결 삭제를 누르면 빈 곳이 없어지고 그 줄의 뒤 클립과 이어진 소리만 당겨진다 — 사람이 놓은 소리는 그대로다', () => {
    // 왜: 시안 E4 409:6873 · 규칙 R "컷 사이 빈 곳 = 그 자리에 잔물결 삭제". 배경 음악까지 당기면 끝까지 깔아 둔 음악이 어긋난다.
    useEditorStore.setState({ audioClips: [...api().audioClips.filter((a) => a.id !== 'bgm'), music(2)] })
    api().deleteClip('B')
    api().rippleDeleteGapBefore('C')
    expect(layout()).toEqual([['A', 0, 4], ['C', 4, 4], ['D', 8, 4]])
    expect(audioAt('C')).toBe(4)
    expect(audioAt('D')).toBe(8)
    expect(bgm()).toBe(2)
  })

  it('Shift+Delete 로 클립을 빼면 그 자리를 당겨 메운다', () => {
    // 왜: 예전처럼 빼면서 바로 당기고 싶을 때(프리미어의 잔물결 삭제와 같다). 고른 클립이 여럿이면 모두 그렇게 뺀다.
    api().setClipSelection(['B'])
    api().rippleDeleteSelectedClips()
    expect(layout()).toEqual([['A', 0, 4], ['C', 4, 4], ['D', 8, 4]])
    expect(audioAt('C')).toBe(4)
    const keys = read('src/features/editor/use-editor-playback.ts')
    expect(keys).toMatch(/if \(e\.shiftKey\) s\.rippleDeleteSelectedClips\(\)\s*else s\.deleteSelectedClips\(\)/)
  })

  it('빼고 남은 빈 곳은 되돌리기 한 번에 그 클립과 함께 돌아온다', () => {
    // 왜: 정상 경로 고정 — 빼기 · 잔물결 삭제도 다른 편집처럼 한 번씩 되돌린다.
    api().deleteClip('B')
    api().rippleDeleteGapBefore('C')
    api().undo()
    expect(layout()).toEqual([['A', 0, 4], ['C', 8, 4], ['D', 12, 4]])
    api().undo()
    expect(layout()).toEqual([['A', 0, 4], ['B', 4, 4], ['C', 8, 4], ['D', 12, 4]])
  })
})

describe('끌어 옮기기', () => {
  it('클립을 다른 클립 사이 경계에 놓으면 순서만 바뀌고 원래 자리는 당겨 메워진다', () => {
    // 왜: 지금 손에 익은 "끌어서 순서 바꾸기"를 그대로 둔다 — 순서 하나 바꾸는 데 옮기기 + 잔물결 삭제 두 번 일이 되지 않게.
    api().moveClipToIndex('B', 3)
    expect(layout()).toEqual([['A', 0, 4], ['C', 4, 4], ['D', 8, 4], ['B', 12, 4]])
    expect(audioAt('B')).toBe(12)
  })

  it('클립을 빈 곳 한가운데에 놓으면 그 시각에 놓이고 원래 자리는 빈 곳이 된다', () => {
    // 왜: 시안 E1 "선택 도구 · 끌어서 옮기고"(오너 답 1 자유 배치) — 빈 곳에 놓은 클립은 놓은 시각에 머문다.
    api().deleteClip('C')
    api().placeClipAt('A', 8)
    expect(layout()).toEqual([['B', 4, 4], ['A', 8, 4], ['D', 12, 4]])
    expect(audioAt('A')).toBe(8)
  })

  it('빈 곳에 놓았는데 뒤 클립과 겹치면 겹치는 만큼 뒤 클립을 민다 — 같은 줄의 클립은 겹치지 않는다', () => {
    // 왜: 겹친 자리를 덮어쓰면 그 클립 편집을 잃는다. 막아 버리면 어디에 놓였는지 몰라 헤맨다.
    api().deleteClip('C')
    api().placeClipAt('A', 10)
    expect(layout()).toEqual([['B', 4, 4], ['A', 10, 4], ['D', 14, 4]])
    expect(audioAt('D')).toBe(14)
  })
})

describe('길이와 속도', () => {
  it('끝 가장자리를 줄이면 그 뒤에 빈 곳이 남고, 늘리면 바로 뒤 빈 곳부터 쓰고 모자라면 뒤 클립을 민다', () => {
    // 왜: 클립 하나를 다듬을 때 뒤에 맞춰 둔 클립 · 소리가 따라 움직이지 않게. 늘릴 때 뒤 클립을 덮지 않게.
    api().setTrim('B', 0, 3)
    expect(layout()).toEqual([['A', 0, 4], ['B', 4, 3], ['C', 8, 4], ['D', 12, 4]])
    useEditorStore.setState({ videoClips: api().videoClips.map((c) => (c.shotId === 'B' ? { ...c, actualDurationSec: 6 } : c)), shots: api().shots.map((s) => (s.shotId === 'B' ? { ...s, durationSeconds: 6 } : s)) })
    api().setTrim('B', 0, 5.5)
    expect(layout()).toEqual([['A', 0, 4], ['B', 4, 5.5], ['C', 9.5, 4], ['D', 13.5, 4]])
  })

  it('앞 가장자리를 줄이면 클립 끝은 그대로이고 앞에 빈 곳이 남는다', () => {
    // 왜: 프리미어의 선택 도구와 같다 — 앞을 잘라 낸 만큼 그 자리가 비고, 클립이 앞으로 당겨지지 않는다.
    api().setTrim('B', 1, 4)
    expect(layout()).toEqual([['A', 0, 4], ['B', 5, 3], ['C', 8, 4], ['D', 12, 4]])
    expect(audioAt('B')).toBe(5)
  })

  it('속도를 바꿔 길어지면 바로 뒤 빈 곳부터 쓰고 모자라면 뒤 클립을 밀며, 짧아지면 빈 곳이 남는다', () => {
    // 왜: 늦춘 클립이 뒤 클립을 덮지 않게, 빠르게 한 클립 뒤로 다른 클립이 당겨져 어긋나지 않게.
    api().setSpeed('B', 2)
    expect(layout()).toEqual([['A', 0, 4], ['B', 4, 2], ['C', 8, 4], ['D', 12, 4]])
    api().setSpeed('B', 0.5)
    expect(layout()).toEqual([['A', 0, 4], ['B', 4, 8], ['C', 12, 4], ['D', 16, 4]])
    expect(audioAt('C')).toBe(12)
  })
})

describe('끼워 넣기와 자르기', () => {
  it('타이틀 카드를 넣으면 바로 뒤 빈 곳부터 쓰고 모자라면 그만큼만 뒤 클립을 민다', () => {
    // 왜: 빈 곳이 넉넉하면 뒤 클립을 건드릴 까닭이 없다. 빈 곳이 없으면 예전처럼 카드 길이만큼 민다.
    api().deleteClip('B')
    api().deleteClip('C')
    api().addTitleCard(4)
    const roomy = layout()
    expect(roomy[1][0]).toMatch(/__t/)
    expect(roomy.map((l) => l.slice(1))).toEqual([[0, 4], [4, 5], [12, 4]])
    seed()
    api().deleteClip('B')
    api().addTitleCard(4)
    expect(layout().map((l) => l.slice(1))).toEqual([[0, 4], [4, 5], [9, 4], [13, 4]])
  })

  it('맨 끝에 타이틀 카드를 넣을 때 기준은 빈 곳까지 센 영상 줄 끝이다 — 그 앞에서 시작하는 따로 둔 소리는 밀리지 않는다', () => {
    // 왜: 검토 c 낮음 4 — 길이를 더한 끝(빈 곳이 빠짐)을 기준으로 써서, 마지막 클립 아래 깔린 음악까지 카드 길이만큼 밀렸다.
    //   영상 줄 끝에서 시작하는 소리(끝맺음 음악)는 예전처럼 카드 뒤로 민다.
    useEditorStore.setState({ audioClips: [...api().audioClips.filter((a) => a.id !== 'bgm'), music(13), { ...music(16), id: 'outro' }] })
    api().deleteClip('C')
    api().addTitleCard(30)
    expect(layout().at(-1)?.slice(1)).toEqual([16, 5])
    expect(bgm()).toBe(13)
    expect(api().audioClips.find((a) => a.id === 'outro')?.startSec).toBe(21)
  })

  it('빈 곳 가운데에 타이틀 카드를 넣으면 따로 둔 소리는 뒤 클립이 실제로 밀린 만큼만 밀린다', () => {
    // 왜: 빈 곳이 카드를 받아 뒤 클립이 덜 밀리거나 안 밀려도 소리는 카드 길이만큼 밀려, 맞춰 둔 클립과 어긋났다(낮음 4 와 같은 고장).
    useEditorStore.setState({ audioClips: [...api().audioClips.filter((a) => a.id !== 'bgm'), music(12)] })
    api().deleteClip('B')
    api().deleteClip('C')
    api().addTitleCard(4)
    expect(layout().map((l) => l.slice(1))).toEqual([[0, 4], [4, 5], [12, 4]])
    expect(bgm()).toBe(12)
    seed()
    useEditorStore.setState({ audioClips: [...api().audioClips.filter((a) => a.id !== 'bgm'), music(8)] })
    api().deleteClip('B')
    api().addTitleCard(4)
    expect(layout().map((l) => l.slice(1))).toEqual([[0, 4], [4, 5], [9, 4], [13, 4]])
    expect(bgm()).toBe(9)
  })

  it('자르기는 제자리에서 둘로 나뉘고 뒤 클립은 움직이지 않는다', () => {
    // 왜: 정상 경로 고정 — 자르기는 자리를 바꾸지 않는다(빈 곳도 생기지 않는다).
    api().deleteClip('C')
    api().splitVideoClipAt('B', 6)
    expect(layout().map((l) => l.slice(1))).toEqual([[0, 4], [4, 2], [6, 2], [12, 4]])
  })
})

describe('빈 곳 재생 · 내보내기', () => {
  it('빈 곳은 미리 보기와 내보낸 영상에서 그 길이만큼 검은 화면으로 지나간다', () => {
    // 왜: 사람이 둔 빈 곳도 시간이다 — 내보낼 때 빼면 맞춰 둔 음악과 영상이 어긋난다.
    api().deleteClip('B')
    expect(timelineSegments(selectTimelineLayout(api()))).toEqual([
      { kind: 'clip', shotId: 'A', startSec: 0, endSec: 4 },
      { kind: 'gap', startSec: 4, endSec: 8 },
      { kind: 'clip', shotId: 'C', startSec: 8, endSec: 12 },
      { kind: 'clip', shotId: 'D', startSec: 12, endSec: 16 },
    ])
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).toMatch(/timelineSegments\(layout\)/)
    expect(render).toMatch(/segment\.kind === 'gap'/)
  })

  it('빈 곳이 있어도 미리 보기의 진행 막대 · 시간 · 막대 눌러 옮기기는 마지막 클립 끝까지를 전체 길이로 센다', () => {
    // 왜: 검토 c 보통 1 — 클립 길이를 더해 전체로 써서 "0:14 / 0:12"가 되고, 끝 전에 막대가 꽉 차며 막대로는 마지막 4초에 갈 수 없었다.
    api().deleteClip('B')
    expect(timelineEnd(selectTimelineLayout(api()))).toBe(16)
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).not.toMatch(/sum \+ l\.durationSec/)
    expect(previewer.match(/const total = timelineEnd\(layout\)/g)).toHaveLength(2)
  })

  it('내보낸 영상의 빈 곳은 미리 보기처럼 순검정으로 칠한다', () => {
    // 왜: 검토 c 낮음 5 — 내보내기는 빈 곳을 영상을 못 받은 클립 자리처럼 어두운 회색(#101014)으로 칠해 미리 보기(검정)와 달랐다.
    const painted: string[] = []
    const ctx = { fillStyle: '', fillRect: () => painted.push(String(ctx.fillStyle)) }
    drawGap(ctx as unknown as CanvasRenderingContext2D, 1280, 720)
    expect(painted).toEqual(['#000000'])
    // 미리 보기는 영상 없는 구간에 검정 바탕(bg-black)이 그대로 보이고, 내보내기 그리기 루프는 빈 곳에서 위 칠하기를 쓴다.
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/flex h-full flex-col items-center justify-center bg-black/)
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/else if \(inGap\) drawGap\(ctx, W, H\)/)
  })
})

describe('저장하고 다시 열기', () => {
  /** loadData 가 DB 에서 다시 만든 모습 — 빈 곳 없이 원본 샷만. */
  function canonical(ids = ['A', 'B', 'C', 'D']) {
    api().reset()
    useEditorStore.setState({ shots: ids.map((id) => shot(id)), videoClips: ids.map((id) => clip(id)), clipOrder: { sc_1: [...ids] }, loadStatus: 'ready' })
  }

  it('편집을 저장하면 클립마다 줄과 시작 초를 적고, 다시 열면 빈 곳까지 그 자리 그대로 놓인다', async () => {
    // 왜: 오너 답 1 "모든 클립이 줄 + 시작 초" — 빈 곳은 저장한 자리로만 되살릴 수 있다.
    api().deleteClip('B')
    await saveEditorNow('project-free')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor & { placements?: Record<string, { trackId: string; startSec: number }> }
    expect(saved.version).toBe(2)
    expect(saved.placements).toEqual({ A: { trackId: 'v1', startSec: 0 }, C: { trackId: 'v1', startSec: 8 }, D: { trackId: 'v1', startSec: 12 } })
    canonical()
    expect(await api().loadPersisted()).toBe(true)
    expect(layout()).toEqual([['A', 0, 4], ['C', 8, 4], ['D', 12, 4]])
  })

  it('예전 저장본(시작 초가 없는 저장본)은 열 때 지금 보이는 자리 그대로 놓인다', async () => {
    // 왜: 오너 답 1 "옛 저장본은 열 때 지금 보이는 자리 그대로 옮김" — 예전 저장본에는 빈 곳이 없었다.
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      version: 1, shots: ['A', 'B', 'C', 'D'].map((id) => shot(id)), clipOrder: { sc_1: ['A', 'C', 'D'] }, videoClips: ['A', 'B', 'C', 'D'].map((id) => clip(id)),
      audioClips: [], audioSources: [], audioTracks: [{ id: 'atrack_1' }], panelSizes: { sourceW: 256, previewH: 360 },
    }))
    canonical()
    expect(await api().loadPersisted()).toBe(true)
    expect(layout()).toEqual([['A', 0, 4], ['C', 4, 4], ['D', 8, 4]])
  })

  it('다시 열어 영상 길이를 다시 재도 같은 영상이면 놓인 자리가 바뀌지 않는다', async () => {
    // 왜: 열 때마다 계획 길이로 놓였다가 잰 길이로 줄어 빈 곳이 생기거나 겹치면 안 된다 — 잰 길이를 함께 저장해 둔다.
    api().updateVideoClip('A', { actualDurationSec: 3 })
    expect(layout()[1]).toEqual(['B', 4, 4])
    await saveEditorNow('project-free')
    canonical()
    await api().loadPersisted()
    expect(layout()).toEqual([['A', 0, 3], ['B', 4, 4], ['C', 8, 4], ['D', 12, 4]])
    api().updateVideoClip('A', { actualDurationSec: 3 })
    expect(layout()).toEqual([['A', 0, 3], ['B', 4, 4], ['C', 8, 4], ['D', 12, 4]])
  })

  it('영상이 바뀌어 길이가 짧아져도 뒤 클립은 저장한 자리에 머물고 그만큼 빈 곳이 남는다', async () => {
    // 왜: Director 에서 ★ Take 를 바꾸면 영상 길이가 달라진다 — 그 뒤에 맞춰 둔 클립 · 소리가 따라 움직이지 않게.
    api().deleteClip('C')
    await saveEditorNow('project-free')
    canonical()
    await api().loadPersisted()
    api().updateVideoClip('B', { actualDurationSec: 3 })
    expect(layout()).toEqual([['A', 0, 4], ['B', 4, 3], ['D', 12, 4]])
    api().updateVideoClip('A', { actualDurationSec: 3 })
    expect(layout()).toEqual([['A', 0, 3], ['B', 4, 3], ['D', 12, 4]])
  })

  it('예전 저장본을 새 형식으로 옮겨도 이 브라우저의 옛 형식 저장본은 따로 칸에 그대로 남는다', async () => {
    // 왜: 옮겨 적기는 되돌릴 수 없다(리드 2026-11-14, 2단계 위험 2) — 새 형식에 고장이 나도 "옮기던 때의 편집"을 꺼낼 수 있게.
    //   서버 저장본 안에도 한 벌이 남지만(tests/editor/save-format.test.ts) 서버에 못 올린 이 브라우저 고침은 여기에만 있다.
    //   처음 옮길 때 한 번만 쓰고 그 뒤로는 덮지 않는다.
    const legacy = JSON.stringify({
      version: 1, shots: ['A', 'B', 'C', 'D'].map((id) => shot(id)), clipOrder: { sc_1: ['A', 'C', 'D'] }, videoClips: ['A', 'B', 'C', 'D'].map((id) => clip(id)),
      audioClips: [music(3)], audioSources: [], audioTracks: [{ id: 'atrack_1' }], panelSizes: { sourceW: 256, previewH: 360 },
    })
    localStorage.setItem(LOCAL_KEY, legacy)
    canonical()
    await api().loadPersisted()
    await saveEditorNow('project-free')
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null').version).toBe(2)
    expect(localStorage.getItem(BEFORE_V2_KEY)).toBe(legacy)
    api().deleteClip('C')
    await saveEditorNow('project-free')
    canonical()
    await api().loadPersisted()
    await saveEditorNow('project-free')
    expect(localStorage.getItem(BEFORE_V2_KEY)).toBe(legacy)
  })

  it('처음부터 새 형식인 저장본은 따로 칸에 두지 않는다', async () => {
    // 왜: 옮길 것이 없으면 남길 것도 없다 — 이 브라우저 저장 공간은 작다(꽉 차면 편집 저장이 실패한다, 검토 A E2a).
    api().deleteClip('B')
    await saveEditorNow('project-free')
    canonical()
    await api().loadPersisted()
    await saveEditorNow('project-free')
    expect(localStorage.getItem(BEFORE_V2_KEY)).toBeNull()
  })

  it('새 형식 저장본에서 새로 더한 칸(자리 · 앞 빈 곳)을 모르고 열어도 같은 클립 · 순서 · 소리가 빈 곳만 붙어 열린다 — 배포를 되돌려도 옛 화면이 마지막 편집을 연다', async () => {
    // 왜: 새 형식은 옛 칸(순서 · 클립 · 소리)을 옛 뜻 그대로 적고 칸만 더한다. 옛 화면은 판 번호와 모르는 칸을 보지 않는다 —
    //   옛 코드(de1113-export · origin/main 43727d13)로 같은 저장본을 직접 열어 같은 결과를 확인했다(2026-11-14).
    //   잃는 것은 사람이 둔 빈 곳뿐: 빈 곳 뒤 클립과 이어진 소리는 당겨지고, 사람이 놓은 음악은 초 자리 그대로라 빈 곳 길이만큼 어긋난다.
    useEditorStore.setState({ audioClips: [...api().audioClips.filter((a) => a.id !== 'bgm'), music(9)] })
    api().deleteClip('B')
    await saveEditorNow('project-free')
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as PersistedEditor
    const oldView = { ...saved, version: 1, videoClips: saved.videoClips.map(({ gapBefore: _gap, ...rest }) => rest) }
    delete oldView.placements
    localStorage.setItem(LOCAL_KEY, JSON.stringify(oldView))
    canonical()
    await api().loadPersisted()
    expect(layout()).toEqual([['A', 0, 4], ['C', 4, 4], ['D', 8, 4]])
    expect([audioAt('A'), audioAt('C'), audioAt('D'), bgm()]).toEqual([0, 4, 8, 9])
  })
})

