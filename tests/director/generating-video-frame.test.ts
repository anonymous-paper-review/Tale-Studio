// 영상 노드의 그림 자리는 "만드는 중"과 "기다리는 중"을 한꺼번에 보이지 않는다 (11/5 시안 DG 맞춰 보기 2026-11-09)
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

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!isValidElement<Record<string, unknown>>(node)) return ''
  return textOf(node.props.children as ReactNode)
}
function childrenOf(node: Element): Element[] {
  return ([] as ReactNode[]).concat(node.props.children as ReactNode).flat(Infinity as 1)
    .filter((child): child is Element => isValidElement<Record<string, unknown>>(child))
}
function isOverlay(node: Element): boolean {
  return typeof node.type === 'function' && node.type.name === 'GeneratingOverlay'
}
/** 그림 자리 = 만드는 중 표시(GeneratingOverlay)를 바로 품은 틀. 함수 컴포넌트는 펼치지 않고 요소만 따라간다. */
function mediaFrame(node: ReactNode): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = mediaFrame(child)
      if (found) return found
    }
    return null
  }
  if (!isValidElement<Record<string, unknown>>(node)) return null
  if (childrenOf(node).some(isOverlay)) return node
  return mediaFrame(node.props.children as ReactNode)
}

let videoId: string
function renderFrame(): Element {
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === videoId)!.data as VideoNodeData
  const impl = (VideoNode as unknown as { type: (props: Record<string, unknown>) => ReactNode }).type
  const frame = mediaFrame(impl({ id: videoId, data, selected: false }))
  expect(frame, '영상 노드의 그림 자리').not.toBeNull()
  return frame!
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  director.setState({ projectId: 'generating-frame-project', nodes: [], edges: [], popupNodeId: null })
  const shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', provider: 'seedance' })
  videoId = director.getState().addVideoTake(shotId)!
  useLocaleStore.setState({ locale: 'ko' })
})

describe('혼자 정한 것', () => {
  // 왜: 영상을 처음 만들기 시작하면(낱개로 누르든 묶음으로 만들든) 그림 자리에 "대기 중"과 "영상 생성 중"이 한꺼번에 보여,
  //   기다리는 건지 만드는 건지 헷갈렸다(11/5 시안 DG 맞춰 보기에서 찾음. 시안은 만드는 노드에 "대기 중"이 없다).
  it("영상을 처음 만드는 중이면 그림 자리에 '대기 중'을 쓰지 않는다", () => {
    director.getState().updateNodeData<'video'>(videoId, {
      status: 'generating', lastAttemptStatus: 'generating', videoUrl: null, thumbnailUrl: null,
    })
    const frame = renderFrame()

    expect(childrenOf(frame).find(isOverlay)?.props.active).toBe(true)
    expect(textOf(frame)).not.toContain('대기 중')
  })

  // 왜: 정상 경로 고정. 아직 만들지 않은 영상 노드는 그림 자리에서 왜 비었는지 알린다.
  //   2026-11-14 문장 바꿈(시안 D1 노드형 406:4051 "이미지가 생기면 만들 수 있어요", 오너 11/13 허락 · 리드 답 5a):
  //   예전 "영상이 아직 없고 만드는 중도 아니면 그림 자리에 '대기 중'을 쓴다".
  it("영상이 아직 없고 만드는 중도 아니며 그 샷에 이미지가 없으면 그림 자리에 '이미지가 생기면 만들 수 있어요'를 쓴다", () => {
    const frame = renderFrame()

    expect(childrenOf(frame).find(isOverlay)?.props.active).toBe(false)
    expect(textOf(frame)).toContain('이미지가 생기면 만들 수 있어요')
    expect(textOf(frame)).not.toContain('대기 중')
  })

  // 왜: 이미지가 이미 있으면 기다릴 것이 없다 — "대기 중"은 무엇을 기다리는지 말하지 않았다(혼자 정한 것, 리드 답 5a).
  it("영상이 아직 없고 만드는 중도 아니며 그 샷에 이미지가 있으면 그림 자리에 '영상을 만들 수 있어요'를 쓴다", () => {
    const shotId = director.getState().nodes.find((node) => node.data.kind === 'shot')!.id
    director.getState().updateNodeData<'shot'>(shotId, {
      storyboardImage: { url: 'https://media.test/shot-1.jpg', status: 'completed', errorMessage: null, generatedAt: 1 },
    })
    const frame = renderFrame()

    expect(textOf(frame)).toContain('영상을 만들 수 있어요')
    expect(textOf(frame)).not.toContain('대기 중')
  })
})
