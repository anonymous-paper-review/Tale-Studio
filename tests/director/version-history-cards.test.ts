// Director 스토리보드 카드와 노드형 샷 노드는 같은 지난 판 부품으로 감싸여, 마우스를 올리면 그 아래에 지난 판이 뜨고 누르면 그 판의 상세가 열린다 (오너 2026-11-26 D2)
import { readFileSync } from 'node:fs'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand/vanilla'

// 이 파일은 React 훅을 꾸며 두고 부품을 함수로 불러 그 안의 요소(지난 판 부품과 그 값)를 본다 — detail-open.test.ts 와 같은 방식.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useDebugValue: () => {},
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    return [hooks.slots[slot], (value: unknown) => { hooks.slots[slot] = value }]
  },
  useRef: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect: () => {},
  useLayoutEffect: () => {},
}))
vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla')
  const create = (initializer?: StateCreator<unknown>) => {
    if (!initializer) return create
    const store = createStore(initializer)
    return Object.assign((selector?: (state: unknown) => unknown) =>
      selector ? selector(store.getState()) : store.getState(), store)
  }
  return { create }
})
vi.mock('@xyflow/react', () => ({ Handle: () => null, NodeToolbar: () => null, Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' } }))
vi.mock('@/lib/billing/use-take-balance', () => ({
  useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false, failed: false }),
}))
vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
}))

import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'
import { StoryboardGridView } from '@/features/director/canvas-views/StoryboardGridView'
import { withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { StoryboardImage, VideoNodeData } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
const named = (name: string) => (node: Element) => typeof node.type === 'function' && node.type.name === name
const call = (element: Element) => elements((element.type as (props: Record<string, unknown>) => ReactNode)(element.props))

function renderShotNode(id: string): Element[] {
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === id)!.data
  const impl = (ShotNode as unknown as { type: (props: Record<string, unknown>) => ReactNode }).type
  return elements(impl({ id, data, selected: false }))
}
/** 스토리보드 보기의 그 샷 카드 — 보드를 그리고 그 안의 카드 부품을 부른다. */
function renderCard(id: string): Element[] {
  hooks.cursor = 0
  const board = elements((StoryboardGridView as (props: Record<string, unknown>) => ReactNode)({ zoomLevel: 3, onZoomLevelChange: () => {} }))
  const cell = board.find((el) => named('ShotCell')(el) && (el.props.node as { id: string }).id === id)
  expect(cell, 'shot card').toBeTruthy()
  return call(cell!)
}
const hoverOf = (tree: Element[]) => tree.find(named('VersionHistoryHover'))!
const labels = (hover: Element) => (hover.props.cards as Array<{ label: string }>).map((card) => card.label)

const version = (n: number) => ({
  id: `job-${n}`,
  url: `https://media.test/v${n}-s.png`,
  frames: { start: `https://media.test/v${n}-s.png`, direction: `https://media.test/v${n}-d.png`, end: `https://media.test/v${n}-e.png` },
  generatedAt: n,
  source: 'generated' as const,
})
function made(count: number): StoryboardImage {
  let image: StoryboardImage | null = null
  for (let n = 1; n <= count; n++) image = withStoryboardVersion(image, version(n), { select: true })
  return image!
}
function done(shot: string, n: number, over: Partial<VideoNodeData> = {}): string {
  const id = director.getState().addVideoTake(shot)!
  director.getState().updateNodeData<'video'>(id, {
    takeNumber: n, status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://media.test/take-${n}.mp4`,
    createdAt: `2026-11-26T0${n}:00:00Z`, lastAttemptAt: `2026-11-26T0${n}:00:00Z`, ...over,
  })
  return id
}

let shotId: string
beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  director.setState({
    projectId: 'history-cards', nodes: [], edges: [], popupNodeId: null, selectedNodeId: null, detailNodeId: null, detailVersionId: null,
    videoBatchBusy: false, videoBatchProgress: null, videoBatchQueue: null, videoBatchCancelled: false, realBatchBusy: false,
    viewMode: 'storyboard', storyboardMediaMode: 'real', statusFilter: 'all', pickedShotIds: [],
  })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { label: 'Shot 1', writerShotId: 'w1', storyboardImage: made(7) })
  useLocaleStore.setState({ locale: 'en' })
})

