// Director 에서 채팅을 접어 두었을 때 Lumi 알림 카드가 오른쪽 아래에 보이고, 단추가 다음 단계 · 다시 만들기 · 닫기를 하는지 검사한다 (11/13 시안 D8, 오너 2026-11-14 "추천대로")
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'
import type { DirectorNode } from '@/types/director'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, pathname: '/studio/director' }))

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useDebugValue: () => {},
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    return [hooks.slots[slot], (value: unknown) => {
      hooks.slots[slot] = typeof value === 'function' ? value(hooks.slots[slot]) : value
    }]
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
vi.mock('next/navigation', () => ({
  usePathname: () => hooks.pathname,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: null }) }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

import { GlobalChat } from '@/components/layout/global-chat'
import { LumiBatchNotice } from '@/features/director/lumi-batch-notice'
import { useLumiNoticeStore } from '@/stores/lumi-notice-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStore } from '@/stores/writer-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function render(component: () => ReactNode) {
  hooks.slots = []
  hooks.cursor = 0
  return elements(component())
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : ''
}
/** 누를 수 있는 것(onClick) 가운데 글자나 화면 읽기 이름이 맞는 것. */
const button = (nodes: Element[], label: string) =>
  nodes.find((node) => typeof node.props.onClick === 'function' && (node.props['aria-label'] === label || text(node).includes(label)))

function shot(id: string): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, storyboardImage: { status: 'completed', url: `https://media.test/${id}.png`, jobId: null } } } as unknown as DirectorNode
}
function take(id: string, parent: string, status: 'completed' | 'failed'): DirectorNode {
  return { id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: parent, status, lastAttemptStatus: status, videoUrl: status === 'completed' ? `https://media.test/${id}.mp4` : null, takeNumber: 1 } } as unknown as DirectorNode
}

const requestNextStep = vi.fn(async () => {})
const startDirectorVideos = vi.fn(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  hooks.pathname = '/studio/director'
  useGlobalChatStore.getState().reset()
  useGlobalChatStore.setState({ requestNextStep, startDirectorVideos } as never)
  useProjectStore.setState({ projectId: 'p-dir', currentStage: 'director' })
  useLocaleStore.setState({ locale: 'ko' })
  useChatUiStore.setState({ collapsed: true })
  useWriterStore.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ['s1', 's2', 's3', 's4'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
  useDirectorCanvasStore.setState({ projectId: 'p-dir', nodes: [shot('s1'), take('v1', 's1', 'completed'), shot('s4'), take('v4', 's4', 'failed')] })
  useLumiNoticeStore.setState({ notice: { projectId: 'p-dir', kind: 'video', done: 1, failed: 1 } })
})

describe('Lumi 알림 카드 화면(시안 D8)', () => {
  // 왜: 시안 D8 — 카드는 채팅을 접어 둔 Director 의 오른쪽 아래 자리다. 채팅을 열면 카드 대신 채팅 줄이 보인다.
  it('GlobalChat 은 Director 에서 채팅을 접어 두었을 때만 알림 카드 자리를 둔다', () => {
    expect(render(GlobalChat).some((node) => node.type === LumiBatchNotice)).toBe(true)
    useChatUiStore.setState({ collapsed: false })
    expect(render(GlobalChat).some((node) => node.type === LumiBatchNotice)).toBe(false)
  })

  // 왜: 시안 D8 단추 그대로 — [빼고 Editor로]는 다음 단계 단추와 같은 길(영상 없는 샷이 있으면 넘기기 창), [샷 N 다시 만들기]는 그 샷 영상만.
  it('카드의 [빼고 Editor로]는 다음 단계 단추와 같은 길을 열고, [샷 N 다시 만들기]는 그 샷 영상을 만들며, 누르면 카드는 닫힌다', () => {
    const card = render(LumiBatchNotice)
    expect(card.find((node) => node.props['data-testid'] === 'lumi-batch-notice')).toBeDefined()
    ;(button(card, '빼고 Editor로')!.props.onClick as () => void)()
    expect(requestNextStep).toHaveBeenCalledTimes(1)
    expect(useLumiNoticeStore.getState().notice).toBeNull()

    useLumiNoticeStore.setState({ notice: { projectId: 'p-dir', kind: 'video', done: 1, failed: 1 } })
    ;(button(render(LumiBatchNotice), '샷 4 다시 만들기')!.props.onClick as () => void)()
    expect(startDirectorVideos).toHaveBeenCalledWith(['s4'], '샷 4 다시 만들기')
    expect(useLumiNoticeStore.getState().notice).toBeNull()
  })

  // 왜(혼자 정한 것 B): 저절로 닫히지 않으니 닫는 길이 있어야 한다.
  it('카드는 ✕ 로 닫는다', () => {
    ;(button(render(LumiBatchNotice), '닫기')!.props.onClick as () => void)()
    expect(useLumiNoticeStore.getState().notice).toBeNull()
    expect(render(LumiBatchNotice)).toEqual([])
  })
})
