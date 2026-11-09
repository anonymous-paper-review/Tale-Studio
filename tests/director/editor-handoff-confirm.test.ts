// Director 채팅이 Editor로 넘길지 물을 때 시안의 단계 확인 단추(「좋아요, 편집하기로」 · 「아니요, 더 고칠래요」)로 묻는다 (오너 2026-11-09 결정 1, 추천대로)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const route = vi.hoisted(() => ({ path: '/studio/director' }))
vi.mock('next/navigation', () => ({
  usePathname: () => route.path,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: null }) }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

import { GlobalChat } from '@/components/layout/global-chat'
import { StageConfirm } from '@/components/controls/stage-confirm'
import { Button } from '@/components/ui/button'
import { useGlobalChatStore, type ChatSuggestion } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { StageId } from '@/types'

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
function renderChat(): Element[] {
  hooks.cursor = 0
  GlobalChat()
  hooks.cursor = 0
  return elements(GlobalChat())
}
const buttonTexts = (nodes: Element[]) => nodes.filter((node) => node.type === Button).map(textOf)
/** 키 안내 글 — 채팅의 KeyHint(안에서 만든 컴포넌트)는 펼쳐 읽고, 바로 그린 안내 줄은 그대로 읽는다. */
function hintTexts(nodes: Element[]): string[] {
  return nodes.flatMap((node) => {
    if (typeof node.type === 'function' && node.type.name === 'KeyHint') {
      return [textOf((node.type as (props: Record<string, unknown>) => ReactNode)(node.props))]
    }
    return node.type === 'span' && textOf(node).startsWith('Enter') ? [textOf(node)] : []
  })
}

const PROJECT = 'handoff-confirm-project'
const sendMessage = vi.fn(async () => {})
function ask(stage: StageId, label: string, utterance: string) {
  useProjectStore.setState({ projectId: PROJECT, currentStage: stage })
  useGlobalChatStore.setState({
    sendMessage,
    suggestion: { id: `handoff:${stage}:${PROJECT}`, stage, content: '넘어갈까요?', action: { kind: 'handoff', utterance, label } } as ChatSuggestion,
  })
}
function confirmButtons(): { confirm: Element | undefined; nodes: Element[] } {
  const nodes = renderChat()
  return { confirm: nodes.find((node) => node.type === StageConfirm), nodes }
}

const originalSendMessage = useGlobalChatStore.getState().sendMessage
beforeEach(() => {
  hooks.slots = []
  sendMessage.mockClear()
  useGlobalChatStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  route.path = '/studio/director'
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 1 })
  ask('director', 'Editor로 넘기기', 'Editor로 넘겨주세요')
})
afterEach(() => {
  useGlobalChatStore.setState({ sendMessage: originalSendMessage })
  vi.unstubAllGlobals()
})

describe('같이 정한 것', () => {
  // 왜: 오너 2026-11-09 결정 1(추천 ㉢): 채팅에서 다음 단계로 넘길지 묻는 자리는 시안의 단계 확인 단추로 묻는다. Director 는 Editor 로 넘길 때다.
  it('Director 채팅이 Editor로 넘길지 물으면 「좋아요, 편집하기로」 · 「아니요, 더 고칠래요」 단추로 묻는다', () => {
    const { confirm, nodes } = confirmButtons()

    expect(confirm?.props).toMatchObject({ stage: 'director', tone: 'chat' })
    hooks.cursor = 0
    expect(elements((confirm!.type as (props: Record<string, unknown>) => ReactNode)(confirm!.props)).filter((node) => node.type === 'button').map(textOf))
      .toEqual(['좋아요, 편집하기로', '아니요, 더 고칠래요'])
    expect(buttonTexts(nodes)).not.toContain('Editor로 넘기기')
    expect(buttonTexts(nodes)).not.toContain('나중에')
  })

  // 왜: 단추 모양만 바뀐다. 누르면 예전 [Editor로 넘기기]처럼 넘김 문장을 채팅에 보내 넘어간다(확인 창 없이, 오너 2026-10-01).
  it('「좋아요, 편집하기로」를 누르면 지금처럼 넘김 문장을 채팅에 보내 Editor로 넘어간다', async () => {
    const { confirm } = confirmButtons()

    await (confirm!.props.onConfirm as () => Promise<void> | void)()

    expect(sendMessage).toHaveBeenCalledWith('Editor로 넘겨주세요', undefined, expect.objectContaining({ consentedHandoff: true }))
  })

  // 왜: "아니요, 더 고칠래요"는 예전 [나중에]와 같은 뜻이다. 질문을 접어 두고, 채팅에 말을 보내지 않는다.
  it('「아니요, 더 고칠래요」를 누르면 질문을 접어 둔다(예전 [나중에]와 같다)', () => {
    const { confirm } = confirmButtons()

    ;(confirm!.props.onRevise as () => void)()

    const state = useGlobalChatStore.getState()
    expect(state.suggestion).toBeNull()
    expect(state.deferredSuggestions.map((item) => item.id)).toContain(`handoff:director:${PROJECT}`)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  // 왜: 정상 경로 고정. 이 갈래는 Director 질문만 바꾼다. 다른 단계의 넘기기 질문(여기서는 Artist → Storyboard)은 지금 단추 그대로다.
  it('다른 단계의 넘기기 질문은 지금 단추 그대로다 (Artist → Storyboard)', () => {
    route.path = '/studio/artist'
    ask('artist', 'Storyboard로 넘기기', 'Storyboard로 넘겨주세요')

    const { confirm, nodes } = confirmButtons()

    expect(confirm).toBeUndefined()
    expect(buttonTexts(nodes)).toEqual(expect.arrayContaining(['Storyboard로 넘기기', '나중에']))
  })

  // 왜: 단추가 「좋아요, 편집하기로」 · 「아니요, 더 고칠래요」로 바뀌었는데 키 안내는 "Enter 수락 · Esc 나중에"로 남아 말이 어긋났다(리드 2026-11-09).
  it('Director 넘기기 질문의 키 안내는 새 단추와 같은 말이다 (Enter 편집하기로 · Esc 더 고칠래요)', () => {
    const hints = hintTexts(renderChat())

    expect(hints).toContain('Enter 편집하기로 · Esc 더 고칠래요')
    expect(hints.some((hint) => hint.includes('수락') || hint.includes('나중에'))).toBe(false)
  })

  // 왜: 정상 경로 고정. 다른 단계의 넘기기 질문은 단추도 키 안내도 지금 그대로다.
  it('다른 단계의 넘기기 질문 키 안내는 지금 그대로다 (Enter 수락 · Esc 나중에)', () => {
    route.path = '/studio/artist'
    ask('artist', 'Storyboard로 넘기기', 'Storyboard로 넘겨주세요')

    const hints = hintTexts(renderChat())

    expect(hints).toContain('Enter 수락 · Esc 나중에')
  })
})
