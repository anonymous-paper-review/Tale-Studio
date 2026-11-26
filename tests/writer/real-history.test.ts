// Storyboard 실사 카드에 마우스를 올리면 카드 아래에 지난 판이 가장 새 것부터 5개까지 뜨고, 누르면 샷 상세가 그 판을 먼저 보이며, [채택]이 Director 와 같은 길로 그 판을 지금 그림으로 만든다 (오너 2026-11-26 S3)
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand/vanilla'

// 이 파일은 React 훅을 꾸며 두고 부품을 함수로 불러 그 안의 요소(지난 판 줄 · 상세와 그 값)를 본다 — artist/history-cards 와 같은 방식.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useDebugValue: () => {},
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    return [hooks.slots[slot], (value: unknown) => { hooks.slots[slot] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(hooks.slots[slot]) : value }]
  },
  useRef: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect: () => {},
  useLayoutEffect: () => {},
  useId: () => `id-${hooks.cursor++}`,
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
// useShallow 는 React 기본 내보내기의 useRef 를 쓴다 — 꾸민 훅 밖이라 고른 값을 그대로 돌려주게 둔다.
vi.mock('zustand/react/shallow', () => ({ useShallow: (selector: unknown) => selector }))

const version = (n: number) => ({
  id: `job-${n}`, n, url: `https://x/v${n}-s.png`, generatedAt: n, source: 'generated',
  frames: { start: `https://x/v${n}-s.png`, direction: `https://x/v${n}-d.png`, end: `https://x/v${n}-e.png` },
})
/** v1 … v{count} 를 차례로 만든 실사 — 마지막 판이 지금 그림. */
const realWith = (count: number) => {
  const versions = Array.from({ length: count }, (_, i) => version(i + 1))
  const now = versions[count - 1]!
  return { url: now.url, status: 'completed', errorMessage: null, generatedAt: now.generatedAt, frames: now.frames, versions, versionId: now.id, rev: count }
}
const conti = (id: string) => ({ url: `https://x/${id}-rough.png`, status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: `https://x/${id}-rough.png`, direction: 'd', end: 'e' } })
const shot = (shotId: string, roughStoryboard: unknown) => ({
  shotId, sceneId: 's1', shotType: 'MS', actionDescription: `${shotId} 움직임`, characters: [], durationSeconds: 4, dialogueLines: [],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, roughStoryboard,
})

const data = vi.hoisted(() => ({
  project: { projectId: 'p1' },
  writer: {
    sceneManifest: { scenes: [{ sceneId: 's1', location: '', timeOfDay: '', narrativeSummary: '' }], characters: [], locations: [] },
    shots: [] as unknown[],
    loadProject: async () => {},
  },
  images: { projectId: 'p1', images: {} as Record<string, unknown>, loaded: true, failed: false, load: (() => Promise.resolve()) as (...args: unknown[]) => Promise<void> },
  jobs: [] as unknown[],
  director: { realBatchBusy: false, realBatchCancelled: false, realBatchShotIds: null as string[] | null },
}))
vi.mock('@/stores/project-store', () => ({ useProjectStore: Object.assign((select: (s: unknown) => unknown) => select(data.project), { getState: () => data.project }) }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/lib/storyboard/real-images-store', () => ({
  useStoryboardRealImages: Object.assign((select: (s: unknown) => unknown) => select(data.images), { getState: () => data.images }),
}))
vi.mock('@/lib/generation-queue', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useActiveGenerationJobs: () => data.jobs }))
vi.mock('@/stores/director-store', () => ({ useDirectorCanvasStore: (select: (s: unknown) => unknown) => select(data.director) }))
vi.mock('@/stores/chat-ui-store', () => ({ useChatUiStore: Object.assign((select: (s: unknown) => unknown) => select({ mentionedRefs: [] }), { getState: () => ({ setCollapsed: () => {} }) }) }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: Object.assign((select: (s: unknown) => unknown) => select({ offerSuggestion: () => {}, messages: [], messagesLoadedProjectId: null }), { getState: () => ({}) }) }))
vi.mock('@/stores/artist-store', () => ({ useArtistStore: (select: (s: unknown) => unknown) => select({ characterAssets: [], worldAssets: [] }) }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ mode: 'off', failed: false, loading: false }) }))
vi.mock('@/features/storyboard/storyboard-header', () => ({ StoryboardHeader: () => null }))
vi.mock('@/features/writer/storyboard-director-dialog', () => ({ StoryboardDirectorDialog: () => null }))
vi.mock('@/features/writer/storyboard-director', () => ({ handOverToDirector: vi.fn() }))
vi.mock('@/components/lumi/lumi', () => ({ Lumi: () => null }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: Object.assign((select: (s: unknown) => unknown) => select({ locale: 'ko' }), { getState: () => ({ locale: 'ko' }) }) }))

