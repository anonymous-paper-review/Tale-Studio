// 콘티 보드를 화면에 붙였을 때 — 첫 순간(지금 단계 값이 아직 앞 화면)에도 콘티로 굴러 Artist 그림을 저절로 그리지 않고 첫 안내를 콘티 채팅에 남기는지, 씬 · 샷이 아직 없는 예전 흐름 프로젝트에는 Artist [만들기] 안내를 보이는지 검사한다 (검토 rev-flow 2026-11-26 1번 · 3번)
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand/vanilla'

// 화면 함수를 직접 부른다(브라우저 없이) — added-shot-board.test.ts 와 같은 방식: 훅은 자리 순서대로 값을 지키고, 효과는 바뀐 deps 만 다시 돈다.
//   React 처럼 보드(자식)의 효과가 먼저 돈다 — 레이아웃(부모)이 지금 단계 값을 주소에 맞추는 일은 이 시험에서 일어나지 않는다(그 사이를 본다).
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  dirty: false,
  effects: [] as Array<{ effect: () => void | (() => void); deps?: readonly unknown[] }>,
  mounted: [] as Array<{ deps?: readonly unknown[]; cleanup: void | (() => void) } | undefined>,
}))
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const memo = (factory: () => unknown, deps?: readonly unknown[]) => {
    const slot = hooks.cursor++
    const prev = hooks.slots[slot] as { deps?: readonly unknown[]; value: unknown } | undefined
    if (prev && same(prev.deps, deps)) return prev.value
    const value = factory()
    hooks.slots[slot] = { deps, value }
    return value
  }
  const effect = (run: () => void | (() => void), deps?: readonly unknown[]) => { hooks.effects.push({ effect: run, deps }) }
  return {
    ...react,
    useState: (initial: unknown) => {
      const slot = hooks.cursor++
      if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      return [hooks.slots[slot], (value: unknown) => {
        const next = typeof value === 'function' ? (value as (prev: unknown) => unknown)(hooks.slots[slot]) : value
        if (Object.is(next, hooks.slots[slot])) return
        hooks.slots[slot] = next
        hooks.dirty = true
      }]
    },
    useRef: (initial: unknown) => {
      const slot = hooks.cursor++
      if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
      return hooks.slots[slot]
    },
    useCallback: (callback: unknown, deps?: readonly unknown[]) => memo(() => callback, deps),
    useMemo: (factory: () => unknown, deps?: readonly unknown[]) => memo(factory, deps),
    useEffect: effect,
    useLayoutEffect: effect,
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    useDebugValue: () => {},
    useId: () => ':board:',
  }
})
vi.mock('react-dom', async (original) => ({ ...(await original<typeof import('react-dom')>()), createPortal: (node: unknown) => node }))
vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla')
  const create = (initializer?: StateCreator<unknown>) => {
    if (!initializer) return create
    const store = createStore(initializer)
    return Object.assign((selector?: (state: unknown) => unknown) => (selector ? selector(store.getState()) : store.getState()), store)
  }
  return { create }
})
// 화면 주소 — 사용자가 연 화면. 지금 단계 값(저장소)은 레이아웃이 주소를 본 뒤에야 바뀐다.
const route = vi.hoisted(() => ({ path: '/studio/conti' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.path, useRouter: () => ({ push: () => {}, replace: () => {} }) }))
// Writer 실행 상태 — 기본은 아직 못 읽음(null).
const writer = vi.hoisted(() => ({ status: null as null | Record<string, unknown> }))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: writer.status, restart: () => {} }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const query = { eq: () => query, then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) }
      return { insert: async () => ({ error: null }), update: () => query }
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))
vi.mock('@/lib/generation-jobs-client', () => ({ pollGenerationJob: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/lib/writer/debug-events-client', () => ({ recordWriterObservabilityEventClient: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined), loadShotsResult: vi.fn() }))
vi.mock('@/lib/generation-queue', async (original) => ({ ...(await original<typeof import('@/lib/generation-queue')>()), refreshGenerationQueue: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { RoughStoryboardView } from '@/features/writer/rough-storyboard-view'
import { WriterWorkspace } from '@/features/writer/writer-workspace'
import { _setGenerationQueueSnapshotForTests } from '@/lib/generation-queue'
import { useArtistStore } from '@/stores/artist-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useWriterUiStore } from '@/stores/writer-ui-store'
import type { Scene, Shot, StageId } from '@/types'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))

/** 콘티 화면(작업 공간)이 그린 보드 — 작업 공간이 보드에 넘긴 값 그대로. 작업 공간의 훅 자리는 보드와 섞이지 않게 비운다. */
function boardFromWorkspace(): Element {
  hooks.slots = []
  hooks.cursor = 0
  hooks.effects = []
  const board = elements(WriterWorkspace()).find((node) => node.type === RoughStoryboardView)
  hooks.slots = []
  hooks.cursor = 0
  hooks.effects = []
  if (!board) throw new Error('the rough storyboard board was not rendered')
  return board
}
/** 보드를 화면에 붙인다 — 첫 렌더의 효과부터 돌고, 그 사이 상태가 바뀌면 가라앉을 때까지 다시 그린다. */
function mount(board: Element) {
  const props = board.props
  for (let pass = 0; pass < 10; pass++) {
    hooks.dirty = false
    hooks.cursor = 0
    hooks.effects = []
    ;(RoughStoryboardView as (props: Record<string, unknown>) => ReactNode)(props)
    hooks.effects.forEach(({ effect, deps }, index) => {
      const prev = hooks.mounted[index]
      if (prev && same(prev.deps, deps)) return
      if (typeof prev?.cleanup === 'function') prev.cleanup()
      hooks.mounted[index] = { deps, cleanup: effect() }
    })
    if (!hooks.dirty) return
  }
  throw new Error('the board kept re-rendering')
}
/** 보드를 한 번 그린 결과(효과는 돌리지 않는다). */
function renderBoard(stage: 'conti' | 'writer'): Element[] {
  hooks.cursor = 0
  hooks.effects = []
  return elements((RoughStoryboardView as (props: Record<string, unknown>) => ReactNode)({ stage }))
}
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}
function unmount() {
  for (const mounted of hooks.mounted) if (typeof mounted?.cleanup === 'function') mounted.cleanup()
  hooks.mounted = []
  hooks.slots = []
}

const scene: Scene = {
  sceneId: 'sc_01', sortOrder: 0, location: 'hall', timeOfDay: 'night', mood: '', narrativeSummary: '',
  originalTextQuote: '', charactersPresent: [], estimatedDurationSeconds: 5,
}
const drawnShot = (shotId: string, sortOrder: number): Shot => ({
  shotId, sceneId: 'sc_01', sortOrder, shotType: 'MS', actionDescription: `${shotId} 문을 연다`, characters: [], durationSeconds: 5,
  generationMethod: 'T2V', dialogueLines: [], camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
  roughStoryboard: { status: 'completed', url: `${shotId}.png` } as Shot['roughStoryboard'],
})

const autoGenerateBaseImages = vi.fn(async () => {})
const offerSuggestion = vi.fn()

/** 콘티의 러프를 다 그린 프로젝트를 연다 — 지금 단계 값은 아직 앞 화면(previous)이다. */
function openConti(projectId: string, previous: StageId, reached: StageId) {
  _setGenerationQueueSnapshotForTests({ projectId, jobs: [] })
  useProjectStore.setState({ projectId, currentStage: previous, reachedStage: reached })
  useWriterStore.setState({
    sceneManifest: { scenes: [scene], characters: [], locations: [] },
    shots: [drawnShot('sh_01_01', 0), drawnShot('sh_01_02', 1)],
    loadProject: vi.fn(async () => {}),
    error: null,
  })
  useGlobalChatStore.setState({ offerSuggestion, messages: [], messagesLoadedProjectId: projectId })
  route.path = '/studio/conti'
  mount(boardFromWorkspace())
}

// 콘티로 돌아오는 두 길(검토 rev-flow 1번): [Artist로 가기] → Artist([이미지 만들기] 전) → 레일 Writer(콘티),
//   그리고 저장 단계 conti 에서 [씬 스토리] → [콘티]. 두 길 모두 보드가 붙는 첫 순간의 지금 단계 값은 앞 화면이다.
const RETURNS: ReadonlyArray<{ previous: StageId; reached: StageId }> = [
  { previous: 'artist', reached: 'artist' },
  { previous: 'producer', reached: 'conti' },
]

beforeEach(() => {
  hooks.slots = []
  hooks.mounted = []
  writer.status = null
  autoGenerateBaseImages.mockClear()
  offerSuggestion.mockClear()
  useLocaleStore.setState({ locale: 'ko' })
  useWriterUiStore.setState({ activeTab: 'storyboard', setActiveTab: vi.fn(), setV2Available: vi.fn() })
  // Artist 목록은 이미 읽혀 있다 — 채우기가 시작되면 기다리지 않고 바로 그림을 부른다.
  useArtistStore.setState({ characterAssets: [{ id: 'c1' }] as never, autoGenerateBaseImages, loadData: vi.fn() })
  vi.stubGlobal('document', { body: {}, cookie: '' })
  vi.stubGlobal('window', { location: { pathname: '/studio/conti', search: '' } })
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ ok: true, data: null }) })))
})
afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
})

