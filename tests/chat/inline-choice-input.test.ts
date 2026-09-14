// 선택지의 직접 입력은 내용에 따라 계속하기 버튼을 갱신하고 버튼과 Enter로 한 번만 전송한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
  usePathname: () => '/studio/producer',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: null }) }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

import { GlobalChat } from '@/components/layout/global-chat'
import { Button } from '@/components/ui/button'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

type Element = ReactElement<Record<string, unknown>>
type InlineInput = {
  value: string
  onChange: (event: { target: { value: string } }) => void
  onKeyDown: (event: {
    key: string
    nativeEvent: { isComposing: boolean }
    preventDefault: () => void
  }) => void
}
type ContinueButton = { disabled: boolean; onClick: () => void }

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}

function renderChat() {
  // 선택지가 바뀌었을 때 렌더 중 초기화하는 상태까지 반영한다.
  hooks.cursor = 0
  GlobalChat()
  hooks.cursor = 0
  return elements(GlobalChat())
}

function controls() {
  const nodes = renderChat()
  const input = nodes.find(node => node.type === 'input' && node.props['aria-label'] === '직접 입력')
  const button = nodes.find(node => node.type === Button && node.props.className === 'w-full rounded-full')
  expect(input).toBeDefined()
  expect(button).toBeDefined()
  return { input: input!.props as InlineInput, button: button!.props as ContinueButton }
}

function showInlineAnswer() {
  hooks.slots = []
  useGlobalChatStore.getState().reset()
  useGlobalChatStore.setState({
    sendMessage: vi.fn(async () => { useGlobalChatStore.setState({ loading: true }) }),
    suggestion: {
      id: 'inline-answer', stage: 'producer', content: '',
      action: { kind: 'choices', options: [{ label: '한국어 대사로', utterance: '한국어 대사로' }] },
    },
  })
  const open = renderChat().find(node =>
    node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('직접 입력…'))
  expect(open).toBeDefined()
  ;(open!.props.onClick as () => void)()
}

function typeAnswer(value: string) {
  controls().input.onChange({ target: { value } })
  return controls()
}

function pressEnter(input: InlineInput, isComposing = false) {
  input.onKeyDown({ key: 'Enter', nativeEvent: { isComposing }, preventDefault: vi.fn() })
}

const originalSendMessage = useGlobalChatStore.getState().sendMessage

beforeEach(() => {
  useProjectStore.setState({ projectId: 'inline-choice-project', currentStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 1 })
  showInlineAnswer()
})

afterEach(() => {
  useGlobalChatStore.setState({ sendMessage: originalSendMessage })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('직접 입력에 공백 외 글자가 있으면 계속하기 버튼을 활성화한다', () => {
  expect(controls().button.disabled).toBe(true)
  expect(typeAnswer('   ').button.disabled).toBe(true)
  expect(typeAnswer('일본어 대사로 해주세요').button.disabled).toBe(false)
})

it('직접 입력을 비우면 계속하기 버튼을 비활성화한다', () => {
  expect(typeAnswer('일본어 대사로 해주세요').button.disabled).toBe(false)
  expect(typeAnswer('').button.disabled).toBe(true)
  expect(typeAnswer('  ').button.disabled).toBe(true)
})

it('직접 입력에서 버튼을 누르거나 Enter를 누르면 같은 내용을 한 번만 전송한다', () => {
  for (const firstAction of ['button', 'enter']) {
    showInlineAnswer()
    const { input, button } = typeAnswer('  일본어 대사로 해주세요  ')
    const send = useGlobalChatStore.getState().sendMessage
    if (firstAction === 'button') button.onClick()
    else pressEnter(input)
    expect(send).toHaveBeenCalledExactlyOnceWith('일본어 대사로 해주세요', undefined, { stageOverride: 'producer' })
    // 화면이 다시 그려지기 전에 다른 전송 동작이 연이어 들어와도 한 번만 보낸다.
    button.onClick()
    pressEnter(input)
    expect(send).toHaveBeenCalledTimes(1)
  }
})

it('전송 중이면 버튼과 Enter로 추가 전송하지 않는다', () => {
  typeAnswer('일본어 대사로 해주세요')
  useGlobalChatStore.setState({ loading: true })
  const { input, button } = controls()
  expect(button.disabled).toBe(true)
  button.onClick()
  pressEnter(input)
  expect(useGlobalChatStore.getState().sendMessage).not.toHaveBeenCalled()
})

it('한글을 조합 중이면 Enter로 전송하지 않는다', () => {
  const { input } = typeAnswer('한국어')
  const send = useGlobalChatStore.getState().sendMessage
  pressEnter(input, true)
  expect(send).not.toHaveBeenCalled()
  pressEnter(input)
  expect(send).toHaveBeenCalledExactlyOnceWith('한국어', undefined, { stageOverride: 'producer' })
})
