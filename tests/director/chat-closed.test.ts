// Director · Editor 에 들어오면 채팅이 닫혀 있고 접힌 레일 없이 Lumi 아이콘으로 열며, 떠나면 채팅이 들어오기 전 모습으로 돌아가고, 닫힌 동안의 멘션 · Lumi 의 새 말을 놓치지 않는지 검사한다 (v3 D1 2026-11-03 · 11/13 시안 D1 · E1 · R, 오너 11/14)
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
import { useDirectorCanvasStore } from '@/stores/director-store'
import { TopBarActions } from '@/components/layout/studio-top-bar'

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
  useDirectorCanvasStore.setState({ projectId: '', realBatchBusy: false, videoBatchBusy: false, nodes: [] })
  ;(globalThis as { matchMedia?: unknown }).matchMedia = undefined
})

describe('혼자 정한 것', () => {
  // 왜: D1 시안은 노드 캔버스를 넓게 쓰려고 채팅을 접어 둔 채로 보여 준다. 다른 단계에서 채팅을 열어 두었어도 Director 는 닫힌 채 시작한다.
  it('Director 화면에 들어오면 채팅이 닫혀 있다', () => {
    expect(read('src/app/studio/director/page.tsx')).toContain("useHoldChatClosed('director')")
    enter('director')
    expect(chatClosed()).toBe(true)
  })

  // 왜: 채팅이 닫혀 있을 때 여는 곳이 툴바 오른쪽 끝의 Lumi 아이콘이다(D1 "Lumi Chat 접힘" → 11/13 시안 "Lumi · 접힘 (아이콘만)").
  it('Director 에서 접힌 Lumi 아이콘을 누르면 채팅이 열린다', () => {
    expect(read('src/app/studio/director/page.tsx')).toContain('<LumiChatPill')
    enter('director')
    const pill = elements(LumiChatPill()).find((node) => node.type === 'button')
    expect(pill).toBeDefined()
    ;(pill!.props.onClick as () => void)()
    expect(chatClosed()).toBe(false)
  })

  // 왜: 채팅이 열려 있으면 패널 머리에 접기 단추가 있다 — 여는 아이콘이 같이 있으면 같은 일을 하는 단추가 둘이 된다.
  it('채팅이 열려 있으면 접힌 Lumi 아이콘이 보이지 않는다', () => {
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

  // 왜: 접힌 레일(v3 Chat Toggle «)은 다른 단계에서 닫힌 채팅을 여는 곳이다 — Director · Editor 밖은 바뀌지 않는다(오너 11/14 "Director · Editor 만").
  it('Director · Editor 밖의 단계에서는 채팅을 접으면 지금처럼 접힌 레일이 남는다', () => {
    useChatUiStore.setState({ collapsed: true, chatWidth: CHAT_DEFAULT_WIDTH })
    for (const pathname of ['/studio/producer', '/studio/artist', '/studio/writer']) {
      expect(railOpenButton(pathname), pathname).toBe(true)
      expect(mainMarginRight(pathname), pathname).toBe(SHELL_INSET + CHAT_COLLAPSED_RAIL)
    }
  })
})

describe('같이 정한 것 · 접힌 Lumi 아이콘(11/13 시안 D1 · E1 · R, 오너 11/14 "추천대로")', () => {
  // 왜: 시안 "Lumi · 접힘 (아이콘만)" — 접힌 Lumi 는 얼굴 하나다. 예전 알약의 "Lumi" 글자 · 펼침 표시(⤢)는 없다. 이름은 화면 읽기에만 있다.
  it('Director 에서 접힌 Lumi 아이콘에는 Lumi 얼굴만 있고 글자 · 펼침 표시가 없다', () => {
    useChatUiStore.setState({ collapsed: true })
    const nodes = draw(() => LumiChatPill(), '/studio/director')
    const button = nodes.find((node) => node.type === 'button')
    expect(button?.props['aria-label']).toBe('채팅 열기')
    expect(nodes.some((node) => typeof node.props.persona === 'string')).toBe(true)
    expect(elements(button!.props.children as ReactNode).flatMap((node) => [node.props.children]).some((child) => child === 'Lumi')).toBe(false)
    expect(nodes.some((node) => typeof node.type === 'function' && /Expand/.test((node.type as { name?: string }).name ?? ''))).toBe(false)
  })

  // 왜: 시안 E1 — Editor 도 접힌 레일 없이 위 막대 오른쪽 끝의 Lumi 아이콘으로 연다. 레일이 없으니 단계 화면이 오른쪽 끝까지 간다.
  it('Editor 에서 채팅이 닫혀 있으면 접힌 레일이 없고 위 막대 오른쪽 끝의 Lumi 아이콘으로 열며 단계 화면이 오른쪽 끝까지 간다', () => {
    useProjectStore.setState({ currentStage: 'editor' })
    useChatUiStore.setState({ collapsed: true, chatWidth: CHAT_DEFAULT_WIDTH })
    expect(railOpenButton('/studio/editor')).toBe(false)
    const chat = draw(() => GlobalChat(), '/studio/editor')
    const slot = chat.find((node) => node.type === TopBarActions)
    expect(slot).toBeDefined()
    const icon = elements(slot!.props.children as ReactNode).find((node) => node.type === LumiChatPill)
    expect(icon?.props.stage).toBe('editor')
    expect(mainMarginRight('/studio/editor')).toBe(SHELL_INSET)
    // 다른 단계에서는 위 막대에 Lumi 아이콘을 넣지 않는다.
    expect(draw(() => GlobalChat(), '/studio/artist').some((node) => node.type === TopBarActions)).toBe(false)
  })

  // 왜: 시안 R "만드는 중이면 아이콘이 살짝 움직여요" — 접혀 있어도 이 프로젝트에서 그림 · 영상이 만들어지는 중인지 보인다.
  //   Lumi 가 답을 쓰는 동안도 일하는 중이다. 다른 프로젝트의 작업은 세지 않는다(혼자 정한 것).
  it('이 프로젝트에서 그림 · 영상을 만드는 중이거나 Lumi 가 답을 쓰는 중이면 접힌 Lumi 아이콘이 살짝 움직인다', () => {
    useChatUiStore.setState({ collapsed: true })
    const moving = () => draw(() => LumiChatPill(), '/studio/director').some((node) => node.props['data-making'] === true)
    expect(moving()).toBe(false)
    useDirectorCanvasStore.setState({ projectId: 'chat-closed-project', realBatchBusy: true })
    expect(moving()).toBe(true)
    useDirectorCanvasStore.setState({ realBatchBusy: false, videoBatchBusy: true })
    expect(moving()).toBe(true)
    useDirectorCanvasStore.setState({ videoBatchBusy: false, nodes: [{ id: 'v1', type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', status: 'generating' } } as never] })
    expect(moving()).toBe(true)
    useDirectorCanvasStore.setState({ nodes: [{ id: 's1', type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', storyboardImage: { status: 'generating' } } } as never] })
    expect(moving()).toBe(true)
    useDirectorCanvasStore.setState({ nodes: [], projectId: 'other-project', realBatchBusy: true })
    expect(moving()).toBe(false)
    useDirectorCanvasStore.setState({ realBatchBusy: false })
    useGlobalChatStore.setState({ loading: true })
    expect(moving()).toBe(true)
  })

  // 왜: 추천(오너 11/14 "추천대로") — 1100px 보다 좁은 화면에서 패널이 밀어내면 Director 카드 · Editor 배치가 너무 좁아진다. 그때는 패널이 화면 위에 덮인다.
  //   다른 단계는 지금처럼 민다(혼자 정한 것 — "Director · Editor 만 바꾸고").
  it('화면 폭이 1100px 보다 좁으면 Director · Editor 에서 연 채팅은 화면을 밀지 않고 위에 덮이고, 다른 단계는 지금처럼 민다', () => {
    useChatUiStore.setState({ collapsed: false, chatWidth: CHAT_DEFAULT_WIDTH })
    const narrow = (matches: boolean) => {
      ;(globalThis as { matchMedia?: unknown }).matchMedia = (query: string) => ({ matches: matches && query === '(max-width: 1099px)', addEventListener() {}, removeEventListener() {} })
    }
    narrow(false)
    expect(mainMarginRight('/studio/director')).toBe(SHELL_INSET + CHAT_DEFAULT_WIDTH)
    narrow(true)
    expect(mainMarginRight('/studio/director')).toBe(SHELL_INSET)
    expect(mainMarginRight('/studio/editor')).toBe(SHELL_INSET)
    expect(mainMarginRight('/studio/artist')).toBe(SHELL_INSET + CHAT_DEFAULT_WIDTH)
  })
})

/** Lumi 알약을 한 번 그린다 — 붙어 있는 동안 하는 일(본 말 기억하기)까지 돈다. */
const pillMounted = () => LumiChatPill()
/** 알약의 지금 모습(붙을 때 하는 일은 돌리지 않는다). */
const pill = () => draw(() => LumiChatPill(), '/studio/director')
const lumiSays = (...ids: string[]) =>
  useGlobalChatStore.setState((state) => ({ messages: [...state.messages, ...ids.map((id) => ({ id, stage: 'director' as const, role: 'model' as const, content: id }))] }))
const unseenBadge = () => pill().find((node) => node.props['data-testid'] === 'lumi-icon-unseen')

describe('혼자 정한 것 · 닫힌 채팅의 Lumi 아이콘(검토 B B2 → 11/13 시안 아이콘만, 오너 11/14 "새 말 수는 귀퉁이 작은 점")', () => {
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
  //   예전 대화(불러온 기록)는 새 말이 아니다. 시안은 아이콘만이라 수는 귀퉁이 점으로 보이고 수는 화면 읽기 이름에 싣는다(오너 11/14).
  it('Director 에서 채팅이 닫혀 있는 동안 Lumi 가 새로 말하면 접힌 Lumi 아이콘 귀퉁이에 작은 점이 뜬다', () => {
    enter('director')
    pillMounted()
    expect(unseenBadge()).toBeUndefined()

    lumiSays('welcome', 'gaps')

    expect(unseenBadge()).toBeDefined()
    expect(unseenBadge()?.props.children).toBeUndefined()
  })

  // 왜: 점은 "아직 안 본 말"이다 — 채팅을 열어 보았으면 다시 닫아도 0 에서 센다.
  it('채팅을 열면 접힌 Lumi 아이콘의 새 말 점이 사라진다', () => {
    enter('director')
    pillMounted()
    lumiSays('welcome')
    expect(unseenBadge()).toBeDefined()

    useChatUiStore.getState().setCollapsed(false)
    pillMounted()
    useChatUiStore.getState().setCollapsed(true)
    pillMounted()

    expect(unseenBadge()).toBeUndefined()
  })

  // 왜: 점은 눈으로만 보인다 — 화면 읽기 프로그램은 새 메시지 수를 읽는다. 영어는 하나일 때 "1 new message"(검토 C).
  it('접힌 Lumi 아이콘은 새 메시지 수를 화면 읽기 이름에 싣고, 영어로는 하나일 때 단수로 읽는다', () => {
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

  // 왜: 아이콘은 닫힌 채팅의 얼굴이다 — 접힌 레일의 Lumi 처럼 답을 쓰는 중 · 오류를 같은 모습으로 보인다.
  it('Lumi 가 답을 쓰는 중이면 접힌 Lumi 아이콘의 Lumi 도 생각 중 모습이다', () => {
    enter('director')
    const lumiState = () => pill().find((node) => typeof node.props.persona === 'string')?.props.state
    expect(lumiState()).toBe('idle')
    useGlobalChatStore.setState({ loading: true })
    expect(lumiState()).toBe('thinking')
    useGlobalChatStore.setState({ loading: false, error: '실패' })
    expect(lumiState()).toBe('error')
  })
})