describe('콘티 보드가 처음 붙는 순간의 단계', () => {
  // 왜: O1 — Artist 그림은 Artist 의 [이미지 만들기]가 그림체를 보고 그린다. 지금 단계 값은 레이아웃(부모)이 주소를 본 뒤에 바뀌는데
  //   보드(자식)의 효과가 먼저 돌아, 첫 순간의 보드가 자기를 Storyboard 로 알고 Artist 인물 · 배경 그림을 그렸다(검토 rev-flow 1번).
  //   프로젝트마다 한 번 표시가 먼저 찍혀 되돌릴 수도 없었다. [Artist로 가기] 뒤 Artist 에서 레일 Writer 로 돌아올 때,
  //   저장 단계 conti 에서 [씬 스토리] → [콘티]로 돌아올 때 일어난다.
  it('콘티 주소면 첫 렌더에서도 Artist 그림 채우기를 하지 않는다', async () => {
    for (const [index, { previous, reached }] of RETURNS.entries()) {
      openConti(`p-conti-fill-${index}`, previous, reached)
      await Promise.resolve()
      expect(autoGenerateBaseImages, `${previous} → conti`).not.toHaveBeenCalled()
      unmount()
    }
  })

  // 왜: 같은 까닭으로 첫 안내("이렇게 나눴어요")가 Storyboard 채팅에 남으면, 콘티 채팅에는 안내가 없고 아직 열리지 않은 Storyboard 채팅에 말이 쌓인다.
  it('콘티 주소면 첫 렌더에서도 첫 안내를 콘티 채팅에 남긴다', () => {
    for (const [index, { previous, reached }] of RETURNS.entries()) {
      const projectId = `p-conti-brief-${index}`
      openConti(projectId, previous, reached)
      const stages = offerSuggestion.mock.calls.map(([suggestion]) => (suggestion as { stage: string }).stage)
      expect(offerSuggestion, `${previous} → conti`).toHaveBeenCalledWith(expect.objectContaining({ id: `conti-brief:${projectId}`, stage: 'conti' }))
      expect(stages, `${previous} → conti`).not.toContain('writer')
      offerSuggestion.mockClear()
      unmount()
    }
  })
})