import { RealBoardView } from '@/features/storyboard/real-board-view'
import { RealShotDialog } from '@/features/storyboard/real-shot-dialog'
import { useBoardUiStore } from '@/features/writer/board-ui-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
const named = (name: string) => (node: Element) => typeof node.type === 'function' && node.type.name === name
const expand = (element: Element) => elements((element.type as (props: Record<string, unknown>) => ReactNode)(element.props))
function renderBoard(): Element[] {
  hooks.cursor = 0
  return elements((RealBoardView as () => ReactNode)())
}
/** 그 샷 카드를 감싼 지난 판 줄 — 줄 안의 카드(RealShotCard)의 샷 id 로 찾는다. */
function hoverOf(tree: Element[], shotId: string): Element {
  return tree.filter(named('VersionHistoryHover')).find((hover) => elements(hover.props.children as ReactNode).some((el) => named('RealShotCard')(el) && (el.props.shot as { shotId: string }).shotId === shotId))!
}
/** 샷 상세의 몸(그림 · 보는 판 줄) — 창 부품을 불러 펼친다. */
function renderDialog(shotId: string): Element[] {
  hooks.cursor = 0
  const dialog = elements((RealShotDialog as (props: Record<string, unknown>) => ReactNode)({ shotId, onOpenChange: () => {} }))
  return expand(dialog.find(named('RealShotDialogBody'))!)
}
const labels = (hover: Element) => (hover.props.cards as Array<{ label: string }>).map((card) => card.label)

let load: ReturnType<typeof vi.fn>

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  load = vi.fn(async () => {})
  data.writer.shots = [shot('a', conti('a')), shot('b', conti('b'))]
  data.images = { projectId: 'p1', images: { b: realWith(7) }, loaded: true, failed: false, load: load as unknown as (...args: unknown[]) => Promise<void> }
  data.jobs = []
  useBoardUiStore.setState({ shotEditId: null, shotEditVersionId: null } as never)
})
afterEach(() => vi.unstubAllGlobals())

describe('같이 정한 것', () => {
  it('실사가 있는 Storyboard 카드는 지난 판 줄로 감싸여 가장 새 판부터 5개까지 보이고, 콘티 그림만 있는 카드는 줄이 비어 있다', () => {
    // 왜: 오너 S3 "Storyboard 호버링하면 과거 이력 아래에 뜨기 (5개까지) → Artist 수정 사항처럼" — 콘티(러프)는 판 기록이 없다(리드 답 ④-2).
    const tree = renderBoard()
    const real = hoverOf(tree, 'b')
    expect(labels(real)).toEqual(['v6', 'v5', 'v4', 'v3', 'v2'])
    expect(real.props.more).toBe(1)
    expect(hoverOf(tree, 'a').props.cards).toEqual([])
  })

  it('줄의 지난 판을 누르면 샷 상세가 그 판을 먼저 보이게 열리고, 카드를 그냥 누르거나 대사 탭에서 열면 지난 판 없이 열린다', () => {
    // 왜: 오너 S3 "과거 클릭 후 상세페이지로 들어가면 '채택'" — 다른 길로 연 상세가 예전에 보던 지난 판을 띄우면 지금 그림인 줄 안다.
    ;(hoverOf(renderBoard(), 'b').props.onOpen as (id: string) => void)('job-3')
    expect(useBoardUiStore.getState()).toMatchObject({ shotEditId: 'b', shotEditVersionId: 'job-3' })
    useBoardUiStore.getState().setShotEditId('b')
    expect(useBoardUiStore.getState()).toMatchObject({ shotEditId: 'b', shotEditVersionId: null })
  })

  it('샷 상세에서 지난 판을 보며 [채택]을 누르면 Director 와 같은 이미지 판 고르기로 지금 그림이 되고, Storyboard 카드 그림을 다시 읽는다', async () => {
    // 왜: 오너 S3 · 리드 — 같은 실사 판 기록이라 Director 와 같은 길(다시 그리지 않음 · Take 0). 다시 읽어야 카드가 바로 그 판을 보인다.
    const fetcher = vi.fn(async () => Response.json({ image: {} }))
    vi.stubGlobal('fetch', fetcher)
    useBoardUiStore.getState().openShotVersion('b', 'job-3')
    const body = renderDialog('b')
    expect(body.find(named('RoughFrameCycle'))!.props.panel).toMatchObject({ frames: version(3).frames })
    await (body.find(named('VersionViewingBar'))!.props.onAdopt as () => Promise<void>)()
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/director/storyboard-image/version')
    expect(JSON.parse(String(init.body))).toEqual({ projectId: 'p1', writerShotId: 'b', versionId: 'job-3' })
    expect(load).toHaveBeenCalledWith('p1', { fresh: true })
  })
})

describe('혼자 정한 것', () => {
  it('그 샷 실사를 다시 그리는 중이면 [채택]이 꺼진다', () => {
    // 왜: 그리는 중에 채택하면 끝난 새 그림이 그 채택을 덮는다 — Director 상세와 같은 규칙.
    data.jobs = [{ id: 'j1', kind: 'shot_storyboard', target: { writerShotId: 'b' } }]
    useBoardUiStore.getState().openShotVersion('b', 'job-3')
    const bar = renderDialog('b').find(named('VersionViewingBar'))!
    expect(bar.props.adoptDisabled).toBe(true)
  })

  it('[지금 그림 보기]를 누르면 채택하지 않고 지금 그림으로 돌아간다', () => {
    // 왜: 보기만 하고 나갈 길 — Director · Artist 상세와 같다.
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    useBoardUiStore.getState().openShotVersion('b', 'job-3')
    ;(renderDialog('b').find(named('VersionViewingBar'))!.props.onBack as () => void)()
    const body = renderDialog('b')
    expect(body.find(named('VersionViewingBar'))).toBeUndefined()
    expect(body.find(named('RoughFrameCycle'))!.props.panel).toMatchObject({ frames: version(7).frames })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
