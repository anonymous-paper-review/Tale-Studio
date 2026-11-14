// Storyboard 보드가 더한 샷을 보드의 러프 요청으로 그릴 때 남기는 기록 · 띄우는 안내 · 카드 표시 · 잠금 · 탭과 [+ 샷 추가] 창을, 화면 함수를 직접 불러 검사한다
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'
import type { AddedDrawView, DrawAddedShot } from '@/lib/writer/added-shot-draws'

// 화면 함수를 직접 부른다(브라우저 없이) — 훅은 자리 순서대로 값을 지키고, 효과는 바뀐 deps 만 다시 돈다(React 와 같은 규칙).
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  /** 그린 뒤 상태가 바뀌었다 — 한 번 더 그려야 한다. */
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
// 보드가 장부에 맡기는 그리기(draw)를 붙잡는다 — 장부 화면값(views)을 정하면 그 값으로 카드를 그린다.
const board = vi.hoisted(() => ({ draw: null as null | DrawAddedShot, views: null as null | ReadonlyMap<string, AddedDrawView> }))
vi.mock('@/features/writer/use-added-shot-draws', async (original) => {
  const real = await original<typeof import('@/features/writer/use-added-shot-draws')>()
  return {
    useAddedShotDraws: (input: Parameters<typeof real.useAddedShotDraws>[0]) => {
      board.draw = input.draw
      const views = real.useAddedShotDraws(input)
      return board.views ?? views
    },
  }
})
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: null, restart: () => {} }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const query = { eq: () => query, then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) }
      return { insert: async () => ({ error: null }), update: () => query }
    },
  }),
}))
// 접수된 그리기는 끝나지 않은 채 둔다(그리는 중) — 끝은 이 파일이 보지 않는다.
vi.mock('@/lib/generation-jobs-client', () => ({ pollGenerationJob: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/lib/writer/debug-events-client', () => ({ recordWriterObservabilityEventClient: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined), loadShotsResult: vi.fn() }))
vi.mock('@/lib/generation-queue', async (original) => ({ ...(await original<typeof import('@/lib/generation-queue')>()), refreshGenerationQueue: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { toast } from 'sonner'
import { AiBusyOverlay } from '@/components/ai-busy-overlay'
import { NodeWaitCard } from '@/components/feedback/node-wait'
import { GeneratingOverlay } from '@/components/generating-frame'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import { AddItemDialog } from '@/features/writer/add-item-dialog'
import { AddedRedrawStatus } from '@/features/writer/added-redraw-status'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { RoughStoryboardView } from '@/features/writer/rough-storyboard-view'
import { _setGenerationQueueSnapshotForTests } from '@/lib/generation-queue'
import { autoSubmitEventPayload } from '@/lib/writer/added-shot-draws'
import { KO } from '@/lib/i18n/messages-ko'
import { recordWriterObservabilityEventClient } from '@/lib/writer/debug-events-client'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useWriterUiStore } from '@/stores/writer-ui-store'
import type { Scene, Shot } from '@/types'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}
/** 보드를 한 번 그린다(효과는 돌리지 않는다). */
function render(): Element[] {
  hooks.cursor = 0
  hooks.effects = []
  return elements(RoughStoryboardView())
}
/** 그린 뒤 화면에 붙인다 — deps 가 바뀐 효과만 (앞 정리 뒤) 다시 돌고, 그 사이 상태가 바뀌면 가라앉을 때까지 다시 그린다. */
function commit() {
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  for (let pass = 0; pass < 10; pass++) {
    hooks.dirty = false
    render()
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
/** 보드를 내린다(효과 정리) — 다음 보드는 처음부터 붙는다. */
function unmount() {
  for (const mounted of hooks.mounted) if (typeof mounted?.cleanup === 'function') mounted.cleanup()
  hooks.mounted = []
  hooks.slots = []
}
/** 보드 안의 작은 화면(함수 컴포넌트) 하나를 제 훅 자리에서 그린다 — 보드의 훅 자리와 섞이지 않게. */
function renderPart(node: Element): Element[] {
  const saved = { slots: hooks.slots, cursor: hooks.cursor, effects: hooks.effects }
  hooks.slots = []
  hooks.cursor = 0
  hooks.effects = []
  try {
    return elements((node.type as (props: Record<string, unknown>) => ReactNode)(node.props))
  } finally {
    Object.assign(hooks, saved)
  }
}
/** 보드 · 채팅을 덮는 잠금 표시가 열려 있나. */
const locked = () => render().find((node) => node.type === AiBusyOverlay)?.props.open
/** 그 샷의 카드. */
function card(shotId: string): Element {
  const found = render().find((node) => node.type === 'article' && node.key === shotId)
  if (!found) throw new Error(`card ${shotId} not rendered`)
  return found
}
/** 부품 하나를 그 자리에서 그려 본 결과 — 보드의 훅 자리와 섞이지 않게. 맨 위가 또 부품이면(그리는 중 띠 → 안쪽 칸) 이어서 그린다. */
function drawnPart(node: Element): ReactNode {
  const saved = { slots: hooks.slots, cursor: hooks.cursor, effects: hooks.effects }
  hooks.slots = []
  hooks.cursor = 0
  hooks.effects = []
  try {
    let out: ReactNode = node
    while (isValidElement<Record<string, unknown>>(out) && typeof out.type === 'function') {
      out = (out.type as (props: Record<string, unknown>) => ReactNode)(out.props)
    }
    return out
  } finally {
    Object.assign(hooks, saved)
  }
}
/** 알림 칸(role="status" · aria-live)마다 그것을 감싼 "그리는 중" 표시(aria-busy)가 있는지 — 감싸여 있으면 화면 읽기 프로그램이 그 표시가 풀릴 때까지
 *  알림을 미룰 수 있다. 기다림 카드 · 그리는 중 띠는 그려 본 결과로 본다 — 부품 종류만으로는 알림 칸이 실제로 있는지 모른다(검토 C2). */
function liveParts(node: ReactNode, insideBusy = false, from?: string): Array<{ part: string; role: unknown; insideBusy: boolean }> {
  if (Array.isArray(node)) return node.flatMap((child) => liveParts(child, insideBusy, from))
  if (!isValidElement<Record<string, unknown>>(node)) return []
  if (node.type === NodeWaitCard || node.type === GeneratingOverlay) {
    return liveParts(drawnPart(node), insideBusy, node.type === NodeWaitCard ? 'NodeWaitCard' : 'GeneratingOverlay')
  }
  const live = node.props.role === 'status' || node.props['aria-live'] != null
  const inner = liveParts(node.props.children as ReactNode, insideBusy || node.props['aria-busy'] === 'true', from)
  return live ? [{ part: from ?? String(node.type), role: node.props.role, insideBusy }, ...inner] : inner
}
/** 그 카드의 기다림 카드가 화면 읽기에 알리나(그려 본 결과에 알림 칸 role="status") · 조용한가 · 기다림 카드가 없나. */
function waitCardVoice(shotId: string): 'announce' | 'quiet' | 'none' {
  const wait = elements(card(shotId).props.children as ReactNode).find((node) => node.type === NodeWaitCard)
  if (!wait) return 'none'
  return liveParts(wait).some(({ role }) => role === 'status') ? 'announce' : 'quiet'
}
/** 카드 안에서 글이 같은 단추를 누른다. */
function press(cardNode: Element, label: string) {
  const button = elements(cardNode.props.children as ReactNode).find((node) => typeof node.props.onClick === 'function' && textOf(node) === label)
  if (!button) throw new Error(`button ${label} not found`)
  ;(button.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation: () => {} })
}

const PROJECT = 'project-board'
const scene: Scene = {
  sceneId: 'sc_01', sortOrder: 0, location: 'hall', timeOfDay: 'night', mood: '', narrativeSummary: '',
  originalTextQuote: '', charactersPresent: [], estimatedDurationSeconds: 5,
}
const shot = (shotId: string, sortOrder: number, drawn: boolean): Shot => ({
  shotId, sceneId: 'sc_01', sortOrder, shotType: 'MS', actionDescription: `${shotId} 문을 연다`, characters: [], durationSeconds: 5,
  generationMethod: 'T2V', dialogueLines: [], camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
  roughStoryboard: drawn ? ({ status: 'completed', url: `${shotId}.png` } as Shot['roughStoryboard']) : null,
})
const shotIn = (sceneId: string, shotId: string, sortOrder: number, drawn: boolean): Shot => ({ ...shot(shotId, sortOrder, drawn), sceneId })
/** 씬 둘(sc_01 → sc_02)의 보드 — 샷은 주어진 저장 순서 그대로. */
function twoScenes(shots: Shot[]) {
  useWriterStore.setState({ sceneManifest: { scenes: [scene, { ...scene, sceneId: 'sc_02', sortOrder: 1 }], characters: [], locations: [] }, shots })
}

/** 러프 요청(/api/writer/rough-storyboard)이 받은 몸통과, 다음 답. */
const requests: Array<Record<string, unknown>> = []
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true, data: { submitted: [], skipped: [], remaining: 0 } } }
const skippedAs = (shotId: string, reason: string) => ({ status: 200, body: { ok: true, data: { submitted: [], skipped: [{ shotId, reason }], remaining: 0 } } })

beforeEach(() => {
  hooks.slots = []
  hooks.mounted = []
  _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [] })
  board.draw = null
  board.views = null
  requests.length = 0
  vi.mocked(toast.info).mockClear()
  vi.mocked(toast.error).mockClear()
  vi.mocked(recordWriterObservabilityEventClient).mockClear()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'writer' })
  useWriterStore.setState({
    sceneManifest: { scenes: [scene], characters: [], locations: [] },
    shots: [shot('sh_01_01', 0, true), shot('sh_01_02', 1, false)],
    loadProject: vi.fn(async () => {}),
    error: null,
  })
  useWriterUiStore.setState({ setActiveTab: vi.fn() })
  useGlobalChatStore.setState({ offerSuggestion: vi.fn(), messages: [] })
  // 잠금 표시는 document.body 로 띄운다 — 여기서는 그 자리에 그대로 둔다(createPortal 을 걷었다). 샷 더하기는 데모 화면인지 주소 · 쿠키로 본다.
  vi.stubGlobal('document', { body: {}, cookie: '' })
  vi.stubGlobal('window', { location: { pathname: '/studio/writer', search: '' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    if (String(url).startsWith('/api/writer/rough-storyboard')) {
      requests.push(init?.body ? JSON.parse(init.body) : {})
      return { status: reply.status, ok: reply.status < 400, json: async () => reply.body }
    }
    return { status: 200, ok: true, json: async () => ({ ok: true, data: null }) }
  }))
})
afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
})