describe('씬 · 샷이 아직 없는 콘티', () => {
  /** 산문을 확정했지만 씬 · 샷을 아직 나누지 않은 프로젝트의 콘티(실행은 산문 초안 그대로 — [만들기] 전). */
  function emptyConti(reached: StageId) {
    useProjectStore.setState({ projectId: `p-empty-${reached}`, currentStage: 'conti', reachedStage: reached, producerLocked: true })
    useWriterStore.setState({ sceneManifest: null, shots: [], loadProject: vi.fn(async () => {}), error: null })
    useGlobalChatStore.setState({ offerSuggestion, messages: [], messagesLoadedProjectId: null, requestNextStep })
    writer.status = { started: true, draft: true, current_status: 'awaiting_confirmation', current_stage: 'storyCheck', pipeline_completed: false, pipeline_failed: false }
    return renderBoard('conti')
  }
  const requestNextStep = vi.fn(async () => {})
  const button = (tree: Element[], label: string) => tree.find((node) => typeof node.props.onClick === 'function' && textOf(node).trim() === label)

  // 왜(혼자 정한 것): 예전 흐름(콘티가 Artist 앞에 오기 전)으로 Artist 까지 연 프로젝트는 Artist [만들기]가 씬 · 샷을 나눈다 —
  //   "다음" · [콘티로 가기] · 레일 Writer 가 데려온 빈 콘티가 "씬 확인을 기다리는 중"만 보여 무엇을 해야 할지 몰랐다(검토 rev-flow 3번).
  //   이 프로젝트들은 지금처럼 콘티로 오고, 콘티가 할 일과 가는 단추를 보인다.
  it('예전 흐름으로 Artist 까지 연 프로젝트의 콘티는 씬 · 샷이 없으면 "Artist [만들기]에서 씬 · 샷을 나눠요"와 [Artist로 가기]를 보인다', () => {
    requestNextStep.mockClear()
    const tree = emptyConti('artist')
    expect(tree.map(textOf).join(' ')).toContain('Artist [만들기]에서 씬 · 샷을 나눠요')
    const go = button(tree, 'Artist로 가기')
    expect(go, 'Artist로 가기').toBeTruthy()
    ;(go!.props.onClick as () => void)()
    expect(requestNextStep).toHaveBeenCalledTimes(1)
  })

  // 왜: 정상 경로 고정 — 산문만 확정하고 나누기가 걸리지 않은 콘티(저장 단계 conti)는 지금처럼 [씬 · 샷 나누기 시작]이다. Artist 는 아직 열리지 않았다.
  it('산문만 확정하고 나누기가 걸리지 않은 콘티는 지금처럼 [씬 · 샷 나누기 시작]을 보이고 Artist 안내는 보이지 않는다', () => {
    const tree = emptyConti('conti')
    expect(tree.some((node) => typeof node.type === 'function' && node.type.name === 'ContiSplitStart')).toBe(true)
    expect(tree.map(textOf).join(' ')).not.toContain('Artist [만들기]에서 씬 · 샷을 나눠요')
  })
})
