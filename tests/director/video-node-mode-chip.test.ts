// 영상 노드의 노란 "바꾼 설정" 칩은 만드는 방식을 사람이 읽는 이름으로 보이고, 기본 방식 · 이어서 출처 같은 안쪽 칸 이름은 보이지 않는다 (통합 확인 n-qa 고장 3 · 오너 N4a)
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
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))

import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { VideoNodeData, VideoOverride } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>
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

let videoId: string
/** 노란 "바꾼 설정" 칩 글 — 칩은 노드 아래 경고색 작은 글자다. */
function chips(override: VideoOverride): string[] {
  director.getState().updateNodeData<'video'>(videoId, { override })
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === videoId)!.data as VideoNodeData
  const impl = (VideoNode as unknown as { type: (props: Record<string, unknown>) => ReactNode }).type
  return elements(impl({ id: videoId, data, selected: false }))
    .filter((node) => node.type === 'span' && String(node.props.className ?? '').includes('bg-warning/10'))
    .map((node) => textOf(node))
}

const CONTINUE_FROM = { videoClipId: 'clip-prev', generationJobId: 'job-prev', frameUrl: 'https://media.test/videos/clip-prev/job-prev_chain-frame-2850.jpg' }

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  director.setState({ projectId: 'chip-project', nodes: [], edges: [], popupNodeId: null })
  const shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', provider: 'seedance' })
  videoId = director.getState().addVideoTake(shotId)!
  useLocaleStore.setState({ locale: 'en' })
})

describe('같이 정한 것 — 통합 확인 n-qa', () => {
  // 왜(n-qa 고장 3): 노드 칩에 안쪽 칸 이름 "videoMode" · "continueFrom"이 그대로 보였다 — 사람이 읽는 방식 이름으로 보이고,
  //   기본(시작+프롬프트)은 바꾼 것이 아니라 칩이 없으며, 이어서 출처는 "이어서" 칩이 이미 말하므로 따로 보이지 않는다.
  it('방식을 바꾼 Take 는 노드 칩에 방식 이름(이어서 · 레퍼런스 · 시작+미들)을 보이고, 기본 방식과 이어서 출처는 칩으로 보이지 않는다', () => {
    expect(chips({ videoMode: 'continue', continueFrom: CONTINUE_FROM })).toEqual(['Continuation'])
    expect(chips({ videoMode: 'reference' })).toEqual(['Reference'])
    expect(chips({ videoMode: 'start_middle' })).toEqual(['Start + middle'])
    expect(chips({ videoMode: 'start_prompt' })).toEqual([])
    expect(chips({ videoMode: 'start_end' as never })).toEqual([])
    useLocaleStore.setState({ locale: 'ko' })
    expect(chips({ videoMode: 'continue', continueFrom: CONTINUE_FROM })).toEqual(['이어서'])
    expect(chips({ videoMode: 'start_middle' })).toEqual(['시작+미들'])
  })

  // 왜: 방식 말고 바꾼 설정 칩은 지금 그대로다(이번 고침의 범위는 방식 칩뿐).
  it('방식 칩을 고쳐도 다른 바꾼 설정 칩은 지금 그대로 보인다', () => {
    expect(chips({ provider: 'veo', videoMode: 'reference' })).toEqual(['provider', 'Reference'])
  })
})