describe('더한 샷 그리기의 러프 요청', () => {
  // 왜: 2026-11-02 리드 결정 — 카드가 "자리가 나면 바로 그려요"라고 하는데 공용 안내가 "다시 시도해 주세요"라고 하면 서로 어긋난다.
  //   더한 샷의 기다림만 조용히 하고, 카드의 그리기 · 남은 컷 · 진입 자동 그리기 · Artist 의 같은 안내는 지금 그대로 둔다.
  it('더한 샷이 내 한도에 막혀 기다릴 때는 "다시 시도해 주세요" 공용 안내를 띄우지 않고, 다른 길의 안내는 지금 그대로다', async () => {
    render()
    const own = { code: 'quota_exceeded', scope: 'user', category: 'image', queued: 6, limit: 6 }
    reply = { status: 429, body: own }
    expect(await board.draw!('sh_01_02', { redraw: false })).toEqual({ kind: 'user_limit' })
    expect(toast.info).not.toHaveBeenCalled()
    press(card('sh_01_02'), '패널 생성')
    await vi.waitFor(() => expect(toast.info).toHaveBeenCalledWith(
      '이미지는 동시에 6개까지 생성할 수 있어요. 진행 중인 생성이 끝나면 다시 시도해 주세요.', { id: 'generation-quota-exceeded' },
    ))
    vi.mocked(toast.info).mockClear()
    reply = { status: 429, body: { ...own, scope: 'global' } }
    expect(await board.draw!('sh_01_02', { redraw: false })).toMatchObject({ kind: 'stop_all' })
    expect(toast.info).toHaveBeenCalledWith('지금 생성 자리가 모두 사용 중이에요. 잠시 뒤에 다시 시도해 주세요.', { id: 'generation-quota-exceeded' })
    expect(readFileSync('src/stores/artist-store.ts', 'utf8')).not.toContain('notifyQuotaRefusal')
  })

  // 왜: 2026-11-02 리뷰 R7 — 더한 샷 그리기를 진입 자동 그리기(auto)로 보내 기록이 진입 자동 그리기로 남았다(진입 자동 그리기의 횟수 · 실패를 셀 수 없었다).
  //   자동으로 보낸 요청의 기록에 출처를 붙인다(진입 · 펌프 = auto, 더한 샷 = added_shot). 사람이 누른 요청은 지금처럼 기록하지 않는다.
  it('더한 샷 그리기는 진입 자동 그리기로 기록하지 않고 자기 출처(added_shot)로 기록한다', async () => {
    render()
    reply = skippedAs('sh_01_02', 'exists')
    await board.draw!('sh_01_02', { redraw: false })
    expect(requests).toEqual([{ projectId: PROJECT, shotIds: ['sh_01_02'], force: false }])
    expect(recordWriterObservabilityEventClient).toHaveBeenCalledExactlyOnceWith(
      PROJECT, 'auto_submit_response', expect.objectContaining({ auto: false, source: 'added_shot', httpStatus: 200 }),
    )
    vi.mocked(recordWriterObservabilityEventClient).mockClear()
    press(card('sh_01_02'), '패널 생성')
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(recordWriterObservabilityEventClient).not.toHaveBeenCalled()
    expect(autoSubmitEventPayload({ auto: true }, { httpStatus: 200 })).toEqual({ auto: true, source: 'auto', httpStatus: 200 })
  })

  // 왜: 리뷰 R7 — 더한 샷이 반복 실패로 서버에서 멈추면(지운 샷 번호의 옛 실패 등) 안내가 숨고 카드는 [패널 생성]으로 돌아가 왜 안 그려졌는지 몰랐다.
  //   카드에 까닭과 [다시 시도]를 두고(다시 시도는 사람의 덮어 그리기라 서버가 멈추지 않는다), 카드의 그리기와 같은 멈춤 안내도 띄운다.
  it('더한 샷 그리기가 반복 실패로 서버에서 멈추면 멈췄다고 알리고 카드에 까닭과 [다시 시도]를 둔다', async () => {
    render()
    reply = skippedAs('sh_01_02', 'gave_up')
    const outcome = await board.draw!('sh_01_02', { redraw: false })
    expect(outcome).toEqual({ kind: 'failed', reason: '여러 번 실패해 멈췄어요. 다시 시도를 눌러 그려 주세요.' })
    expect(toast.info).toHaveBeenCalledWith('패널 1개는 반복 실패로 자동 생성을 멈췄어요. 카드의 "다시 시도"로 재생성할 수 있어요.')
    board.views = new Map([['sh_01_02', { phase: 'stopped', reason: outcome.kind === 'failed' ? outcome.reason : '' }]])
    const stopped = card('sh_01_02')
    expect(textOf(stopped)).toContain('여러 번 실패해 멈췄어요. 다시 시도를 눌러 그려 주세요.')
    press(stopped, '다시 시도')
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]).toEqual({ projectId: PROJECT, shotIds: ['sh_01_02'], force: true })
  })

  // 왜: 그리는 동안 고친 더한 샷의 한 번 더 그리기는 사람이 누른 것이 아니다 — 그새 다른 곳(채팅 [러프 다시 그리기] 등)이 그 샷을 그리고 있으면
  //   그 그리기가 고친 내용을 그린다. "앞선 생성이 아직 끝나지 않았어요. 다시 눌러주세요" 안내는 사람이 누른 다시 그리기에만 띄운다(정상 경로 고정).
  it('더한 샷의 한 번 더 그리기가 다른 곳에서 그리는 중이라 건너뛰어지면 "다시 눌러주세요" 안내 없이 끝낸다', async () => {
    render()
    reply = skippedAs('sh_01_02', 'in_flight')
    expect(await board.draw!('sh_01_02', { redraw: true })).toEqual({ kind: 'skipped' })
    expect(requests).toEqual([{ projectId: PROJECT, shotIds: ['sh_01_02'], force: true }])
    expect(toast.info).not.toHaveBeenCalled()
    press(card('sh_01_02'), '패널 생성')
    await vi.waitFor(() => expect(toast.info).toHaveBeenCalledWith('패널 1개는 앞선 생성이 아직 끝나지 않았어요. 잠시 후 다시 눌러주세요.'))
  })
})