describe('같이 정한 것', () => {
  it('노드형 샷 노드의 그림에 마우스를 올리면 그 아래에 지난 이미지 판이 5개까지 뜨고, 누르면 왼쪽 상세가 그 판을 먼저 보인다', () => {
    // 왜: 오너 D2 "이미지/영상 호버링하면 과거 이력 아래에 뜨기 (5개까지)" — 노드형에서도 지난 이미지 판은 캔버스에 보이지 않는다.
    const hover = hoverOf(renderShotNode(shotId))
    expect(labels(hover)).toEqual(['v6', 'v5', 'v4', 'v3', 'v2'])
    expect(hover.props.more).toBe(1)
    ;(hover.props.onOpen as (id: string) => void)('job-2')
    expect(director.getState()).toMatchObject({ detailNodeId: shotId, detailTab: 'image', detailVersionId: 'job-2' })
    ;(hover.props.onMore as () => void)()
    expect(director.getState()).toMatchObject({ detailNodeId: shotId, detailTab: 'image', detailVersionId: null })
  })

  it('스토리보드 카드에 마우스를 올리면 카드 아래에 지난 이미지 판이 뜨고, 누르면 상세 팝업이 그 판을 먼저 보인다', () => {
    // 왜: 오너 D2 — 스토리보드 보기의 카드도 노드와 같은 줄 · 같은 상세다.
    const hover = hoverOf(renderCard(shotId))
    expect(labels(hover)).toEqual(['v6', 'v5', 'v4', 'v3', 'v2'])
    ;(hover.props.onOpen as (id: string) => void)('job-3')
    expect(director.getState()).toMatchObject({ detailNodeId: shotId, detailTab: 'image', detailVersionId: 'job-3' })
  })

  it('영상이 있는 스토리보드 카드에 마우스를 올리면 지난 Take 가 가장 새 것부터 뜨고, 누르면 영상 탭이 그 Take 를 먼저 보인다', () => {
    // 왜: 오너 D2 "이미지/영상" — 카드가 영상을 틀면 줄도 영상(Take)이다. 카드가 트는 Take(★, 없으면 가장 새 것)는 빼고 보인다.
    const t1 = done(shotId, 1)
    done(shotId, 2)
    done(shotId, 3)
    const hover = hoverOf(renderCard(shotId))
    expect(labels(hover)).toEqual(['Take 2', 'Take 1'])
    expect((hover.props.cards as Array<{ videoUrl?: string }>)[1]!.videoUrl).toBe('https://media.test/take-1.mp4')
    ;(hover.props.onOpen as (id: string) => void)(t1)
    expect(director.getState()).toMatchObject({ detailNodeId: t1, detailTab: 'video' })
    // ★ 로 Take 1 을 채택했으면 카드는 Take 1 을 틀고 줄은 Take 3 · Take 2.
    director.getState().updateNodeData<'video'>(t1, { final: true })
    expect(labels(hoverOf(renderCard(shotId)))).toEqual(['Take 3', 'Take 2'])
  })

  it('세 탭이 같은 지난 판 부품을 쓴다 — 스토리보드 카드 · 노드형 샷 노드가 공용 부품으로 감싸여 있다', () => {
    // 왜: 리드 "세 탭이 같은 부품 · 같은 모양" — 화면마다 다른 줄을 만들면 모양이 갈린다(Artist · Storyboard 는 합친 뒤 같은 부품을 붙인다).
    for (const file of ['src/features/director/canvas-views/StoryboardGridView.tsx', 'src/features/director/canvas-nodes/ShotNode.tsx']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/import \{ VersionHistoryHover, stripAspect[^}]*\} from '@\/components\/version-history\/version-history-hover'/)
    }
  })
})

describe('혼자 정한 것', () => {
  it('러프 보기 카드와 러프만 있는 노드는 판 기록이 없어 줄이 뜨지 않는다', () => {
    // 왜: 러프(콘티)는 다시 그리면 덮어써 지난 판이 없다(혼자 정한 것 l).
    director.setState({ storyboardMediaMode: 'previz' })
    expect(hoverOf(renderCard(shotId)).props.cards).toEqual([])
    director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: null })
    expect(renderShotNode(shotId).find(named('VersionHistoryHover'))).toBeUndefined()
  })

  it('노드형 Take 노드에는 지난 판 줄이 없다 — Take 하나가 노드 하나라 지난 Take 가 캔버스에 이미 보인다', () => {
    // 왜: 줄이 아래 Take 노드를 덮고, 노드마다 ★ 가 있다(혼자 정한 것 j).
    expect(readFileSync('src/features/director/canvas-nodes/VideoNode.tsx', 'utf8')).not.toContain('VersionHistoryHover')
  })
})
