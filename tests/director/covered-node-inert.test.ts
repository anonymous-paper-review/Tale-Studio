// 기다리는 카드가 영상 노드를 덮는 동안 그 밑의 단추에는 Tab 으로 들어가지 않는다 (검토 A C1, 리드 2026-11-09)
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

import { Handle } from '@xyflow/react'
import { BaseNode } from '@/features/director/canvas-nodes/BaseNode'
import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { VideoNodeData } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>
interface Seen { node: Element; inert: boolean }

/** 요소를 따라가며 inert 조상(화면 요소의 inert 속성) 아래인지 함께 적는다. 함수 컴포넌트는 펼치지 않고, 그 props 의 inert 는 속성이 아니라 넘긴 값이다. */
function walk(node: ReactNode, inert = false): Seen[] {
  if (Array.isArray(node)) return node.flatMap((child) => walk(child, inert))
  if (!isValidElement<Record<string, unknown>>(node)) return []
  const here = inert || (typeof node.type === 'string' && node.props.inert === true)
  return [{ node, inert: here }, ...walk(node.props.children as ReactNode, here)]
}
const named = (name: string) => (seen: Seen) => typeof seen.node.type === 'function' && seen.node.type.name === name
const impl = (component: unknown) => (component as { type: (props: Record<string, unknown>) => ReactNode }).type

let videoId: string
function renderVideo(): Seen[] {
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === videoId)!.data as VideoNodeData
  return walk(impl(VideoNode)({ id: videoId, data, selected: false }))
}
function renderBase(inert: boolean): Seen[] {
  hooks.cursor = 0
  return walk(impl(BaseNode)({ id: videoId, theme: 'video', title: 'Shot 1', canBranch: true, inert, children: null }))
}
/** 다 만든 영상을 다시 만드는 중: 카드 밑에 [재생] 단추가 있는 모습(검토 A C1). */
function retake() {
  director.getState().updateNodeData<'video'>(videoId, {
    status: 'completed', lastAttemptStatus: 'generating', videoUrl: 'https://media.test/v.mp4', thumbnailUrl: 'https://media.test/t.jpg',
  })
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  director.setState({ projectId: 'inert-project', nodes: [], edges: [], popupNodeId: null, playingNodeId: null })
  const shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { label: 'Shot 1', writerShotId: 'shot-1' })
  videoId = director.getState().addVideoTake(shotId)!
  useLocaleStore.setState({ locale: 'ko' })
})

describe('혼자 정한 것', () => {
  // 왜: 검토 A C1. 카드가 노드를 덮어도 밑의 [재생] · 노드 머리 단추에 Tab 초점이 보이지 않는 채로 들어갔다.
  it('영상을 만드는 동안 카드에 덮인 영상 노드 안의 단추에는 Tab 으로 들어가지 않는다', () => {
    retake()
    const seen = renderVideo()

    const base = seen.find((item) => item.node.props.theme === 'video')
    expect(base?.node.props.inert).toBe(true)
    const play = seen.filter((item) => item.node.type === 'button' && item.node.props['aria-label'] === '재생')
    expect(play.length).toBeGreaterThan(0)
    expect(play.every((item) => item.inert)).toBe(true)
    const header = renderBase(true).filter((item) => typeof item.node.props['aria-label'] === 'string' && /노드 (편집|삭제)/.test(String(item.node.props['aria-label'])))
    expect(header.length).toBeGreaterThan(0)
    expect(header.every((item) => item.inert)).toBe(true)
  })

  // 왜: 덮인 동안에도 선을 잇는 구멍은 쓰고, 카드의 상태 안내는 화면 읽기에 들린다. 고르기 · 끌기는 노드 틀이 받는다.
  it('카드에 덮여도 영상 노드의 입력 구멍과 기다리는 카드는 막지 않는다', () => {
    retake()
    const seen = renderVideo()

    const ports = seen.filter(named('LabeledTargetHandle'))
    expect(ports).toHaveLength(4)
    expect(ports.some((item) => item.inert)).toBe(false)
    expect(seen.find(named('NodeWaitCard'))?.inert).toBe(false)
    const baseHandles = renderBase(true).filter((item) => item.node.type === Handle)
    expect(baseHandles.length).toBeGreaterThan(0)
    expect(baseHandles.some((item) => item.inert)).toBe(false)
  })

  // 왜: 정상 경로 고정. 만들지 않을 때는 노드 안 단추에 지금처럼 Tab 으로 들어간다.
  it('영상을 만들지 않을 때는 영상 노드 안의 단추에 Tab 으로 들어갈 수 있다', () => {
    director.getState().updateNodeData<'video'>(videoId, {
      status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://media.test/v.mp4', thumbnailUrl: 'https://media.test/t.jpg',
    })
    const seen = renderVideo()

    expect(seen.find((item) => item.node.props.theme === 'video')?.node.props.inert).toBeFalsy()
    expect(seen.some((item) => item.inert)).toBe(false)
    expect(renderBase(false).some((item) => item.inert)).toBe(false)
  })
})