describe('보드의 더한 샷 카드 · 잠금 · 탭', () => {
  // 왜: 오너 결정 "잠금 없이 카드에서 '그리는 중'으로 보여요" — 보드 잠금(화면 · 채팅을 덮는 표시)은 더한 샷을 세지 않는다.
  it('더한 샷을 그리는 동안 보드와 채팅을 잠그지 않고 그 카드만 그리는 중으로 보인다', () => {
    board.views = new Map([['sh_01_02', { phase: 'requesting' }]])
    commit()
    expect(locked()).toBe(false)
    expect(elements(card('sh_01_02').props.children as ReactNode).some((node) => node.props['aria-busy'] === 'true')).toBe(true)
    // 정상 경로 고정 — 더한 샷이 아닌 샷을 그리는 중이면 지금처럼 잠근다.
    board.views = null
    _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [{ id: 'job-1', kind: 'shot_rough_storyboard', target: { writerShotIds: ['sh_01_02'] } } as never] })
    commit()
    expect(locked()).toBe(true)
  })

  // 왜: 검토 C 2(리드 2026-11-09) — 카드 위 기다림 카드는 바뀌면 읽어 주는 알림인데, "그리는 중" 표시가 그것을 감싸면 화면 읽기 프로그램이
  //   그 표시가 풀릴 때(다 그렸을 때)까지 알림을 미룰 수 있다 — 다 그리면 알림도 사라져 끝내 읽히지 않는다. 잠긴 보드의 가벼운 표시도 같은 규칙이다.
  //   알림 칸은 부품 종류가 아니라 그려 본 결과(role="status")로 찾는다 — 종류로만 찾으면 아무 카드도 알리지 않던 때(announce 전)도 통과했다(검토 C2).
  it('그리는 카드는 그림 칸을 그리는 중으로 표시하고, 기다림 알림은 그 표시 밖에 두어 화면 읽기 프로그램이 미루지 않고 읽는다', () => {
    board.views = new Map([['sh_01_02', { phase: 'requesting' }]])
    commit()
    expect(locked()).toBe(false)
    const unlocked = card('sh_01_02')
    expect(elements(unlocked.props.children as ReactNode).some((node) => node.props['aria-busy'] === 'true')).toBe(true)
    // 그리는 카드 하나 — 그 기다림 카드에 알림 칸이 실제로 있고, "그리는 중" 표시 밖이다.
    expect(liveParts(unlocked)).toEqual([{ part: 'NodeWaitCard', role: 'status', insideBusy: false }])
    // 잠긴 보드(더한 샷이 아닌 샷)의 가벼운 표시 — 그리는 중 띠의 알림 칸도 그 표시 밖이다.
    board.views = null
    _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [{ id: 'job-1', kind: 'shot_rough_storyboard', target: { writerShotIds: ['sh_01_02'] } } as never] })
    commit()
    expect(locked()).toBe(true)
    const lockedCard = card('sh_01_02')
    expect(elements(lockedCard.props.children as ReactNode).some((node) => node.props['aria-busy'] === 'true')).toBe(true)
    expect(liveParts(lockedCard)).toEqual([{ part: 'GeneratingOverlay', role: 'status', insideBusy: false }])
  })

  // 왜: 검토 B 5c(리드 2026-11-09) — 기다림 카드마다 화면 읽기에 알리면, 더한 샷 여럿을 한꺼번에 그릴 때 같은 말을 겹쳐 읽는다.
  //   알리는 카드는 보드 순서(씬 → 샷)로 첫 장 하나 — 저장 순서가 아니라 보이는 순서다. 그 장이 다 그려지면 다음 장이 넘겨받는다.
  it('여러 카드를 한꺼번에 그리면 기다림 카드 중 보드 순서(씬 → 샷)로 첫 장만 화면 읽기에 알린다', () => {
    // 저장 순서는 씬 2 의 샷이 맨 앞이다 — 보드는 씬 1 부터 보인다.
    twoScenes([shotIn('sc_02', 'sh_02_01', 0, false), shot('sh_01_01', 0, true), shot('sh_01_02', 1, false), shot('sh_01_03', 2, false)])
    board.views = new Map([['sh_02_01', { phase: 'requesting' }], ['sh_01_02', { phase: 'requesting' }], ['sh_01_03', { phase: 'requesting' }]])
    commit()
    expect(locked()).toBe(false)
    expect(['sh_01_02', 'sh_01_03', 'sh_02_01'].map(waitCardVoice)).toEqual(['announce', 'quiet', 'quiet'])
    // 첫 장이 다 그려지면 다음 장(같은 씬의 다음 샷)이 알린다.
    twoScenes([shotIn('sc_02', 'sh_02_01', 0, false), shot('sh_01_01', 0, true), shot('sh_01_02', 1, true), shot('sh_01_03', 2, false)])
    board.views = new Map([['sh_02_01', { phase: 'requesting' }], ['sh_01_03', { phase: 'requesting' }]])
    commit()
    expect(['sh_01_02', 'sh_01_03', 'sh_02_01'].map(waitCardVoice)).toEqual(['none', 'announce', 'quiet'])
  })

  // 왜(혼자 정한 것): 접힌 씬의 카드는 화면 읽기에서 숨겨져 그 카드가 알려도 읽히지 않는다 — 첫 장이 접힌 씬에 있으면 아무 카드도 읽히지 않는다.
  it('접힌 씬의 카드는 알릴 카드로 고르지 않고, 펼친 씬에서 그리는 카드 중 첫 장이 알린다', () => {
    twoScenes([shot('sh_01_01', 0, true), shot('sh_01_02', 1, false), shotIn('sc_02', 'sh_02_01', 0, false)])
    board.views = new Map([['sh_01_02', { phase: 'requesting' }], ['sh_02_01', { phase: 'requesting' }]])
    commit()
    expect(['sh_01_02', 'sh_02_01'].map(waitCardVoice)).toEqual(['announce', 'quiet'])
    // 씬 1 머리를 눌러 접는다.
    const head = render().find((node) => node.type === 'button' && 'aria-expanded' in node.props && textOf(node).includes('씬 1'))
    ;(head!.props.onClick as () => void)()
    commit()
    expect(['sh_01_02', 'sh_02_01'].map(waitCardVoice)).toEqual(['quiet', 'announce'])
  })

  // 왜(혼자 정한 것): 대사 탭에서 고치는 중에 채팅으로 더한 샷이 그려지면 보드 탭으로 옮겨져 고치던 칸이 사라졌다 — 더한 샷 그리기는 탭을 바꾸지 않는다.
  it('더한 샷을 그리는 중이면 대사 탭을 보고 있어도 보드 탭으로 옮기지 않는다', () => {
    board.views = new Map([['sh_01_02', { phase: 'drawing' }]])
    _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [{ id: 'job-1', kind: 'shot_rough_storyboard', target: { writerShotIds: ['sh_01_02'] } } as never] })
    commit()
    const setActiveTab = useWriterUiStore.getState().setActiveTab
    expect(setActiveTab).not.toHaveBeenCalled()
    // 정상 경로 고정 — 더한 샷이 아닌 샷을 그리기 시작하면 지금처럼 보드 탭으로 옮긴다.
    _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [{ id: 'job-2', kind: 'shot_rough_storyboard', target: { writerShotIds: ['sh_01_01', 'sh_01_02'] } } as never] })
    commit()
    expect(setActiveTab).toHaveBeenCalledWith('storyboard')
  })

  // 왜: 기다리는 카드가 그리는 중처럼 돌면 사람은 왜 안 끝나는지 모른다 — 자리를 기다린다고 알린다.
  it('자리를 기다리는 더한 샷 카드에는 "자리가 나면 바로 그려요"가 보인다', () => {
    board.views = new Map([['sh_01_02', { phase: 'waiting' }]])
    const waiting = card('sh_01_02')
    expect(textOf(waiting)).toContain('자리가 나면 바로 그려요')
    expect(elements(waiting.props.children as ReactNode).some((node) => node.props['aria-busy'] === 'true')).toBe(false)
  })

  // 왜: 리드 지시(들어올 때 빠진 러프 자동 그리기는 그대로) — 더한 샷은 화면에 넣는 그 순간 더한 샷 그리기가 맡아 빠진 러프로 세지 않는다.
  //   2026-11-02 리뷰 R2 — 스토리 없이 더한 샷에 스토리를 쓰면 빠진 러프로 세어져 진입 자동 그리기가 깨고 보드 · 채팅이 잠겼다(예전 이 검사는 소스 글만 봐서 놓쳤다).
  it('들어올 때 빠진 러프를 자동으로 그리는 것은 그대로 두고, 더한 샷은 빠진 러프로 세지 않는다', async () => {
    useProjectStore.setState({ projectId: 'project-entry' })
    _setGenerationQueueSnapshotForTests({ projectId: 'project-entry', jobs: [] })
    commit()
    await vi.waitFor(() => expect(requests).toEqual([{ projectId: 'project-entry', force: false }]))
    unmount()
    requests.length = 0
    useProjectStore.setState({ projectId: 'project-added' })
    _setGenerationQueueSnapshotForTests({ projectId: 'project-added', jobs: [] })
    useWriterStore.setState({ shots: [shot('sh_01_01', 0, true)] })
    commit()
    const id = await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '' } })
    await vi.waitFor(() => { commit(); expect(textOf(card(id!))).toContain('스토리(액션)를 입력하면 생성할 수 있어요') })
    useWriterStore.getState().updateShot(id!, { actionDescription: '민호가 돌아선다.' })
    commit()
    expect(locked()).toBe(false)
    reply = { status: 200, body: { ok: true, data: { submitted: [{ shotId: id, jobId: 'job-added' }], skipped: [], remaining: 0 } } }
    await vi.waitFor(() => { commit(); expect(requests).toEqual([{ projectId: 'project-added', shotIds: [id], force: false }]) })
    commit()
    expect(requests).toHaveLength(1)
    expect(locked()).toBe(false)
  })
})

