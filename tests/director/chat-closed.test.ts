// Director 에 들어오면 채팅이 닫혀 있고 접힌 레일 없이 Lumi 알약으로 열며, 떠나면 채팅이 들어오기 전 모습으로 돌아가고, 닫힌 동안의 멘션 · Lumi 의 새 말을 놓치지 않는지 검사한다 (v3 D1, 2026-11-03)
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
//   채팅 패널 · 스튜디오 틀을 그려 보는 시험은 붙을 때 하는 일(브라우저가 있어야 도는 일)을 끄고 그 모습만 본다(run=false).
const effects = vi.hoisted(() => ({ cleanups: [] as Array<() => void>, run: true }))
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
  useEffect: (effect: () => void | (() => void)) => {
    if (!effects.run) return
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
vi.mock('next/navigation', () => ({
  usePathname: () => hooks.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: null }) }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

import { useChatUiStore } from '@/stores/chat-ui-store'
import { useHoldChatClosed } from '@/hooks/use-hold-chat-closed'
import { LumiChatPill } from '@/features/director/lumi-chat-pill'
import { GlobalChat } from '@/components/layout/global-chat'
import StudioLayout from '@/app/studio/layout'
import { CHAT_COLLAPSED_RAIL, CHAT_DEFAULT_WIDTH, SHELL_INSET } from '@/lib/constants'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
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

/** 그 주소의 화면을 한 번 그려 요소 목록을 돌려준다(붙을 때 하는 일은 돌리지 않는다). */
function draw(component: () => ReactNode, pathname: string): Element[] {
  hooks.pathname = pathname
  hooks.slots = []
  hooks.cursor = 0
  effects.run = false
  try {
    return elements(component())
  } finally {
    effects.run = true
  }
}
/** 접힌 채팅을 여는 레일 단추(채팅 열기)가 있나. */
const railOpenButton = (pathname: string) =>
  draw(() => GlobalChat(), pathname).some((node) => node.props['aria-label'] === '채팅 열기')
/** 단계 화면(main)이 오른쪽에 비워 두는 폭. */
const mainMarginRight = (pathname: string) => {
  const main = draw(() => StudioLayout({ children: null }), pathname).find((node) => node.type === 'main')
  return (main?.props.style as { marginRight?: number } | undefined)?.marginRight
}

beforeEach(() => {
  effects.cleanups = []
  effects.run = true
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'chat-closed-project', currentStage: 'director' })
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

  // 왜: D1 시안은 접힌 채팅 레일 없이 캔버스가 오른쪽 끝까지 가고, 닫힌 채팅을 여는 곳은 툴바 끝 Lumi 알약 하나다(리드 확인 2026-11-03).
  //   레일까지 남으면 같은 일을 하는 단추가 둘이고 캔버스 오른쪽 44px 가 비어 보인다. 채팅을 열면 다른 단계처럼 채팅 폭만큼 비운다.
  it('Director 에서 채팅이 닫혀 있으면 오른쪽 접힌 레일이 없고 단계 화면이 오른쪽 끝까지 간다', () => {
    useChatUiStore.setState({ collapsed: true, chatWidth: CHAT_DEFAULT_WIDTH })
    expect(railOpenButton('/studio/director')).toBe(false)
    expect(mainMarginRight('/studio/director')).toBe(SHELL_INSET)

    useChatUiStore.setState({ collapsed: false })
    expect(mainMarginRight('/studio/director')).toBe(SHELL_INSET + CHAT_DEFAULT_WIDTH)
  })

  // 왜: 검토 B B1 — Director 는 채팅을 닫아 둔 채 시작한다. 샷을 Cmd/Ctrl+클릭으로 멘션하면 멘션이 닫힌 채팅 입력칸에 소리 없이 들어가고
  //   커서도 보이지 않는 입력칸으로 갔다 — Enter 를 치면 보이지 않는 글이 보내질 수 있었다.
  it('Director 에서 샷을 멘션하면 닫혀 있던 채팅이 열리고 입력칸에 멘션이 보인다', () => {
    enter('director')
    expect(chatClosed()).toBe(true)

    useChatUiStore.getState().requestMentionToggle('Scene 1 · Shot 2')

    expect(chatClosed()).toBe(false)
    expect(useChatUiStore.getState().mentionInsert).toMatchObject({ label: 'Scene 1 · Shot 2', mode: 'toggle' })
    // 스토리보드 격자의 Cmd/Ctrl+클릭은 이 멘션 요청을 쓰고, 채팅은 그 요청을 입력칸에 "@이름"으로 넣는다.
    expect(read('src/features/director/canvas-views/StoryboardGridView.tsx')).toMatch(/requestMentionToggle\(label\)/)
    expect(read('src/components/layout/global-chat.tsx')).toMatch(/const token = `@\$\{mentionInsert\.label\}`/)
  })

  // 왜: 검토 B B1 — 다른 단계에서 채팅 입력칸에 커서를 둔 채 Director 로 오면 채팅은 닫히는데 커서는 숨은 입력칸에 남아, 치는 글이 보이지 않는 곳에 들어갔다.
  it('Director 에 들어와 채팅을 닫아 둘 때 입력칸에 있던 커서는 빠진다', () => {
    const blur = vi.fn()
    vi.stubGlobal('document', { activeElement: { closest: (selector: string) => (selector === '[data-chat-panel]' ? {} : null), blur } })
    try {
      enter('director')
      expect(blur).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
    // 채팅 밖(캔버스 등)에 있던 커서는 그대로 둔다.
    const canvasBlur = vi.fn()
    vi.stubGlobal('document', { activeElement: { closest: () => null, blur: canvasBlur } })
    try {
      enter('editor')
      expect(canvasBlur).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // 왜: 검토 C — 닫힌 채팅은 화면 밖으로 밀려 있을 뿐이라 Tab 으로 보이지 않는 입력칸에 들어가 글을 보낼 수 있었다(Director 는 늘 닫힌 채 시작해 더 쉽게 걸렸다).
  //   잠금 화면이 [data-chat-panel] 요소 자체에 막기를 세며 걸고 풀므로, 닫힘은 그 안쪽 묶음에 건다.
  it('채팅이 닫혀 있으면 Tab 으로 채팅 입력칸에 들어가지 못한다', () => {
    useChatUiStore.setState({ collapsed: true })
    const closed = draw(() => GlobalChat(), '/studio/director')
    const locked = closed.find((node) => node.props.inert === true)
    expect(locked).toBeDefined()
    expect(elements(locked!.props.children as ReactNode).some((node) => 'onSubmit' in node.props && 'value' in node.props)).toBe(true)
    expect(closed.find((node) => 'data-chat-panel' in node.props)?.props.inert).toBeUndefined()

    useChatUiStore.setState({ collapsed: false })
    expect(draw(() => GlobalChat(), '/studio/director').some((node) => node.props.inert === true)).toBe(false)
  })

  // 왜: 접힌 레일(v3 Chat Toggle «)은 다른 단계에서 닫힌 채팅을 여는 곳이다 — Director 밖은 바뀌지 않는다.
  it('Director 밖의 단계에서는 채팅을 접으면 지금처럼 접힌 레일이 남는다', () => {
    useChatUiStore.setState({ collapsed: true, chatWidth: CHAT_DEFAULT_WIDTH })
    for (const pathname of ['/studio/producer', '/studio/artist', '/studio/writer', '/studio/editor']) {
      expect(railOpenButton(pathname), pathname).toBe(true)
      expect(mainMarginRight(pathname), pathname).toBe(SHELL_INSET + CHAT_COLLAPSED_RAIL)
    }
  })
})

/** Lumi 알약을 한 번 그린다 — 붙어 있는 동안 하는 일(본 말 기억하기)까지 돈다. */
const pillMounted = () => LumiChatPill()
/** 알약의 지금 모습(붙을 때 하는 일은 돌리지 않는다). */
const pill = () => draw(() => LumiChatPill(), '/studio/director')
const lumiSays = (...ids: string[]) =>
  useGlobalChatStore.setState((state) => ({ messages: [...state.messages, ...ids.map((id) => ({ id, stage: 'director' as const, role: 'model' as const, content: id }))] }))
const unseenBadge = () => pill().find((node) => node.props['data-testid'] === 'lumi-pill-unseen')

describe('혼자 정한 것 · 닫힌 채팅의 Lumi 알약(검토 B B2, 시안 D1 알약의 파란 숫자)', () => {
  beforeEach(() => {
    // 앞 시험에서 본 것으로 친 말이 남지 않게 — 화면마다 처음 들어온 사람처럼 시작한다.
    useChatUiStore.setState({ closedSeen: null })
    useGlobalChatStore.setState({
      messages: [{ id: 'old-1', stage: 'director', role: 'model', content: '예전에 한 말' }],
      messagesLoadedProjectId: 'chat-closed-project',
      loading: false,
      error: null,
    })
  })

  // 왜: Director 는 채팅을 닫은 채 시작한다 — 첫 안내 · 채워 두면 좋은 항목 · Editor 로 넘기자는 권유가 닫힌 채팅에 쌓여도 알 수 없었다.
  //   예전 대화(불러온 기록)는 새 말이 아니다.
  it('Director 에서 채팅이 닫혀 있는 동안 Lumi 가 새로 말하면 Lumi 알약에 그 수가 뜬다', () => {
    enter('director')
    pillMounted()
    expect(unseenBadge()).toBeUndefined()

    lumiSays('welcome', 'gaps')

    expect(unseenBadge()?.props.children).toBe(2)
  })

  // 왜: 수는 "아직 안 본 말"이다 — 채팅을 열어 보았으면 다시 닫아도 0 에서 센다.
  it('채팅을 열면 알약의 수가 사라진다', () => {
    enter('director')
    pillMounted()
    lumiSays('welcome')
    expect(unseenBadge()?.props.children).toBe(1)

    useChatUiStore.getState().setCollapsed(false)
    pillMounted()
    useChatUiStore.getState().setCollapsed(true)
    pillMounted()

    expect(unseenBadge()).toBeUndefined()
  })

  // 왜: 숫자는 눈으로만 보인다 — 화면 읽기 프로그램도 새 메시지 수를 읽는다. 영어는 하나일 때 "1 new message"(검토 C).
  it('알약은 새 메시지 수를 화면 읽기 이름에도 싣고, 영어로는 하나일 때 단수로 읽는다', () => {
    enter('director')
    pillMounted()
    lumiSays('welcome')
    const label = () => pill().find((node) => node.type === 'button')?.props['aria-label']
    expect(label()).toBe('채팅 열기 · 새 메시지 1개')
    useLocaleStore.setState({ locale: 'en' })
    expect(label()).toBe('Open chat · 1 new message')
    lumiSays('gaps')
    expect(label()).toBe('Open chat · 2 new messages')
  })

  // 왜: 알약은 닫힌 채팅의 얼굴이다 — 접힌 레일의 Lumi 처럼 답을 쓰는 중 · 오류를 같은 모습으로 보인다.
  it('Lumi 가 답을 쓰는 중이면 알약의 Lumi 도 생각 중 모습이다', () => {
    enter('director')
    const lumiState = () => pill().find((node) => typeof node.props.persona === 'string')?.props.state
    expect(lumiState()).toBe('idle')
    useGlobalChatStore.setState({ loading: true })
    expect(lumiState()).toBe('thinking')
    useGlobalChatStore.setState({ loading: false, error: '실패' })
    expect(lumiState()).toBe('error')
  })
})
