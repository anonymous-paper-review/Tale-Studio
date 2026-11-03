// Director 에서 채팅을 접으면 오른쪽 접힌 레일 없이 툴바 Lumi 알약으로만 열고, 다른 단계는 지금처럼 접힌 레일이 남는지 검사한다 (v3 D1, 2026-11-03)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

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
vi.mock('zustand', async (original) => {
  const actual = await original<typeof import('zustand')>()
  const { createStore } = await import('zustand/vanilla')
  const create = (initializer?: StateCreator<unknown>) => {
    if (!initializer) return create
    const store = createStore(initializer)
    return Object.assign((selector?: (state: unknown) => unknown) =>
      selector ? selector(store.getState()) : store.getState(), store)
  }
  return { ...actual, create }
})
vi.mock('next/navigation', () => ({
  usePathname: () => hooks.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: null }) }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

import { GlobalChat } from '@/components/layout/global-chat'
import StudioLayout from '@/app/studio/layout'
import { CHAT_COLLAPSED_RAIL, CHAT_DEFAULT_WIDTH, SHELL_INSET } from '@/lib/constants'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function render(component: () => ReactNode, pathname: string) {
  hooks.pathname = pathname
  hooks.slots = []
  hooks.cursor = 0
  return elements(component())
}
/** 접힌 채팅을 여는 레일 단추(채팅 열기)가 있나. */
const railOpenButton = (pathname: string) =>
  render(() => GlobalChat(), pathname).some((node) => node.props['aria-label'] === '채팅 열기')
/** 본문(main)이 오른쪽에 비워 두는 폭. */
const mainMarginRight = (pathname: string) => {
  const main = render(() => StudioLayout({ children: null }), pathname).find((node) => node.type === 'main')
  return (main?.props.style as { marginRight?: number } | undefined)?.marginRight
}

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'chat-rail-project', currentStage: 'director' })
  useChatUiStore.setState({ collapsed: true, chatWidth: CHAT_DEFAULT_WIDTH, chatHolds: [], collapsedBeforeHold: null })
  useLocaleStore.setState({ locale: 'ko' })
})

describe('혼자 정한 것', () => {
  // 왜: D1 시안은 노드 캔버스가 오른쪽 끝까지 가고, 접힌 채팅을 여는 곳은 툴바 끝 Lumi 알약 하나다(리드 확인 2026-11-03) —
  //   레일까지 남으면 같은 일을 하는 단추가 둘이고 캔버스 오른쪽 44px 가 비어 보인다. 채팅을 열면 다른 단계처럼 채팅 폭만큼 비운다.
  it('Director 에서 채팅을 접으면 오른쪽 접힌 레일 없이 툴바 Lumi 알약으로만 연다', () => {
    expect(railOpenButton('/studio/director')).toBe(false)
    expect(mainMarginRight('/studio/director')).toBe(0)

    useChatUiStore.setState({ collapsed: false })
    expect(mainMarginRight('/studio/director')).toBe(SHELL_INSET + CHAT_DEFAULT_WIDTH)
  })

  // 왜: 접힌 레일은 v3 Chat Toggle(«) 그대로 다른 단계의 여는 곳이다 — Director 밖은 바뀌지 않는다.
  it('다른 단계에서 채팅을 접으면 지금처럼 오른쪽 접힌 레일로 연다', () => {
    for (const pathname of ['/studio/producer', '/studio/artist', '/studio/writer', '/studio/editor']) {
      expect(railOpenButton(pathname), pathname).toBe(true)
      expect(mainMarginRight(pathname), pathname).toBe(SHELL_INSET + CHAT_COLLAPSED_RAIL)
    }
  })
})
