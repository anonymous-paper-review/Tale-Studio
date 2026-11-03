// Director 에 들어오면 채팅이 닫혀 있고 Lumi 알약으로 열며, 떠나면 채팅이 들어오기 전 모습으로 돌아가는지 검사한다 (v3 D1, 2026-11-03)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

// 채팅 모습 기억(zustand persist)은 window.localStorage 에 쓴다 — 노드 시험 환경에는 window 가 없어 기억이 꺼지므로 이 파일에서만 이어 준다.
vi.hoisted(() => {
  const g = globalThis as { window?: unknown }
  g.window ??= globalThis
})
// 화면이 붙을 때 하는 일은 바로 돌리고, 화면을 떠날 때 할 일은 모아 둔다 — 시험이 "떠나기"를 직접 부른다.
const effects = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useDebugValue: () => {},
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect()
    if (typeof cleanup === 'function') effects.cleanups.push(cleanup)
  },
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

import { useChatUiStore } from '@/stores/chat-ui-store'
import { useHoldChatClosed } from '@/hooks/use-hold-chat-closed'
import { LumiChatPill } from '@/features/director/lumi-chat-pill'
import { useLocaleStore } from '@/stores/locale-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

/** 채팅을 닫아 두는 약속을 쓰는 단계 화면 하나. */
function StageScreen({ stage }: { stage: string }) {
  useHoldChatClosed(stage)
  return null
}
/** 단계 화면에 들어간다 — 그 화면이 떠날 때 할 일을 돌려준다. */
function enter(stage: string): () => void {
  const from = effects.cleanups.length
  StageScreen({ stage })
  const mine = effects.cleanups.splice(from)
  return () => mine.reverse().forEach((cleanup) => cleanup())
}
const chatClosed = () => useChatUiStore.getState().collapsed
/** 브라우저에 기억된 채팅 모습(새로고침하면 이 값으로 다시 시작한다). */
const remembered = () => JSON.parse(localStorage.getItem('tale-chat-ui') ?? '{}').state?.collapsed

beforeEach(() => {
  effects.cleanups = []
  localStorage.clear()
  useChatUiStore.setState({ collapsed: false, chatHolds: [], collapsedBeforeHold: null })
  useLocaleStore.setState({ locale: 'ko' })
})

describe('혼자 정한 것', () => {
  // 왜: D1 시안은 노드 캔버스를 넓게 쓰려고 채팅을 접어 둔 채로 보여 준다. 다른 단계에서 채팅을 열어 두었어도 Director 는 닫힌 채 시작한다.
  it('Director 화면에 들어오면 채팅이 닫혀 있다', () => {
    expect(read('src/app/studio/director/page.tsx')).toContain("useHoldChatClosed('director')")
    enter('director')
    expect(chatClosed()).toBe(true)
  })

  // 왜: 채팅이 닫혀 있을 때 여는 곳이 툴바 오른쪽 끝의 Lumi 알약이다(D1 "Lumi Chat 접힘").
  it('Director 에서 Lumi 알약을 누르면 채팅이 열린다', () => {
    expect(read('src/app/studio/director/page.tsx')).toContain('<LumiChatPill')
    enter('director')
    const pill = elements(LumiChatPill()).find((node) => node.type === 'button')
    expect(pill).toBeDefined()
    ;(pill!.props.onClick as () => void)()
    expect(chatClosed()).toBe(false)
  })

  // 왜: 채팅이 열려 있으면 패널 머리에 접기 단추가 있다 — 여는 알약이 같이 있으면 같은 일을 하는 단추가 둘이 된다.
  it('채팅이 열려 있으면 Lumi 알약이 보이지 않는다', () => {
    useChatUiStore.setState({ collapsed: false })
    expect(LumiChatPill()).toBeNull()
  })

  // 왜: 사용자가 연 · 닫은 채팅은 모든 단계가 함께 쓰는 기억 하나다. Director 가 잠깐 닫아 둔 것이 그 기억을 바꾸면,
  //   Writer 에서 열어 두고 Director 를 들렀다 온 사람의 채팅이 닫혀 있게 된다. Director 안에서 알약으로 열었다 떠나도 같다.
  it('Director 를 떠나면 채팅은 들어오기 전 모습으로 돌아간다', () => {
    for (const before of [false, true]) {
      useChatUiStore.setState({ collapsed: before, chatHolds: [], collapsedBeforeHold: null })
      const leave = enter('director')
      useChatUiStore.getState().setCollapsed(false)
      leave()
      expect(chatClosed()).toBe(before)
    }
  })

  // 왜: 닫아 둔 모습이 브라우저 기억에 들어가면 Director 에서 새로고침한 뒤 다른 단계로 가도 채팅이 닫힌 채 남는다(예전 Editor 가 그랬다).
  it('Director 에서 새로고침해도 다른 단계로 가면 사용자가 고른 채팅 모습이 남아 있다', () => {
    enter('director')
    expect(chatClosed()).toBe(true)
    expect(remembered()).toBe(false)
  })

  // 왜: Director 의 [다음: Editor로] 처럼 닫아 두는 두 화면을 곧장 오가도, 새 화면이 붙은 뒤 옛 화면이 떠나는 순서여도 Editor 는 닫힌 채여야 한다.
  it('Director 에서 Editor 로 바로 가도 Editor 에서 채팅이 닫혀 있고, Editor 를 떠나면 처음 모습으로 돌아간다', () => {
    const leaveDirector = enter('director')
    const leaveEditor = enter('editor')
    leaveDirector()
    expect(chatClosed()).toBe(true)
    leaveEditor()
    expect(chatClosed()).toBe(false)
  })

  // 왜: 채팅을 처음에 닫아 두는 것은 D1(Director) 과 예전부터 그랬던 Editor(요청 6b) 뿐이다. 다른 단계는 지금처럼 사용자가 고른 대로 열려 있다.
  it('Director · Editor 밖의 단계 화면은 채팅을 닫아 두지 않는다', () => {
    const studio = path.join(process.cwd(), 'src/app/studio')
    const holding = readdirSync(studio, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(studio, entry.name, 'page.tsx')))
      .filter((entry) => /useHoldChatClosed\(/.test(read(`src/app/studio/${entry.name}/page.tsx`)))
      .map((entry) => entry.name)
      .sort()
    expect(holding).toEqual(['director', 'editor'])
  })
})
