// 샷 없는 독립 영상의 왼쪽 패널 · 영상 팝업 [영상 재생성]도 Take 잔액을 못 읽으면 값을 보이고, 누를 때 다시 읽어 못 읽으면 시작하지 않고 단추 아래에 까닭을 보이며, 읽는 동안 꺼진다 (통합 검토 a · 리드 2026-11-14 · 샷 상세와 같은 말)
import { beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))
const takes = vi.hoisted(() => ({ state: {} as Record<string, unknown>, fetch: vi.fn() }))
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
      hooks.slots[slot] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(hooks.slots[slot]) : value
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
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => takes.state, fetchTakeBalance: takes.fetch }))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))

import { VideoDetailPanel } from '@/features/director/canvas-panels/VideoDetailPanel'
import { VideoNodePopup } from '@/features/director/canvas-popups/VideoNodePopup'
import { Button } from '@/components/ui/button'
import { TAKES_UNKNOWN_TEXT } from '@/features/director/takes-check'
import { createDefaultStandaloneVideoConfig } from '@/lib/director/standalone-video'
import { translate } from '@/lib/i18n/translate'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { VideoNodeData } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>
type Surface = (props: { nodeId: string; data: VideoNodeData }) => ReactNode
const STANDALONE_ID = 'standalone-video-1'
const STANDALONE_ID_2 = 'standalone-video-2'
let takeId: string
let takeId2: string
// 샷 없는 독립 영상은 노드형 왼쪽 패널에서 연다. 영상 팝업은 마더 샷이 있는 Take 만 그린다(샷의 Take 는 이제 새 샷 상세로 가서
//   화면에서는 닿지 않지만, 같은 단추 꼴이라 같은 규칙을 건다).
const SURFACES = [
  ['독립 영상 왼쪽 패널', VideoDetailPanel, () => STANDALONE_ID, () => [STANDALONE_ID, STANDALONE_ID_2] as const],
  ['영상 팝업', VideoNodePopup, () => takeId, () => [takeId, takeId2] as const],
] as const
const FAILED = { balance: null, mode: 'off', loading: false, failed: true }
const READ = { balance: 100, mode: 'shadow', loading: false, failed: false }
const REGENERATE = translate('ko', 'Regenerate video')
const UNKNOWN = translate('ko', TAKES_UNKNOWN_TEXT)

// 함수 컴포넌트는 펼치지 않고 요소만 따라간다 — Take 표시 조각만 펼쳐 본다.
const EXPAND = new Set(['VideoTakeCost'])
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  if (typeof node.type === 'function' && EXPAND.has(node.type.name)) {
    return elements((node.type as (props: Record<string, unknown>) => ReactNode)(node.props))
  }
  return [node, ...elements(node.props.children as ReactNode)]
}
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : ''
}
function render(surface: Surface, id: string): Element[] {
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === id)!.data as VideoNodeData
  return elements(surface({ nodeId: id, data }))
}
function regenerate(nodes: Element[]): Element {
  const found = nodes.find((node) => node.type === Button && textOf(node).includes(REGENERATE))
  expect(found, REGENERATE).toBeDefined()
  return found!
}
const takeValues = (nodes: Element[]) => nodes.filter((node) => node.type === 'span' && /^Take \d+개$/.test(textOf(node)))
const reasonAt = (nodes: Element[]) => nodes.findIndex((node) => node.type === 'p' && textOf(node) === UNKNOWN)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  takes.state = { ...READ }
  takes.fetch.mockReset()
  useLocaleStore.setState({ locale: 'ko' })
  const data: VideoNodeData = {
    kind: 'video', label: 'Video', parentShotNodeId: null, standaloneVideoKey: 'standalone-1', videoClipId: 'clip-standalone', takeNumber: 1,
    generationJobId: null, lastAttemptStatus: 'completed', lastAttemptError: null, lastAttemptAt: null, createdAt: '2026-11-14T00:00:00.000Z',
    override: { ...createDefaultStandaloneVideoConfig(), prompt: 'A cat walks along a rainy rooftop.' },
    frameInputs: { start: null, end: null, refs: [] }, videoChainInputId: null, videoChainFrameUrl: null,
    videoUrl: 'https://media.test/standalone.mp4', thumbnailUrl: null, status: 'completed', errorMessage: null, final: false, stale: false, adherence: null,
  } as unknown as VideoNodeData
  const second = { ...data, standaloneVideoKey: 'standalone-2', videoClipId: 'clip-standalone-2', videoUrl: 'https://media.test/standalone-2.mp4' }
  director.setState({ projectId: 'standalone-balance-project', nodes: [
    { id: STANDALONE_ID, type: 'video', position: { x: 0, y: 0 }, data },
    { id: STANDALONE_ID_2, type: 'video', position: { x: 400, y: 0 }, data: second },
  ], edges: [], popupNodeId: null } as never)
  const takeOn = (writerShotId: string, y: number) => {
    const shotId = director.getState().addShotNode(null, { x: 0, y })
    director.getState().updateNodeData<'shot'>(shotId, { writerShotId, provider: 'seedance' })
    const id = director.getState().addVideoTake(shotId)!
    director.getState().updateNodeData<'video'>(id, { videoClipId: `clip-${writerShotId}`, status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://media.test/${writerShotId}.mp4` })
    return id
  }
  takeId = takeOn('shot-1', 400)
  takeId2 = takeOn('shot-2', 800)
})

