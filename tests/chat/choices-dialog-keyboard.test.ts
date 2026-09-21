// 확인창이 열려 있으면 Enter와 Escape는 뒤의 채팅 선택지를 제출하거나 닫지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useDebugValue: () => {},
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: unknown) => {
      hooks.slots[slot] = typeof value === 'function' ? value(hooks.slots[slot]) : value
    }]
  },
  useRef: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect) },
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
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/producer', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: null }) }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

import { GlobalChat } from '@/components/layout/global-chat'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function renderChat() {
  hooks.cursor = 0
  hooks.effects = []
  return elements(GlobalChat())
}

const sendMessage = vi.fn()
const dismissSuggestion = vi.fn()
const querySelector = vi.fn()
const handlers = new Set<(event: KeyboardEvent) => void>()
const cleanups: Array<() => void> = []

function mountSelectedChoice() {
  const choice = renderChat().find(node => node.type === 'button' && node.props['aria-pressed'] === false)!
  expect(choice).toBeDefined()
  ;(choice.props.onClick as () => void)()
  renderChat()
  for (const effect of hooks.effects) {
    const cleanup = effect()
    if (cleanup) cleanups.push(cleanup)
  }
}

function press(key: string) {
  const event = {
    key, target: { tagName: 'BUTTON', isContentEditable: false },
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
  }
  for (const handler of handlers) handler(event as unknown as KeyboardEvent)
  return event
}

beforeEach(() => {
  hooks.slots = []; hooks.effects = []; hooks.cursor = 0
  handlers.clear(); cleanups.length = 0
  sendMessage.mockReset(); dismissSuggestion.mockReset(); querySelector.mockReset()
  useGlobalChatStore.getState().reset()
  useGlobalChatStore.setState({
    sendMessage, dismissSuggestion,
    suggestion: {
      id: 'choice-under-dialog', stage: 'producer', content: 'Pick a direction',
      action: { kind: 'choices', options: [{ label: 'A rainy night', utterance: 'Make a rainy night scene' }] },
    },
  })
  useProjectStore.setState({ projectId: null, currentStage: 'producer' })
  vi.stubGlobal('window', {
    addEventListener: (name: string, handler: (event: KeyboardEvent) => void) => { if (name === 'keydown') handlers.add(handler) },
    removeEventListener: (_name: string, handler: (event: KeyboardEvent) => void) => { handlers.delete(handler) },
  })
  vi.stubGlobal('document', { querySelector })
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  vi.unstubAllGlobals()
})

// 왜: 동의창 버튼에서 키를 누르는 동안 뒤의 선택지 전송이나 닫기가 실행되면 안 된다.
it.each(['Enter', 'Escape'])('확인창이 열려 있으면 %s를 눌러도 뒤의 채팅 선택지를 제출하거나 닫지 않는다', (key) => {
  mountSelectedChoice()
  querySelector.mockReturnValue({ role: 'dialog', 'data-state': 'open' })
  const event = press(key)
  expect(sendMessage).not.toHaveBeenCalled()
  expect(dismissSuggestion).not.toHaveBeenCalled()
  expect(event.preventDefault).not.toHaveBeenCalled()
  expect(event.stopPropagation).not.toHaveBeenCalled()
})

// 왜: 정상 경로 고정 — 확인창이 없을 때의 선택지 키보드 제출은 유지한다.
it('확인창이 없으면 Enter로 고른 채팅 선택지를 제출한다', () => {
  mountSelectedChoice()
  querySelector.mockReturnValue(null)
  press('Enter')
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith('Make a rainy night scene', undefined, { stageOverride: 'producer' })
  expect(dismissSuggestion).toHaveBeenCalledOnce()
})