describe('그려 둔 더한 샷의 다시 그리기', () => {
  const inCard = (shotId: string) => elements(card(shotId).props.children as ReactNode)

  // 왜: 2026-11-02 최종 리뷰 L2 — 다시 그리기가 내 한도를 기다리거나 멈추면 카드는 고치기 전 그림만 보여 줬다. 그림은 그대로 두고
  //   그 아래에 기다림("자리가 나면 고친 내용으로 다시 그려요") · 멈춤(까닭과 [다시 시도])을 보인다. [다시 시도]는 고친 내용으로 덮어 그린다.
  it('그려 둔 그림 아래에 다시 그리기의 기다림 · 멈춤을 보이고, 멈췄으면 [다시 시도]로 고친 내용을 덮어 그린다', async () => {
    board.views = new Map([['sh_01_01', { phase: 'waiting', redraw: true }]])
    expect(inCard('sh_01_01').some((node) => node.type === RoughFrameCycle)).toBe(true)
    let status = inCard('sh_01_01').find((node) => node.type === AddedRedrawStatus)!
    expect(renderPart(status).map(textOf).join(' ')).toContain('자리가 나면 고친 내용으로 다시 그려요')
    board.views = new Map([['sh_01_01', { phase: 'stopped', redraw: true, noSlot: true }]])
    expect(inCard('sh_01_01').some((node) => node.type === RoughFrameCycle)).toBe(true)
    status = inCard('sh_01_01').find((node) => node.type === AddedRedrawStatus)!
    const stopped = renderPart(status)
    expect(stopped.map(textOf).join(' ')).toContain('30분 동안 자리가 나지 않아 고친 내용으로 다시 그리지 못했어요.')
    const retry = stopped.find((node) => typeof node.props.onClick === 'function' && textOf(node) === '다시 시도')!
    ;(retry.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation: () => {} })
    await vi.waitFor(() => expect(requests).toEqual([{ projectId: PROJECT, shotIds: ['sh_01_01'], force: true }]))
    // 정상 경로 고정 — 다시 그리기가 없는 그려 둔 샷에는 아무것도 붙지 않는다.
    expect(inCard('sh_01_02').some((node) => node.type === AddedRedrawStatus)).toBe(false)
  })

  // 왜(혼자 정한 것): 그려 둔 샷을 다시 그릴 때는 옛 그림도 "다 그림"이라 보드의 그리기 끝이 실패한 작업도 그려짐으로 읽었다 —
  //   그림이 정말 바뀌었을 때만 그려짐으로 본다(바뀌지 않았으면 장부가 멈춤으로 까닭과 [다시 시도]를 둔다).
  it('그려 둔 그림을 다시 그린 작업이 실패해 그림이 그대로면 그려지지 않은 것으로 본다', async () => {
    render()
    reply = { status: 200, body: { ok: true, data: { submitted: [{ shotId: 'sh_01_01', jobId: 'job-redraw' }], skipped: [], remaining: 0 } } }
    vi.mocked(pollGenerationJob).mockRejectedValueOnce(new Error('job failed'))
    const failed = await board.draw!('sh_01_01', { redraw: true })
    expect(failed.kind === 'submitted' ? await failed.done : failed.kind).toBe('failed')
    // 정상 경로 고정 — 새 그림이 앉으면 그려짐이다.
    useWriterStore.setState({
      loadProject: vi.fn(async () => {
        useWriterStore.setState({
          shots: useWriterStore.getState().shots.map((s) => (s.shotId === 'sh_01_01' ? { ...s, roughStoryboard: { ...s.roughStoryboard!, url: 'sh_01_01.png?v=2' } } : s)),
        })
      }),
    })
    hooks.slots = []
    render()
    vi.mocked(pollGenerationJob).mockResolvedValueOnce(undefined as never)
    const redrawn = await board.draw!('sh_01_01', { redraw: true })
    expect(redrawn.kind === 'submitted' ? await redrawn.done : redrawn.kind).toBe('drawn')
  })
})

