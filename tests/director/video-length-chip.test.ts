// 다 만든 영상 노드의 그림 위에 영상 파일에서 읽은 길이를 "▶ 0:05"처럼 보인다 (11/5 시안 DG, 리드 2026-11-09 c2)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))
const lengths = vi.hoisted(() => new Map<string, number>())
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
// 영상 파일의 길이는 브라우저가 파일 머리를 읽어 알려 준다 — 여기서는 읽은 결과만 정한다(못 읽으면 없음).
vi.mock('@/features/director/hooks/use-video-length', () => ({
  useVideoLength: (url: string | null) => (url ? lengths.get(url) ?? null : null),
}))

import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { VideoNodeData } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>
type Chip = (props: { url: string }) => ReactNode

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!isValidElement<Record<string, unknown>>(node)) return ''
  return textOf(node.props.children as ReactNode)
}

const VIDEO_URL = 'https://media.test/shot-1.mp4'
let videoId: string
function chip(): Element | undefined {
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === videoId)!.data as VideoNodeData
  const impl = (VideoNode as unknown as { type: (props: Record<string, unknown>) => ReactNode }).type
  return elements(impl({ id: videoId, data, selected: false }))
    .find((node) => typeof node.type === 'function' && node.type.name === 'VideoLengthChip')
}
/** 칩이 그리는 글 — 칩 자체도 펼쳐 본다(못 읽으면 아무것도 그리지 않는다). */
function chipText(found: Element | undefined): string {
  return found ? textOf((found.type as Chip)({ url: String(found.props.url) })) : ''
}
function complete() {
  director.getState().updateNodeData<'video'>(videoId, {
    status: 'completed', lastAttemptStatus: 'completed', videoUrl: VIDEO_URL, thumbnailUrl: 'https://media.test/shot-1.jpg',
  })
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  lengths.clear()
  director.setState({ projectId: 'length-chip-project', nodes: [], edges: [], popupNodeId: null, playingNodeId: null })
  const shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { label: 'Shot 1', writerShotId: 'shot-1' })
  videoId = director.getState().addVideoTake(shotId)!
  useLocaleStore.setState({ locale: 'ko' })
})

describe('혼자 정한 것', () => {
  // 왜: 시안 DG 의 다 만든 영상 그림 위 "▶ 0:05". 길이는 샷에 적은 계획 길이가 아니라 만들어진 영상 파일의 실제 길이다(리드 c2).
  it("다 만든 영상의 그림 위에 영상 파일에서 읽은 길이를 '▶ 0:05'처럼 보인다", () => {
    complete()
    lengths.set(VIDEO_URL, 5.04)
    expect(chip()?.props.url).toBe(VIDEO_URL)
    expect(chipText(chip())).toBe('0:05')

    lengths.set(VIDEO_URL, 65.4)
    expect(chipText(chip())).toBe('1:05')
  })

  // 왜: 파일 머리를 못 읽으면(주소가 만료됨 · 형식을 모름) 틀린 길이를 짐작해 보이지 않는다(리드 c2 "못 읽으면 안 보임").
  it('영상 길이를 못 읽으면 길이 칩을 보이지 않는다', () => {
    complete()

    expect(chip()?.props.url).toBe(VIDEO_URL)
    expect(chipText(chip())).toBe('')
  })

  // 왜: 정상 경로 고정. 만드는 중이거나 아직 영상이 없는 노드에는 길이 칩이 없다.
  it('만드는 중이거나 아직 영상이 없는 노드에는 길이 칩이 없다', () => {
    lengths.set(VIDEO_URL, 5)
    expect(chip()).toBeUndefined()

    director.getState().updateNodeData<'video'>(videoId, { status: 'generating', lastAttemptStatus: 'generating', videoUrl: null, thumbnailUrl: null })
    expect(chip()).toBeUndefined()
  })
})