it.each(SURFACES)('Take 잔액을 읽지 못해도 [영상 재생성] 옆 Take 값을 그대로 보인다 (%s)', (_name, surface, idOf) => {
  // 왜: [영상 재생성]은 확인 창 없이 바로 Take 를 쓰는 자리라 옆에 적힌 값이 곧 동의다 — 잔액을 잠깐 못 읽었다고 숨기면 얼마가 드는지 모른 채 누른다.
  takes.state = { ...FAILED }
  expect(takeValues(render(surface, idOf()))).toHaveLength(1)
})

it.each(SURFACES)('과금이 꺼진 계정이면 [영상 재생성] 옆에 Take 값을 적지 않는다 (%s)', (_name, surface, idOf) => {
  // 왜: 정상 경로 고정 — 값을 숨기는 것은 과금이 정말 꺼졌을 때뿐이다.
  takes.state = { balance: null, mode: 'off', loading: false, failed: false }
  expect(takeValues(render(surface, idOf()))).toHaveLength(0)
})

it.each(SURFACES)('[영상 재생성]을 누를 때 Take 잔액을 다시 읽지 못하면 시작하지 않고 단추 아래에 까닭을 보인다 (%s)', async (_name, surface, idOf) => {
  // 왜: 잔액을 모르는 채 시작하면 동의 없이 Take 가 빠질 수 있다 — 누르는 순간 한 번 더 읽고, 그래도 모르면 멈추고 그 단추 아래에 알린다.
  takes.state = { ...FAILED }
  takes.fetch.mockResolvedValue({ ...FAILED })
  const regen = vi.fn().mockResolvedValue(true)
  director.setState({ regenerateVideo: regen } as never)
  ;(regenerate(render(surface, idOf())).props.onClick as () => void)()
  await flush()
  expect(takes.fetch).toHaveBeenCalledTimes(1)
  expect(regen).not.toHaveBeenCalled()
  const after = render(surface, idOf())
  expect(reasonAt(after)).toBeGreaterThan(after.indexOf(regenerate(after)))
  expect(regenerate(after).props.disabled).toBe(false)
})

it.each(SURFACES)('까닭이 보인 뒤 다시 눌러 Take 잔액이 읽히면 다시 만들기를 시작하고 까닭 줄을 지운다 (%s)', async (_name, surface, idOf) => {
  // 왜: 잠깐 못 읽은 것이면 다시 눌러 바로 만든다 — 옛 까닭이 남으면 시작했는데도 못 한 것처럼 보인다.
  takes.state = { ...FAILED }
  takes.fetch.mockResolvedValueOnce({ ...FAILED }).mockResolvedValueOnce({ ...READ })
  const regen = vi.fn().mockResolvedValue(true)
  director.setState({ regenerateVideo: regen } as never)
  ;(regenerate(render(surface, idOf())).props.onClick as () => void)()
  await flush()
  expect(reasonAt(render(surface, idOf()))).toBeGreaterThanOrEqual(0)
  ;(regenerate(render(surface, idOf())).props.onClick as () => void)()
  await flush()
  expect(regen).toHaveBeenCalledExactlyOnceWith(idOf())
  expect(reasonAt(render(surface, idOf()))).toBe(-1)
})

