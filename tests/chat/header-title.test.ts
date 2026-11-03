// 채팅 머리가 지금 단계에 맞춰 "Lumi와 산문 이야기"처럼 그 단계에서 하는 일과 그 단계 옷을 입은 Lumi를 보이는지 검사한다 (2026-11-03 v3 디자인)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, pathname: '/studio/producer' }))

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
import { LumiAvatar } from '@/components/lumi/lumi'
import { STAGE_CHAT_TITLE } from '@/lib/constants'
import { translate } from '@/lib/i18n/translate'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { StageId } from '@/types'

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

// [주소, 단계 id, 한국어 제목, 영어 제목, Lumi 옷]
const CASES: Array<[string, StageId, string, string, string]> = [
  ['/studio/start', 'entry', 'Lumi와 기획 이야기', 'Planning with Lumi', 'producer'],
  ['/studio/producer', 'producer', 'Lumi와 산문 이야기', 'Prose with Lumi', 'writer'],
  ['/studio/artist', 'artist', 'Lumi와 그림 이야기', 'Art with Lumi', 'artist'],
  ['/studio/writer', 'writer', 'Lumi와 연출 이야기', 'Directing with Lumi', 'storyboard'],
  ['/studio/director', 'director', 'Lumi와 촬영 이야기', 'Shooting with Lumi', 'director'],
  ['/studio/editor', 'editor', 'Lumi와 편집 이야기', 'Editing with Lumi', 'editor'],
]

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'header-title-project', currentStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
})

describe('채팅 머리', () => {
  it('채팅 머리 제목은 지금 단계에서 하는 일로 "Lumi와 산문 이야기"처럼 적는다', () => {
    // 왜: v3 시안 — 채팅은 단계마다 "Lumi와 산문 · 그림 · 연출 · 편집 이야기"로 바뀐다. Producer · Director 는 시안에 없어 기획 · 촬영으로 정했다.
    for (const [, stage, ko, en] of CASES) {
      expect(translate('ko', STAGE_CHAT_TITLE[stage])).toBe(ko)
      expect(translate('en', STAGE_CHAT_TITLE[stage])).toBe(en)
    }
  })

  it('채팅 머리에는 지금 단계 옷을 입은 Lumi 그림과 그 단계 제목이 보인다', () => {
    // 왜: 채팅은 모든 단계가 이어지는 하나의 대화라, 머리의 제목과 Lumi 옷이 지금 어느 단계 이야기인지 알려 준다.
    for (const [pathname, , ko, , persona] of CASES) {
      const nodes = renderChat(pathname)
      expect(nodes.some((node) => node.props.children === ko), pathname).toBe(true)
      const lumi = nodes.find((node) => node.type === LumiAvatar)
      expect(lumi?.props.persona, pathname).toBe(persona)
    }
  })

  it('답을 기다리는 동안 채팅 머리의 Lumi는 생각하는 모습이다', () => {
    // 왜: 가이드의 채팅 흐름 — 보낸 뒤 응답을 기다릴 때 thinking. 정지 그림이라도 지금 일하고 있다는 걸 보인다.
    useGlobalChatStore.setState({ loading: true })
    const lumi = renderChat('/studio/artist').find((node) => node.type === LumiAvatar)
    expect(lumi?.props.state).toBe('thinking')
  })
})
