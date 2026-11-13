// 노드형: 이미지를 그리는 샷 노드와 영상을 만드는 Take 노드는 기다리는 카드로 덮이고, 그 안에 [멈추기]가 있다 (시안 D4 406:5275 · 오너 2026-11-14 7번, 리드 S4-2 6)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

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
vi.mock('@/lib/billing/use-take-balance', () => ({
  useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }),
}))

import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'
import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { StopMakingButton } from '@/features/director/stop-making-button'
import { _setGenerationQueueSnapshotForTests, type ActiveJob } from '@/lib/generation-queue'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'

type Element = ReactElement<Record<string, unknown>>

/** 함수 컴포넌트(NodeWaitCard 등)는 펼치지 않고 요소만 따라간다 — 공용 부품에 무엇을 넘기는지 본다. */
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
const named = (name: string) => (node: Element) => typeof node.type === 'function' && node.type.name === name
function render(component: unknown, id: string): Element[] {
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === id)!.data
  const impl = (component as { type: (props: Record<string, unknown>) => ReactNode }).type
  return elements(impl({ id, data, selected: false }))
}
const job = (id: string, kind: string, extra: Partial<ActiveJob> = {}): ActiveJob => ({ id, kind: kind as ActiveJob['kind'], target: {}, ...extra })
const PROJECT = 'stop-node-project'

let shotId: string
beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  director.setState({
    projectId: PROJECT, nodes: [], edges: [], popupNodeId: null, selectedNodeId: null,
    videoBatchBusy: false, videoBatchProgress: null, videoBatchQueue: null, videoBatchCancelled: false, realBatchBusy: false,
  })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { label: 'Shot 3', writerShotId: 'w3' })
  _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [] })
  useLocaleStore.setState({ locale: 'ko' })
})

describe('같이 정한 것', () => {
  it('노드형에서 이미지를 그리는 샷 노드는 기다리는 카드로 덮이고 그 안에 [멈추기]가 있다', () => {
    // 왜: 시안 D4 — 이미지 노드도 "이미지를 그리고 있어요" 카드로 덮고 [멈추기]. 예전엔 테두리 빛뿐이라 멈출 곳이 없었다(오너 7번).
    _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [job('image-1', 'shot_storyboard', { target: { writerShotId: 'w3' } })] })
    const card = render(ShotNode, shotId).find(named('NodeWaitCard'))
    expect(card?.props.title).toBe('이미지를 그리고 있어요')
    const action = card?.props.action as Element
    expect(action.type).toBe(StopMakingButton)
    expect(action.props).toMatchObject({ target: { jobIds: ['image-1'], sheetShots: 1 }, kind: 'image' })
  })

  it('노드형에서 만드는 중인 Take 노드의 기다리는 카드에 [멈추기]가 있고, 누르면 그 Take 를 화면에서 멈춘다', () => {
    // 왜: 시안 D4 "영상을 만들고 있어요 … [멈추기]" · 오너 7번 — 멈춘 Take 는 바로 고쳐 다시 만들 수 있다.
    const videoId = director.getState().addVideoTake(shotId)!
    director.getState().updateNodeData<'video'>(videoId, {
      status: 'generating', lastAttemptStatus: 'generating', generationJobId: 'video-job-1', videoUrl: null, thumbnailUrl: null,
    })
    const card = render(VideoNode, videoId).find(named('NodeWaitCard'))
    const action = card?.props.action as Element
    expect(action.type).toBe(StopMakingButton)
    expect(action.props).toMatchObject({ target: { jobIds: ['video-job-1'], sheetShots: 1 }, kind: 'video' })
  })
})

describe('혼자 정한 것', () => {
  it('같은 장에 묶인 샷이 있으면 노드 카드 아래에 "같은 장 샷 N개가 같이 멈춰요"를 쓴다', () => {
    // 왜: 4샷이 한 장이라 이 노드를 멈추면 다른 세 노드도 멈춘다(S4 혼자 정한 것 c) — 누르기 전에 안다.
    _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [job('sheet-1', 'storyboard_real_grid', { target: { writerShotIds: ['w1', 'w2', 'w3', 'w4'] } })] })
    const card = render(ShotNode, shotId).find(named('NodeWaitCard'))
    expect(card?.props.note).toBe('같은 장 샷 4개가 같이 멈춰요')
    expect((card?.props.action as Element).props).toMatchObject({ target: { jobIds: ['sheet-1'], sheetShots: 4 } })
  })

  it('이미지를 그리지 않는 샷 노드는 기다리는 카드로 덮지 않는다', () => {
    // 왜: 정상 경로 고정. 다른 샷의 작업이나 화면에서 멈춘 작업으로 이 노드를 덮지 않는다.
    _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [
      job('other', 'shot_storyboard', { target: { writerShotId: 'w9' } }),
      job('stopped', 'shot_storyboard', { target: { writerShotId: 'w3' }, cancelledAt: '2026-11-14T00:00:00.000Z' }),
    ] })
    expect(render(ShotNode, shotId).find(named('NodeWaitCard'))).toBeUndefined()
  })
})
