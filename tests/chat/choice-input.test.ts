// 선택지가 떠 있거나 새로고침으로 복원되어도 채팅 입력과 명시적 전송으로 답할 수 있다.
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
vi.mock('next/navigation', () => ({
  usePathname: () => '/studio/producer',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: null }) }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

import { GlobalChat } from '@/components/layout/global-chat'
import { MentionTextarea } from '@/components/layout/mention-textarea'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { createPendingProposal } from '@/lib/pending-proposal'

const originalSendMessage = useGlobalChatStore.getState().sendMessage
type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function renderChat() {
  hooks.cursor = 0
  const tree = GlobalChat()
  // GlobalChat resets the selected row during rendering when the choice set changes.
  hooks.cursor = 0
  hooks.effects = []
  return elements(tree && GlobalChat())
}
function input(nodes: Element[]) {
  const field = nodes.find(node => node.type === MentionTextarea)
  expect(field).toBeDefined()
  return field!.props as {
    disabled: boolean
    value: string
    onChange: (text: string) => void
    onSubmit: () => Promise<void>
  }
}

const labels = ['한국어 대사로', '영어 대사로', '대사 없이 영상만']
function showChoices(restored = false) {
  useGlobalChatStore.setState({ suggestion: {
    id: 'dialogue-choices', stage: 'producer', content: '',
    action: restored ? null : { kind: 'choices', options: labels.map(label => ({ label, utterance: label })) },
    ...(restored ? { restoredChoices: { options: labels } } : {}),
  } })
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  useGlobalChatStore.getState().reset()
  useGlobalChatStore.setState({ sendMessage: originalSendMessage })
  useProjectStore.setState({ projectId: 'choice-input-project', currentStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 1 })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('선택지가 떠 있으면 일반 채팅창에서도 직접 답할 수 있다', async () => {
  const send = vi.spyOn(useGlobalChatStore.getState(), 'sendMessage').mockResolvedValue()
  showChoices()
  expect(input(renderChat()).disabled).toBe(false)
  input(renderChat()).onChange('일본어 대사로 해주세요')
  await input(renderChat()).onSubmit()
  expect(send).toHaveBeenCalledWith('일본어 대사로 해주세요', expect.any(Object), { stageOverride: 'producer' })
})

it('복원된 선택지를 누르면 답변을 입력창에 넣고 전송은 사용자가 한다', async () => {
  const send = vi.spyOn(useGlobalChatStore.getState(), 'sendMessage').mockResolvedValue()
  showChoices(true)
  const choice = renderChat().find(node => node.type === 'button' && node.props.children === labels[0])
  expect(choice).toBeDefined()
  ;(choice!.props.onClick as () => void)()
  expect(input(renderChat()).value).toBe(labels[0])
  expect(send).not.toHaveBeenCalled()
  await input(renderChat()).onSubmit()
  expect(send).toHaveBeenCalledWith(labels[0], expect.any(Object), { stageOverride: 'producer' })
})

it('응답을 기다리는 중이면 글은 입력할 수 있고 중복 전송은 하지 않는다', async () => {
  const send = vi.spyOn(useGlobalChatStore.getState(), 'sendMessage').mockResolvedValue()
  showChoices()
  useGlobalChatStore.setState({ loading: true })
  expect(input(renderChat()).disabled).toBe(false)
  input(renderChat()).onChange('추가로 말할 내용')
  await input(renderChat()).onSubmit()
  expect(input(renderChat()).value).toBe('추가로 말할 내용')
  expect(send).not.toHaveBeenCalled()
})

it('복원된 선택지에서 Enter를 누르면 다른 제안을 승인하지 않고 답변만 입력한다', () => {
  // Mount the real effects so global capture listeners participate in this regression.
  useProjectStore.setState({ projectId: null })
  showChoices(true)
  useGlobalChatStore.setState({ pendingProposal: createPendingProposal({
    id: 'waiting-approval', stage: 'writer', kind: 'writerShrinkDialogue',
    target: '대사', action: '대사 줄이기', impact: [], payload: {},
  }) })
  const approve = vi.spyOn(useGlobalChatStore.getState(), 'approvePendingProposal').mockResolvedValue(true)
  const send = vi.spyOn(useGlobalChatStore.getState(), 'sendMessage').mockResolvedValue()
  const listeners: Array<(event: KeyboardEvent) => void> = []
  vi.stubGlobal('window', {
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => {
      if (name === 'keydown') listeners.push(listener)
    },
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal('document', { querySelector: () => null })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const nodes = renderChat()
  const cleanups = hooks.effects.map(effect => effect())
  try {
    const event = {
      key: 'Enter', target: { tagName: 'BUTTON', closest: () => ({}) },
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
    }
    for (const listener of listeners) listener(event as unknown as KeyboardEvent)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(approve).not.toHaveBeenCalled()
    const choice = nodes.find(node => node.type === 'button' && node.props.children === labels[0])!
    ;(choice.props.onClick as () => void)()
    expect(input(renderChat()).value).toBe(labels[0])
    expect(send).not.toHaveBeenCalled()

    // The existing approval shortcut still works when focus is outside the choices.
    const outside = { ...event, target: { tagName: 'BODY', closest: () => null } }
    for (const listener of listeners) listener(outside as unknown as KeyboardEvent)
    expect(approve).toHaveBeenCalledExactlyOnceWith('waiting-approval')
  } finally {
    for (const cleanup of cleanups) cleanup?.()
  }
})
