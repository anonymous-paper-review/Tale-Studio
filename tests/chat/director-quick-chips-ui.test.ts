// Director 채팅을 열면 입력칸 위에 빠른 칩 넷이 늘 보이고, 누르면 그 말을 바로 보내는지 검사한다 (11/13 시안 D5, 오너 2026-11-14 "추천대로")
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

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function renderChat(pathname: string) {
  hooks.pathname = pathname
  hooks.slots = []
  hooks.cursor = 0
  return elements(GlobalChat())
}
const chipBox = (nodes: Element[]) => nodes.find((node) => node.props['data-testid'] === 'director-quick-chips')
const chipButtons = (box: Element | undefined) => (box ? elements(box.props.children as ReactNode).filter((node) => node.type === 'button') : [])

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'chips-project', currentStage: 'director' })
  useLocaleStore.setState({ locale: 'ko' })
  useChatUiStore.setState({ collapsed: false })
})

describe('Director 빠른 칩 자리', () => {
  // 왜: 시안 D5 — Director 패널의 입력칸 위에 빠른 칩 넷이 늘 보인다. 다른 단계에는 없다.
  it('Director 채팅을 열면 입력칸 위에 빠른 칩 넷이 보이고, 다른 단계에는 없다', () => {
    const buttons = chipButtons(chipBox(renderChat('/studio/director')))
    expect(buttons.map((button) => button.props.children)).toEqual([
      '이미지 필요한 샷 모두 만들어 줘',
      '이미지 나온 샷 영상 만들어 줘',
      '실패한 샷 다시 만들어 줘',
      '지금 어디까지 됐어?',
    ])
    useProjectStore.setState({ currentStage: 'artist' })
    expect(chipBox(renderChat('/studio/artist'))).toBeUndefined()
  })

  // 왜: 칩을 누르면 입력칸에 넣기만 하지 않고 그 말을 바로 보낸다(오너 11/14 "누르면 바로 보냄").
  it('빠른 칩을 누르면 그 말을 바로 보낸다', () => {
    const send = vi.fn(async () => {})
    useGlobalChatStore.setState({ sendMessage: send } as never)
    const [first] = chipButtons(chipBox(renderChat('/studio/director')))
    ;(first.props.onClick as () => void)()
    expect(send).toHaveBeenCalledWith('이미지 필요한 샷 모두 만들어 줘', undefined, { stageOverride: 'director' })
  })
})
