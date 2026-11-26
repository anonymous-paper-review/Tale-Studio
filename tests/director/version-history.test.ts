// 카드에 마우스를 올리면 카드 아래에 지난 판이 가장 새 것부터 5개까지 작은 카드로 뜨고, 누르면 그 판의 상세가 열리며, 상세의 [채택]이 그 판을 지금(최종) 판으로 만든다 (오너 2026-11-26 D2 · A4 · S3)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }) }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: () => Promise.resolve() }))

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { DirectorDetailPanel } from '@/features/director/canvas-panels/DirectorDetailPanel'
import { gridVideoView } from '@/features/director/canvas-views/StoryboardGridView'
import { VersionStrip } from '@/components/version-history/version-history-hover'
import { historyStrip, pastImageVersions, pastTakes } from '@/lib/version-history'
import { shotDetailTakes } from '@/lib/director/shot-detail'
import { selectStoryboardVersion, withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import type { StoryboardImage, VideoNodeData } from '@/types/director'

let shotId = ''

function setLocale(locale: 'ko' | 'en') {
  useLocaleStore.setState({ locale })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
}
function syncStores() {
  Object.assign(director.getInitialState(), director.getState())
  Object.assign(useProjectFormatStore.getInitialState(), useProjectFormatStore.getState())
}
const render = (layout: 'popup' | 'panel', tab: 'image' | 'video' = 'image', initialTakeId: string | null = null) => {
  syncStores()
  return renderToStaticMarkup(createElement(DirectorShotDetail, { shotNodeId: shotId, initialTab: tab, initialTakeId, layout, onClose: () => {} }))
}
const version = (n: number) => ({
  id: `job-${n}`,
  url: `https://media.test/v${n}-s.png`,
  frames: { start: `https://media.test/v${n}-s.png`, direction: `https://media.test/v${n}-d.png`, end: `https://media.test/v${n}-e.png` },
  generatedAt: n,
  source: 'generated' as const,
})
/** v1 … v{count} 를 차례로 만든 그림 — 마지막에 만든 것이 지금 그림. selected 를 주면 그 판을 골라 둔다. */
function made(count: number, selected?: number): StoryboardImage {
  let image: StoryboardImage | null = null
  for (let n = 1; n <= count; n++) image = withStoryboardVersion(image, version(n), { select: true })
  return selected ? selectStoryboardVersion(image, `job-${selected}`)! : image!
}
const useImage = (image: StoryboardImage) => director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: image })
function addTake(over: Partial<VideoNodeData>): string {
  const id = director.getState().addVideoTake(shotId)!
  director.getState().updateNodeData<'video'>(id, over)
  return id
}
const done = (n: number, over: Partial<VideoNodeData> = {}) =>
  addTake({ takeNumber: n, status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://media.test/take-${n}.mp4`, ...over })
/** 글자를 담은 단추의 여는 태그 — 꺼짐(disabled)을 본다. */
function buttonTag(out: string, label: string): string {
  const at = out.indexOf(label)
  expect(at, label).toBeGreaterThan(-1)
  const start = out.lastIndexOf('<button', at)
  return out.slice(start, out.indexOf('>', start) + 1)
}
const imageTab = () => readFileSync('src/features/director/shot-detail/shot-image-tab.tsx', 'utf8')

beforeEach(() => {
  director.setState({ projectId: 'history-project', nodes: [], edges: [], realBatchBusy: false, generatingNodeIds: {}, detailNodeId: null, detailVersionId: null, viewMode: 'storyboard' })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01' })
  useProjectFormatStore.setState({ format: 'horizontal_16:9' })
  setLocale('en')
})
afterEach(() => vi.unstubAllGlobals())

describe('지난 판 고르기', () => {
  it('지난 이미지 판은 지금 그림인 판을 빼고 가장 새 판부터 5개까지 보이고, 넘치는 판 수를 센다', () => {
    // 왜: 오너 D2 "과거 이력 아래에 뜨기 (5개까지)" — 카드가 곧 지금 판이라 줄에는 지난 판만, 가장 새 것이 왼쪽(혼자 정한 것 a · c · d).
    const strip = historyStrip(pastImageVersions(made(8, 3)))
    expect(strip.shown.map((v) => `v${v.n}`)).toEqual(['v8', 'v7', 'v6', 'v5', 'v4'])
    expect(strip.more).toBe(2)
    expect(strip.shown[0]).toMatchObject({ id: 'job-8', thumbUrl: 'https://media.test/v8-s.png', upload: false, stopped: false })
    // 지금 그림이 가장 새 판이면 그 앞 판들만.
    expect(historyStrip(pastImageVersions(made(3))).shown.map((v) => v.n)).toEqual([2, 1])
  })

  it('지난 판이 없으면(판이 하나뿐이거나 그림이 없으면) 줄에 보일 것이 없고 줄이 뜨지 않는다', () => {
    // 왜: 빈 줄이 뜨면 고장처럼 보인다(혼자 정한 것 b) — 마우스 올림 판은 보일 판이 있을 때만 열린다.
    expect(pastImageVersions(made(1))).toEqual([])
    expect(pastImageVersions(null)).toEqual([])
    expect(historyStrip([])).toEqual({ shown: [], more: 0 })
    expect(readFileSync('src/components/version-history/version-history-hover.tsx', 'utf8')).toMatch(/open=\{has && open\}/)
  })

  it('지난 Take 줄에는 카드가 트는 Take 를 뺀, 다 만든 Take 만 가장 새 것부터 들어간다', () => {
    // 왜: 실패 · 만드는 중 Take 는 채택할 영상이 없다. 멈춘 뒤 끝난 Take 는 영상이 있어 ★ 로 고를 수 있다(혼자 정한 것 e).
    const take = (id: string, takeNumber: number, over: Partial<Parameters<typeof pastTakes>[0][number]> = {}) =>
      ({ id, takeNumber, status: 'completed', videoUrl: `https://media.test/${id}.mp4`, thumbnailUrl: null, cancelledAt: null, ...over })
    const takes = [
      take('t1', 1, { thumbnailUrl: 'https://media.test/t1.jpg' }),
      take('t2', 2, { status: 'failed', videoUrl: null }),
      take('t3', 3, { status: 'generating', videoUrl: null }),
      take('t4', 4, { cancelledAt: '2026-11-26T01:00:00Z' }),
      take('t5', 5),
    ]
    const past = pastTakes(takes, 't5')
    expect(past.map((p) => p.id)).toEqual(['t4', 't1'])
    expect(past[0]).toMatchObject({ takeNumber: 4, stopped: true, thumbUrl: null, videoUrl: 'https://media.test/t4.mp4' })
    expect(past[1]).toMatchObject({ thumbUrl: 'https://media.test/t1.jpg', stopped: false })
  })

  it('스토리보드 카드는 ★ 로 고른(채택한) Take 를 틀고, 고르지 않았으면 가장 새 완성 Take 를 튼다', () => {
    // 왜: 채택했는데 카드가 가장 새 Take 그대로면 채택이 안 된 것처럼 보인다 — 카드가 Editor 로 가는 Take 와 같아진다(혼자 정한 것 f).
    const rec = (id: string, take: number, over: Record<string, unknown> = {}) => ({
      id, take_number: take, created_at: `2026-11-26T0${take}:00:00Z`, status: 'completed' as const, url: `https://media.test/${id}.mp4`, is_final: false,
      last_attempt_status: 'completed' as const, last_attempt_at: `2026-11-26T0${take}:00:00Z`, last_attempt_error: null, cancelled_at: null, node: {} as never, ...over,
    })
    expect(gridVideoView([rec('t1', 1), rec('t2', 2)]).cardTake?.id).toBe('t2')
    expect(gridVideoView([rec('t1', 1, { is_final: true }), rec('t2', 2)]).cardTake?.id).toBe('t1')
  })
})

describe('지난 판 줄', () => {
  it('지난 판 줄은 작은 카드마다 판 이름(v8 · Take 2)을 보이고, 넘치는 판이 있으면 끝에 +N 을 보인다', () => {
    // 왜: 오너 D2 · A4 "5개까지 작은 카드 형태로" — 더 있다는 것은 알게 하고 모든 판은 상세에서 본다(혼자 정한 것 c).
    const cards = historyStrip(pastImageVersions(made(8, 3))).shown.map((v) => ({ id: v.id, label: `v${v.n}`, thumbUrl: v.thumbUrl }))
    const out = renderToStaticMarkup(createElement(VersionStrip, { cards, more: 2, aspect: '16 / 9', onOpen: () => {}, onMore: () => {} }))
    expect(out.match(/data-testid="version-strip-card"/g)).toHaveLength(5)
    for (const name of ['v8', 'v7', 'v6', 'v5', 'v4']) expect(out).toContain(`>${name}<`)
    expect(out).toContain('>+2<')
    expect(out).toContain('aria-label="Open v8 in details"')
    setLocale('ko')
    const ko = renderToStaticMarkup(createElement(VersionStrip, { cards, more: 2, aspect: '16 / 9', onOpen: () => {}, onMore: () => {} }))
    expect(ko).toContain('aria-label="지난 판"')
    expect(ko).toContain('aria-label="v8 상세 열기"')
    expect(ko).toContain('상세에서 나머지 2개 판 보기')
    const takes = renderToStaticMarkup(createElement(VersionStrip, { cards: [{ id: 't2', label: 'Take 2', thumbUrl: null, videoUrl: 'https://media.test/t2.mp4' }], more: 0, aspect: '9 / 16', onOpen: () => {}, onMore: () => {} }))
    expect(takes).toContain('>Take 2<')
    expect(takes).toContain('src="https://media.test/t2.mp4#t=0.1"')
    expect(takes).not.toContain('autoplay')
    expect(takes).not.toContain('data-testid="version-strip-more"')
  })
})

describe('상세의 [채택] — 이미지', () => {
  it('지난 이미지 판 작은 카드를 누르면 상세가 열리고 이미지 탭이 그 판의 시작 · 끝 그림과 [채택]을 보인다', () => {
    // 왜: 오너 D2 "과거 클릭 후 상세페이지로 들어가면 '채택'" — 스토리보드형은 팝업, 노드형은 왼쪽 패널이 같은 상세다.
    useImage(made(2))
    director.getState().openShotDetail(shotId, 'image', { versionId: 'job-1' })
    const out = render('popup')
    expect(out).toContain('data-testid="shot-detail-viewing"')
    expect(out).toContain('Viewing v1 · Current v2')
    expect(out).toContain('src="https://media.test/v1-s.png"')
    expect(out).toContain('src="https://media.test/v1-e.png"')
    expect(out).not.toContain('src="https://media.test/v2-e.png"')
    expect(out).toMatch(/aria-pressed="false"[^>]*data-viewing="true"[^>]*>v1</)
    expect(out).toMatch(/aria-pressed="true"[^>]*>v2</)
    expect(buttonTag(out, '>Adopt<')).not.toMatch(/\sdisabled=""/)
    setLocale('ko')
    const ko = render('popup')
    expect(ko).toContain('보는 판 v1 · 지금 그림 v2')
    expect(ko).toContain('>채택<')
    expect(ko).toContain('>지금 그림 보기<')
    // 노드형: 같은 상세가 왼쪽 패널에.
    director.getState().setViewMode('node')
    director.getState().openShotDetail(shotId, 'image', { versionId: 'job-1' })
    syncStores()
    expect(renderToStaticMarkup(createElement(DirectorDetailPanel))).toContain('data-testid="shot-detail-viewing"')
  })

  it('[채택]을 누르면 다시 만들지 않고(Take 0) 그 판이 지금 그림이 되며, 보던 판 표시는 사라진다', async () => {
    // 왜: 채택은 고르기다 — 그림을 새로 만들지 않아 Take 가 들지 않는다(버전 칩과 같은 길, 11/14 답 5).
    expect(imageTab()).toMatch(/if \(await selectStoryboardImageVersion\(nodeId, viewing\.id\)\) setDetailVersion\(null\)/)
    expect(imageTab()).toMatch(/onAdopt=\{\(\) => void adopt\(\)\}/)
    expect(imageTab()).toMatch(/onClick=\{onAdopt\} data-testid="shot-detail-adopt"/)
    const two = made(2)
    useImage(two)
    director.getState().openShotDetail(shotId, 'image', { versionId: 'job-1' })
    const fetcher = vi.fn().mockResolvedValue(Response.json({ image: selectStoryboardVersion(two, 'job-1') }))
    vi.stubGlobal('fetch', fetcher)
    expect(await director.getState().selectStoryboardImageVersion(shotId, 'job-1')).toBe(true)
    director.getState().setDetailVersion(null)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![0]).toBe('/api/director/storyboard-image/version')
    const out = render('popup')
    expect(out).not.toContain('data-testid="shot-detail-viewing"')
    expect(out).toMatch(/aria-pressed="true"[^>]*>v1</)
    expect(out).toContain('src="https://media.test/v1-e.png"')
  })

  it('채택하지 않고 [지금 그림 보기]나 지금 그림 칩을 누르면 지금 그림으로 돌아간다', () => {
    // 왜: 보기만 하고 나갈 길(혼자 정한 것 h) — 지금 그림 칩은 지금처럼 그 판 그대로다(혼자 정한 것 i).
    expect(imageTab()).toMatch(/onBack=\{\(\) => \{ setAdoptError\(null\); setDetailVersion\(null\) \}\}/)
    expect(imageTab()).toMatch(/onClick=\{onBack\}>\{t\('Back to current'\)\}/)
    expect(imageTab()).toMatch(/if \(active\) \{ setDetailVersion\(null\); return \}/)
    useImage(made(2))
    director.getState().openShotDetail(shotId, 'image', { versionId: 'job-1' })
    director.getState().setDetailVersion(null)
    const out = render('popup')
    expect(out).not.toContain('data-testid="shot-detail-viewing"')
    expect(out).toContain('src="https://media.test/v2-e.png"')
  })

  it('판 없이 상세를 열거나 상세를 닫으면 보던 지난 판을 비운다', () => {
    // 왜: ⤢ 로 다시 연 상세가 예전에 보던 지난 판을 띄우면 지금 그림인 줄 안다.
    useImage(made(2))
    director.getState().openShotDetail(shotId, 'image', { versionId: 'job-1' })
    director.getState().openShotDetail(shotId, 'image')
    expect(director.getState().detailVersionId).toBeNull()
    director.getState().openShotDetail(shotId, 'image', { versionId: 'job-1' })
    director.getState().closeShotDetail()
    expect(director.getState().detailVersionId).toBeNull()
  })

  it('그림을 다시 만드는 중에는 [채택]이 꺼진다', () => {
    // 왜: 만드는 중에 채택하면 끝난 새 그림이 그 채택을 덮는다 — 끝난 뒤에 채택한다(혼자 정한 것).
    useImage({ ...made(2), status: 'generating' })
    director.getState().openShotDetail(shotId, 'image', { versionId: 'job-1' })
    const tag = buttonTag(render('popup'), '>Adopt<')
    expect(tag).toMatch(/\sdisabled=""/)
    expect(tag).toContain('title="You can adopt it after the image is remade."')
  })
})

describe('상세의 [채택] — 영상', () => {
  it('지난 Take 작은 카드를 누르면 영상 탭이 그 Take 를 먼저 보이고, 그 Take 의 [☆ 채택]이 그 Take 를 ★ 최종으로 만든다', () => {
    // 왜: 오너 D2 "과거 클릭 후 상세페이지로 들어가면 '채택'" — 영상의 채택은 ★ 최종(Editor 로 가는 Take)이다. 세 탭 같은 말(혼자 정한 것 g).
    const t1 = done(1, { videoClipId: 'clip-1' })
    done(2, { videoClipId: 'clip-2' })
    director.getState().openShotDetail(t1, 'video')
    expect(director.getState()).toMatchObject({ detailNodeId: t1, detailTab: 'video' })
    const out = render('popup', 'video', t1)
    expect(out).toMatch(/data-testid="shot-detail-take-preview"[\s\S]*Take 1/)
    expect(out).toContain('>☆ Adopt<')
    expect(out).not.toContain('Set as final')
    setLocale('ko')
    expect(render('popup', 'video', t1)).toContain('>☆ 채택<')
    expect(readFileSync('src/features/director/shot-detail/shot-video-tab.tsx', 'utf8')).toMatch(/onClick=\{\(\) => void markFinal\(take, true\)\} data-testid="shot-detail-take-adopt">\{t\('☆ Adopt'\)\}/)
    // 채택 = ★ 최종 저장(지금 있는 길) — 누른 즉시 ★ 가 그 Take 로 옮는다. 저장 답은 기다리지 않는다(시험에서는 오지 않는 답).
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    void director.getState().setVideoFinal(t1, true)
    expect(shotDetailTakes(director.getState().nodes, shotId).final).toEqual({ id: t1, auto: false })
  })
})
