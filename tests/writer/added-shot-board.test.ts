// Storyboard 보드가 더한 샷을 보드의 러프 요청으로 그릴 때 남기는 기록 · 띄우는 안내 · 카드 표시를, 보드 화면 함수를 직접 불러 검사한다
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'
import type { AddedDrawView, DrawAddedShot } from '@/lib/writer/added-shot-draws'

// 화면 함수를 직접 부른다(브라우저 없이) — 훅은 자리 순서대로 값을 지키고, 효과는 바뀐 deps 만 다시 돈다(React 와 같은 규칙).
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
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
        hooks.slots[slot] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(hooks.slots[slot]) : value
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
vi.mock('@/lib/writer/debug-events-client', () => ({ recordWriterObservabilityEventClient: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined), loadShotsResult: vi.fn() }))
vi.mock('@/lib/generation-queue', async (original) => ({ ...(await original<typeof import('@/lib/generation-queue')>()), refreshGenerationQueue: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { toast } from 'sonner'
import { RoughStoryboardView } from '@/features/writer/rough-storyboard-view'
import { autoSubmitEventPayload } from '@/lib/writer/added-shot-draws'
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
/** 그 샷의 카드. */
function card(shotId: string): Element {
  const found = render().find((node) => node.type === 'article' && node.key === shotId)
  if (!found) throw new Error(`card ${shotId} not rendered`)
  return found
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

/** 러프 요청(/api/writer/rough-storyboard)이 받은 몸통과, 다음 답. */
const requests: Array<Record<string, unknown>> = []
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true, data: { submitted: [], skipped: [], remaining: 0 } } }
const skippedAs = (shotId: string, reason: string) => ({ status: 200, body: { ok: true, data: { submitted: [], skipped: [{ shotId, reason }], remaining: 0 } } })

beforeEach(() => {
  hooks.slots = []
  hooks.mounted = []
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
  // 잠금 표시는 document.body 로 띄운다 — 여기서는 그 자리에 그대로 둔다(createPortal 을 걷었다).
  vi.stubGlobal('document', { body: {} })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    if (String(url).startsWith('/api/writer/rough-storyboard')) {
      requests.push(init?.body ? JSON.parse(init.body) : {})
      return { status: reply.status, ok: reply.status < 400, json: async () => reply.body }
    }
    return { status: 200, ok: true, json: async () => ({ ok: true, data: null }) }
  }))
})
afterEach(() => {
  for (const mounted of hooks.mounted) if (typeof mounted?.cleanup === 'function') mounted.cleanup()
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