describe('[+ 샷 추가] 창', () => {
  const twoScenes = () => {
    const second: Scene = { ...scene, sceneId: 'sc_02', sortOrder: 1 }
    useWriterStore.setState({
      sceneManifest: { scenes: [scene, second], characters: [], locations: [] },
      shots: [shot('sh_01_01', 0, true), shot('sh_01_02', 1, true), { ...shot('sh_02_01', 2, true), sceneId: 'sc_02' }],
    })
  }
  const dialog = () => {
    hooks.cursor = 0
    hooks.effects = []
    return elements(AddItemDialog({ open: true, mode: 'shot', contextSceneId: 'sc_02', onOpenChange: () => {} }))
  }

  // 왜: 샷을 더하면 돈이 드는 그림이 바로 생긴다 — 더하기 전에 알려 준다(스토리가 비면 그리지 않는다는 것도).
  it('[+ 샷 추가] 창은 더하면 스토리로 러프를 바로 그린다고 알려 준다', () => {
    const key = 'Adding the shot draws its rough from the story right away. Nothing is drawn while the story is empty.'
    expect(KO[key]).toBe('샷을 더하면 스토리로 러프를 바로 그려요. 스토리가 비어 있으면 그리지 않아요.')
    expect(dialog().some((node) => textOf(node) === KO[key])).toBe(true)
  })

  // 왜: 오너 11/2 "전체 번호로 통일" — 어디에 더할지 고르는 목록의 "샷 3"이 보드 카드 "씬 2 · 샷 3"과 다르면 다른 샷 뒤에 더한다.
  //   이 시험은 한국어 화면이라 이름이 한국어다(오너 2026-11-14 답 7 — 예전에는 한국어 화면도 "Shot 3" · "Scene 2 · Shot 3").
  it('[+ 샷 추가] 창 왼쪽 목록의 샷 번호는 보드 카드와 같은 전체 번호다', () => {
    twoScenes()
    const listed = dialog().filter((node) => node.type === 'span' && /^샷 \d+$/.test(textOf(node))).map(textOf)
    expect(listed).toEqual(['샷 1', '샷 2', '샷 3'])
    hooks.slots = []
    const cardLabel = elements(card('sh_02_01').props.children as ReactNode).find((node) => node.type === 'span' && textOf(node).startsWith('씬 '))
    expect(textOf(cardLabel)).toBe('씬 2 · 샷 3')
  })
})
