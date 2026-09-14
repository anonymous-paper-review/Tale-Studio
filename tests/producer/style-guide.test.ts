// 채팅이 스타일을 반영하거나 저장된 스타일을 불러올 때 추가 안내가 대화와 선택지를 가리지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand/vanilla'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
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

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useDebugValue: () => {},
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: unknown) => { hooks.slots[slot] = value }]
  },
  useRef: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
    const slot = hooks.cursor++
    const prev = hooks.slots[slot] as unknown[] | undefined
    if (!prev || !deps || deps.some((dep, i) => !Object.is(dep, prev[i]))) {
      hooks.slots[slot] = deps
      hooks.effects.push(effect)
    }
  },
}))

import MeetingPage from '@/app/studio/producer/page'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'

function renderPage() {
  hooks.cursor = 0
  MeetingPage()
  for (const effect of hooks.effects.splice(0)) {
    const cleanup = effect()
    if (cleanup) hooks.cleanups.push(cleanup)
  }
}

beforeEach(async () => {
  hooks.slots = []
  hooks.cursor = 0
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'p1', currentStage: 'producer', reachedStage: 'producer' })
  vi.spyOn(useProducerStore.getState(), 'loadProject').mockResolvedValue()
  useGlobalChatStore.setState({
    messagesLoadedProjectId: 'p1',
    messages: [{ id: 'u1', role: 'user', stage: 'producer', content: '일본 배경 학교의 일상물을 만들고 싶어' }],
  })
  renderPage()
  await Promise.resolve()
  renderPage()
})

afterEach(() => {
  hooks.cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})

it('채팅에서 정보를 묻는 중에는 별도의 진행 안내를 중복해서 띄우지 않는다', () => {
  useGlobalChatStore.setState({
    messages: [...useGlobalChatStore.getState().messages,
      { id: 'm1', role: 'model', stage: 'producer', content: '장르는 어느 쪽에 더 가까운가요?' }],
    loading: false,
  })
  useProducerStore.setState({ styleAnchorKey: 'real_jp_melo' })
  renderPage()
  expect(useGlobalChatStore.getState().suggestion).toBeNull()

  useGlobalChatStore.getState().offerSuggestion({
    id: 'choices:genre', stage: 'producer', content: '',
    action: { kind: 'choices', options: [
      { label: '일상', utterance: '일상' }, { label: '로맨스', utterance: '로맨스' },
    ] },
  })
  renderPage()
  expect(useGlobalChatStore.getState().suggestion?.id).toBe('choices:genre')
})

it('프로젝트의 저장된 스타일을 불러오면 스타일 확정 안내를 새로 띄우지 않는다', () => {
  useProducerStore.setState({ styleAnchorKey: 'saved_style' })
  renderPage()
  expect(useGlobalChatStore.getState().suggestion).toBeNull()
})
