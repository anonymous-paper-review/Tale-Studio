// Editor 채팅 창에서는 다른 단계의 대기 카드에 승인 · 나중에 · 취소 단추가 없고, 그 단계 화면에서 답하라고 보이는지 검사한다 (오너 2026-11-14 10번 · 검토 b 보통 3)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, pathname: '/studio/editor' }))

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
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { createPendingProposal } from '@/lib/pending-proposal'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : ''
}
function renderChat(pathname: string) {
  hooks.pathname = pathname
  hooks.slots = []
  hooks.cursor = 0
  return elements(GlobalChat())
}
const labels = (nodes: Element[]) => nodes.filter((node) => typeof node.props.onClick === 'function').map((node) => text(node))

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'p-dir', currentStage: 'editor' })
  useLocaleStore.setState({ locale: 'ko' })
  useChatUiStore.setState({ collapsed: false })
  useGlobalChatStore.setState({
    pendingProposal: createPendingProposal({
      traceId: 't1', stage: 'director', kind: 'directorTextEdit', target: 'Text changes', action: 'Apply the text Lumi suggested',
      impact: ['Shot 1 prompt · before: a', 'Shot 1 prompt · after: b'], payload: { projectId: 'p-dir', edits: [] },
    }),
  })
})

describe('Editor 에서 보이는 다른 단계의 대기 카드', () => {
  // 왜: 검토 b 보통 3 — 카드가 어느 단계에서든 단추와 함께 보여 Editor 에서도 작업물을 바꿀 수 있었다(오너 10번).
  it('Editor 에서는 다른 단계의 대기 카드에 적용 · 나중에 · 버리기 단추가 없고 "Director 화면에서 답할 수 있어요"라고 보인다', () => {
    const nodes = renderChat('/studio/editor')
    const buttons = labels(nodes)
    for (const word of ['적용', '나중에', '버리기']) expect(buttons).not.toContain(word)
    expect(nodes.some((node) => text(node) === 'Director 화면에서 답할 수 있어요.')).toBe(true)
  })

  // 왜: 정상 경로 고정 — 카드를 낸 단계에서는 단추가 그대로 있다.
  it('카드를 낸 단계에서는 적용 · 나중에 · 버리기 단추가 그대로 있다', () => {
    useProjectStore.setState({ currentStage: 'director' })
    const buttons = labels(renderChat('/studio/director'))
    for (const word of ['적용', '나중에', '버리기']) expect(buttons).toContain(word)
  })
})
