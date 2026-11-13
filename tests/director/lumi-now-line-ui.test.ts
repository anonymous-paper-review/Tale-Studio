// Director 채팅 패널 머리 아래에 "지금 할 일" 줄이 보드 전체 상태로 보이고 상태가 바뀌면 같이 바뀌며, 빠른 칩도 보드와 같은 샷 상태로 세는지 검사한다 (11/13 시안 D5, 오너 2026-11-14 "추천대로")
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'
import type { DirectorNode } from '@/types/director'

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
import { ScrollArea } from '@/components/ui/scroll-area'
import { LumiNowLine } from '@/features/director/lumi-now-line'
import { useDirectorShotStates } from '@/features/director/hooks/use-shot-states'
import { directorProgressLine } from '@/lib/director/lumi-quick-chips'
import { DIRECTOR_QUICK_CHIPS } from '@/lib/constants'
import { translate } from '@/lib/i18n/translate'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStore } from '@/stores/writer-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function render(component: () => ReactNode) {
  hooks.slots = []
  hooks.cursor = 0
  return elements(component())
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : ''
}
const lineText = () => {
  const line = render(LumiNowLine).find((node) => node.props['data-testid'] === 'lumi-now-line')
  return line ? text(line) : null
}

const IMG = (id: string) => ({ status: 'completed', url: `https://media.test/${id}.png`, jobId: null })
function shot(id: string, image: unknown = null): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, provider: 'seedance', durationSeconds: 3, storyboardImage: image } } as unknown as DirectorNode
}
function take(id: string, parent: string): DirectorNode {
  return { id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: parent, status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://media.test/${id}.mp4`, takeNumber: 1 } } as unknown as DirectorNode
}

beforeEach(() => {
  vi.clearAllMocks()
  hooks.pathname = '/studio/director'
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'p-dir', currentStage: 'director', projectLocale: 'ko', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'ko' })
  useChatUiStore.setState({ collapsed: false })
  useWriterStore.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ['s1', 's2', 's3', 's4'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
  useDirectorCanvasStore.setState({
    projectId: 'p-dir',
    nodes: [shot('s1'), shot('s2'), shot('s3', IMG('s3'))],
    statusFilter: 'all',
    pickedShotIds: [],
    realBatchBusy: false,
    realBatchShotIds: null,
    realBatchCancelled: false,
    videoBatchBusy: false,
    videoBatchQueue: null,
    videoBatchCancelled: false,
    chainVideoAfterImage: false,
  })
})

describe('지금 할 일 줄 자리(시안 D5)', () => {
  // 왜: 시안 D5 — 줄은 패널 맨 위(머리 "Lumi · Director" 바로 아래)에 붙어 말이 쌓여도 밀려 올라가지 않는다. 다른 단계에는 가리킬 Director 일이 없다.
  it('Director 채팅 패널 머리 아래 · 말 목록 위에 지금 할 일 줄이 있고, Director 밖의 단계 채팅에는 없다', () => {
    const panel = render(GlobalChat)
    const header = panel.findIndex((node) => node.type === 'h2')
    const line = panel.findIndex((node) => node.type === LumiNowLine)
    const list = panel.findIndex((node) => node.type === ScrollArea)
    expect(header).toBeGreaterThanOrEqual(0)
    expect(line).toBeGreaterThan(header)
    expect(list).toBeGreaterThan(line)
    // 패널은 주소로 단계를 읽는다 — Writer 화면으로 옮긴다.
    hooks.pathname = '/studio/writer'
    useProjectStore.setState({ currentStage: 'writer' })
    expect(render(GlobalChat).some((node) => node.type === LumiNowLine)).toBe(false)
  })

  // 왜(혼자 정한 것): 줄은 보드 전체의 다음 일이다 — 상태 고르기 · 카드 고르기로 좁혀 볼 때 위쪽 예상 칸은 좁힌 샷만 세지만 줄은 흔들리지 않는다.
  it('지금 할 일 줄은 상태 고르기 · 고른 샷과 상관없이 보드 전체를 센다', () => {
    expect(lineText()).toBe('지금 할 일 · 이미지 2장 · 약 2분 · Takes 안 써요')
    useDirectorCanvasStore.setState({ statusFilter: 'image_done', pickedShotIds: ['s3'] })
    expect(lineText()).toBe('지금 할 일 · 이미지 2장 · 약 2분 · Takes 안 써요')
  })

  // 왜: 정상 경로 고정 — 시안 D5 "상태 따라 바뀜". 이미지가 생기면 영상, 영상이 다 되면 다음: Editor로.
  it('보드 상태가 바뀌면 다시 그릴 때 지금 할 일 줄도 바뀐다', () => {
    useDirectorCanvasStore.setState({ nodes: [shot('s1', IMG('s1')), shot('s2', IMG('s2')), shot('s3', IMG('s3'))] })
    expect(lineText()).toBe('지금 할 일 · 영상 3개 · 약 3분')
    useDirectorCanvasStore.setState({ nodes: [shot('s1', IMG('s1')), take('v1', 's1'), shot('s2', IMG('s2')), take('v2', 's2'), shot('s3', IMG('s3')), take('v3', 's3')] })
    expect(lineText()).toBe('지금 할 일 · 다음: Editor로')
    useDirectorCanvasStore.setState({ nodes: [] })
    expect(lineText()).toBeNull()
  })
})

describe('빠른 칩이 세는 샷 상태', () => {
  // 왜: set c19f8008 — 보드는 실사 일괄이 맡아 차례를 기다리는 샷 · 영상 묶음이 아직 내지 않은 샷을 만드는 중으로 센다.
  //   칩이 다르게 세면 "지금 어디까지 됐어?"의 수가 카드 · 위쪽 단추와 어긋나고, 이미 맡은 샷을 칩이 다시 겨눈다.
  it('빠른 칩 "지금 어디까지 됐어?"가 세는 샷 상태는 보드(카드 · 위쪽 단추)가 세는 상태와 같다 — 일괄이 맡아 차례를 기다리는 샷 · 영상 묶음이 아직 내지 않은 샷도 만드는 중이다', async () => {
    useWriterStore.setState({
      shots: ['s1', 's2', 's3', 's4'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1', ...(id === 's3' ? { roughStoryboard: { status: 'completed', url: 'https://media.test/r3.png' } } : {}) })) as never,
    })
    useDirectorCanvasStore.setState({
      nodes: [shot('s1', IMG('s1')), take('v1', 's1'), shot('s2', IMG('s2')), shot('s3'), shot('s4')],
      realBatchBusy: true,
      realBatchShotIds: ['w-s3'],
      videoBatchQueue: { jobIds: [], pendingShotIds: ['w-s2'] },
    })
    hooks.slots = []
    hooks.cursor = 0
    const board = useDirectorShotStates()
    expect(Object.fromEntries(board)).toEqual({ s1: 'video_done', s2: 'video_generating', s3: 'image_generating', s4: 'image_needed' })
    await useGlobalChatStore.getState().sendMessage(translate('ko', DIRECTOR_QUICK_CHIPS[3]))
    const said = useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').at(-1)?.content
    expect(said).toBe(directorProgressLine('ko', board, (id) => `샷 ${id.slice(1)}`))
  })
})
