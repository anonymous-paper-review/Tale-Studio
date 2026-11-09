// 영상 노드 여러 장이 동시에 기다리는 카드를 띄워도 화면 읽기에는 한 장만 알린다 (검토 B 5c, 리드 2026-11-09)
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

import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { VideoNodeData } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
/** 그 영상 노드의 기다리는 카드가 화면 읽기에 알리나(카드가 없으면 undefined). */
function announces(videoId: string): boolean | undefined {
  hooks.cursor = 0
  hooks.slots = []
  const data = director.getState().nodes.find((node) => node.id === videoId)!.data as VideoNodeData
  const impl = (VideoNode as unknown as { type: (props: Record<string, unknown>) => ReactNode }).type
  const card = elements(impl({ id: videoId, data, selected: false }))
    .find((node) => typeof node.type === 'function' && node.type.name === 'NodeWaitCard')
  return card ? card.props.announce === true : undefined
}

let videos: string[]
/** 샷 하나와 그 영상 노드 하나를 캔버스의 (x, y)에 둔다. */
function addVideo(n: number, x: number, y: number): string {
  const shotId = director.getState().addShotNode(null, { x, y })
  director.getState().updateNodeData<'shot'>(shotId, { label: `Shot ${n}`, writerShotId: `shot-${n}` })
  const videoId = director.getState().addVideoTake(shotId)!
  director.setState((s) => ({ nodes: s.nodes.map((node) => node.id === videoId ? { ...node, position: { x: x + 300, y } } : node) }))
  return videoId
}
function generate(videoId: string, jobId: string) {
  director.getState().updateNodeData<'video'>(videoId, { status: 'generating', lastAttemptStatus: 'generating', generationJobId: jobId, videoUrl: null, thumbnailUrl: null })
}

beforeEach(() => {
  director.setState({
    projectId: 'announce-project', nodes: [], edges: [], popupNodeId: null,
    videoBatchBusy: false, videoBatchProgress: null, videoBatchQueue: null, videoBatchCancelled: false,
  })
  // 화면 위치: 1 은 아래, 2 는 맨 위, 3 은 가운데.
  videos = [addVideo(1, 0, 800), addVideo(2, 0, 0), addVideo(3, 0, 400)]
  useLocaleStore.setState({ locale: 'ko' })
})

describe('혼자 정한 것', () => {
  // 왜: 검토 B 5c. 카드마다 알리면 같은 "다음 차례: …"를 겹쳐 읽었다. 묶음은 서버가 낸 순서가 있어, 가장 먼저 낸(곧 끝날) 영상의 카드가 알린다.
  it('영상 묶음이 여러 영상을 동시에 만들면 묶음이 먼저 낸 영상의 카드 하나만 화면 읽기에 알린다', () => {
    generate(videos[0]!, 'job-a')
    generate(videos[1]!, 'job-b')
    generate(videos[2]!, 'job-c')
    director.setState({ videoBatchBusy: true, videoBatchQueue: { jobIds: ['job-c', 'job-a', 'job-b'], pendingShotIds: [] } })

    expect(videos.map(announces)).toEqual([false, false, true])
  })

  // 왜: 따로 누른 영상은 낸 순서를 화면이 모른다(서버 묶음 순서가 없다). 보이는 순서(위 → 왼쪽)로 한 장을 고른다.
  it('묶음 없이 따로 만드는 영상만 있으면 화면에서 가장 위(같으면 왼쪽)에 있는 카드 하나만 알린다', () => {
    generate(videos[0]!, 'job-a')
    generate(videos[1]!, 'job-b')
    generate(videos[2]!, 'job-c')

    expect(videos.map(announces)).toEqual([false, true, false])
  })

  // 왜: 묶음이 도는 동안 따로 누른 영상이 끼어도 알리는 카드는 묶음의 첫 카드 하나다(묶음 카드에 다음 차례 · 막대가 있다).
  it('묶음과 따로 만드는 영상이 함께 돌면 묶음의 첫 카드만 알린다', () => {
    generate(videos[0]!, 'job-a')
    generate(videos[1]!, 'job-single')
    director.setState({ videoBatchBusy: true, videoBatchQueue: { jobIds: ['job-a'], pendingShotIds: [] } })

    expect(videos.map(announces)).toEqual([true, false, undefined])
  })

  // 왜: 정상 경로 고정. 만드는 영상이 하나뿐이면 그 카드가 알린다.
  it('만드는 영상이 하나뿐이면 그 카드가 화면 읽기에 알린다', () => {
    generate(videos[0]!, 'job-a')

    expect(announces(videos[0]!)).toBe(true)
  })
})