it.each(SURFACES)('[영상 재생성]은 Take 잔액을 다시 읽는 동안 꺼지고 두 번 눌러도 한 번만 시작한다 (%s)', async (_name, surface, idOf) => {
  // 왜: 검토 b 탐침 D4 와 같은 꼴 — 다시 읽는 동안 켜져 있으면 두 번 눌러 Take 가 두 번 나갈 수 있다.
  let release!: (value: unknown) => void
  takes.fetch.mockReturnValue(new Promise((resolve) => { release = resolve }))
  const regen = vi.fn().mockResolvedValue(true)
  director.setState({ regenerateVideo: regen } as never)
  const first = regenerate(render(surface, idOf()))
  ;(first.props.onClick as () => void)()
  const reading = regenerate(render(surface, idOf()))
  expect(reading.props.disabled).toBe(true)
  ;(reading.props.onClick as () => void)()
  ;(first.props.onClick as () => void)()
  release({ ...READ })
  await flush()
  expect(regen).toHaveBeenCalledExactlyOnceWith(idOf())
})

it.each(SURFACES)('읽는 사이 다른 영상으로 바꿔 누르면 앞 영상 읽기가 끝나도 뒤 영상 단추는 꺼진 채다 (%s)', async (_name, surface, _idOf, pairOf) => {
  // 왜: 검토 b(탐침 R1) — 읽는 중 칸이 한 칸이라 앞 영상 읽기가 끝나며 뒤 영상 단추까지 켰다. 그때 다시 누르면 뒤 영상이 두 번 불렸다(Take 는 잠금이 막음).
  const [first, second] = pairOf()
  const pending: Array<(value: unknown) => void> = []
  takes.fetch.mockImplementation(() => new Promise((resolve) => { pending.push(resolve) }))
  const regen = vi.fn().mockResolvedValue(true)
  director.setState({ regenerateVideo: regen } as never)
  ;(regenerate(render(surface, first)).props.onClick as () => void)()
  ;(regenerate(render(surface, second)).props.onClick as () => void)()
  pending[0]({ ...READ })
  await flush()
  const reading = regenerate(render(surface, second))
  expect(reading.props.disabled).toBe(true)
  ;(reading.props.onClick as () => void)()
  expect(takes.fetch).toHaveBeenCalledTimes(2)
  pending[1]({ ...READ })
  await flush()
  expect(regenerate(render(surface, second)).props.disabled).toBe(false)
  expect(regen.mock.calls.map((call) => call[0])).toEqual([first, second])
})

it.each(SURFACES)('까닭 줄은 영상마다 따로라, 다른 영상을 눌러 시작해도 앞 영상의 까닭 줄은 남는다 (%s)', async (_name, surface, _idOf, pairOf) => {
  // 왜: 검토 b(탐침 R4) — 까닭 칸이 한 칸이라 다른 영상을 누르면 앞 영상의 까닭이 사라졌다. 앞 영상은 여전히 시작하지 않았다.
  const [first, second] = pairOf()
  takes.state = { ...FAILED }
  takes.fetch.mockResolvedValueOnce({ ...FAILED }).mockResolvedValueOnce({ ...READ })
  director.setState({ regenerateVideo: vi.fn().mockResolvedValue(true) } as never)
  ;(regenerate(render(surface, first)).props.onClick as () => void)()
  await flush()
  expect(reasonAt(render(surface, first))).toBeGreaterThanOrEqual(0)
  expect(reasonAt(render(surface, second))).toBe(-1)
  ;(regenerate(render(surface, second)).props.onClick as () => void)()
  await flush()
  expect(reasonAt(render(surface, first))).toBeGreaterThanOrEqual(0)
})
