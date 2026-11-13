// 샷 상세의 Take 값 단추는 Take 잔액을 못 읽어도 값을 보이고, 누를 때 다시 읽어 못 읽으면 시작하지 않고 단추 아래에 까닭을 보인다 (리드 2026-11-14 · entry D8 과 같은 말)
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
vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
  refreshGenerationQueue: vi.fn(),
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => takes.state, fetchTakeBalance: takes.fetch }))

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { ShotVideoTab } from '@/features/director/shot-detail/shot-video-tab'
import { Button } from '@/components/ui/button'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { type ShotNodeData } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>
const UNKNOWN = 'Take 를 확인하지 못해 시작하지 않았어요. 잠시 뒤 다시 눌러 주세요.'
const FAILED = { balance: null, mode: 'off', loading: false, failed: true }
const READ = { balance: 100, mode: 'shadow', loading: false, failed: false }
let shotId: string

/** 이 파일이 펼쳐 보는 부품만 그 자리에서 그린다(나머지는 요소 그대로). */
function elements(node: ReactNode, expand: ReadonlySet<string>): Element[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, expand))
  if (!isValidElement<Record<string, unknown>>(node)) return []
  if (typeof node.type === 'function' && expand.has(node.type.name)) {
    return elements((node.type as (props: Record<string, unknown>) => ReactNode)(node.props), expand)
  }
  return [node, ...elements(node.props.children as ReactNode, expand)]
}
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : ''
}
const shotData = () => director.getState().nodes.find((node) => node.id === shotId)!.data as ShotNodeData
function videoTab(): Element[] {
  hooks.cursor = 0
  return elements(ShotVideoTab({ shotNodeId: shotId, data: shotData(), layout: 'popup', initialTakeId: null }), new Set(['FixVideo']))
}
function detail(): Element[] {
  hooks.cursor = 0
  return elements(DirectorShotDetail({ shotNodeId: shotId, initialTab: 'image', layout: 'popup', onClose: () => {} }), new Set(['ShotImageTab']))
}
function button(nodes: Element[], prefix: string): Element {
  const found = nodes.find((node) => node.type === Button && textOf(node).startsWith(prefix))
  expect(found, prefix).toBeDefined()
  return found!
}
const hasText = (nodes: Element[], text: string) => nodes.some((node) => node.type === 'p' && textOf(node) === text)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const cost = takeCostForVideo('seedance', '720p')

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  takes.state = { ...READ }
  takes.fetch.mockReset()
  director.setState({ projectId: 'balance-project', nodes: [], edges: [], realBatchBusy: false, videoBatchBusy: false, generatingNodeIds: {} })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, {
    writerShotId: 'shot-1',
    provider: 'seedance',
    promptOverride: 'A girl shivers under the eaves.',
    storyboardImage: { url: 'https://media.test/start.png', status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'https://media.test/start.png', end: 'https://media.test/end.png' } } as never,
  })
  useLocaleStore.setState({ locale: 'ko' })
})

function addDoneTake() {
  const take = director.getState().addVideoTake(shotId)!
  director.getState().updateNodeData<'video'>(take, { videoClipId: 'clip-1', status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://media.test/take1.mp4' })
}

it('Take 잔액을 읽지 못해도 샷 상세 영상 탭의 Take 값 단추는 값을 그대로 보인다', () => {
  // 왜: 영상 탭 단추는 확인 창 없이 바로 Take 를 쓰는 자리라 단추에 적힌 값이 곧 동의다 — 잔액을 잠깐 못 읽었다고 값을 숨기면 얼마가 드는지 모른 채 누른다(entry D8 과 같은 말).
  takes.state = { ...FAILED }
  expect(textOf(button(videoTab(), '영상 만들기'))).toBe(`영상 만들기 · ${cost} Take`)
  addDoneTake()
  hooks.slots = []
  expect(textOf(button(videoTab(), '새 Take 만들기'))).toBe(`새 Take 만들기 · ${cost} Take`)
})

it('과금이 꺼진 계정이면 샷 상세의 Take 값 단추에 값을 적지 않는다', () => {
  // 왜: 정상 경로 고정 — 값을 숨기는 것은 과금이 정말 꺼졌을 때뿐이다.
  takes.state = { balance: null, mode: 'off', loading: false, failed: false }
  addDoneTake()
  expect(textOf(button(videoTab(), '새 Take 만들기'))).toBe('새 Take 만들기')
  hooks.slots = []
  expect(textOf(button(detail(), '다음: 영상 만들기'))).toBe('다음: 영상 만들기')
})

it('샷 상세 영상 탭의 Take 값 단추를 누를 때 Take 잔액을 다시 읽지 못하면 시작하지 않고 단추 아래에 까닭을 보인다', async () => {
  // 왜: 잔액을 모르는 채 시작하면 단추 값이라는 동의 없이 Take 가 빠질 수 있다 — 누르는 그 순간에 한 번 더 읽고, 그래도 모르면 멈추고 까닭을 알린다.
  takes.state = { ...FAILED }
  takes.fetch.mockResolvedValue({ ...FAILED })
  const make = vi.fn().mockResolvedValue('take-new')
  director.setState({ generateVideoForShot: make } as never)
  addDoneTake()
  ;(button(videoTab(), '새 Take 만들기').props.onClick as () => void)()
  await flush()
  expect(takes.fetch).toHaveBeenCalledTimes(1)
  expect(make).not.toHaveBeenCalled()
  const after = videoTab()
  expect(hasText(after, UNKNOWN)).toBe(true)
  expect(button(after, '새 Take 만들기').props.disabled).toBe(false)
})

it('까닭이 보인 뒤 다시 누르면 까닭 줄을 지우고, 그때 Take 잔액이 읽히면 만들기를 시작한다', async () => {
  // 왜: 잠깐 못 읽은 것이면 다시 눌러 바로 만든다 — 옛 까닭이 남아 있으면 시작했는데도 못 한 것처럼 보인다.
  takes.state = { ...FAILED }
  takes.fetch.mockResolvedValueOnce({ ...FAILED }).mockResolvedValueOnce({ ...READ })
  const make = vi.fn().mockResolvedValue('take-new')
  director.setState({ generateVideoForShot: make } as never)
  addDoneTake()
  ;(button(videoTab(), '새 Take 만들기').props.onClick as () => void)()
  await flush()
  expect(hasText(videoTab(), UNKNOWN)).toBe(true)
  ;(button(videoTab(), '새 Take 만들기').props.onClick as () => void)()
  await flush()
  expect(make).toHaveBeenCalledTimes(1)
  expect(make.mock.calls[0][0]).toBe(shotId)
  expect(hasText(videoTab(), UNKNOWN)).toBe(false)
})

it('Take 잔액을 읽지 못해도 이미지 탭의 [다음: 영상 만들기 · N Take]는 Take 값을 그대로 보인다', () => {
  // 왜: 이미지 탭의 이 단추도 누르면 확인 창 없이 Take 를 쓰는 자리다(영상 탭과 같은 꼴).
  takes.state = { ...FAILED }
  expect(textOf(button(detail(), '다음: 영상 만들기'))).toBe(`다음: 영상 만들기 · ${cost} Take`)
})

it('이미지 탭의 [다음: 영상 만들기 · N Take]를 누를 때 Take 잔액을 다시 읽지 못하면 시작하지 않고 이미지 탭에 남아 단추 아래에 까닭을 보인다', async () => {
  // 왜: 영상 탭으로 넘어가 버리면 왜 시작하지 않았는지 볼 자리가 없다 — 누른 단추 아래에 알린다.
  takes.state = { ...FAILED }
  takes.fetch.mockResolvedValue({ ...FAILED })
  const remake = vi.fn().mockResolvedValue('take-new')
  director.setState({ remakeShotVideo: remake } as never)
  ;(button(detail(), '다음: 영상 만들기').props.onClick as () => void)()
  await flush()
  expect(takes.fetch).toHaveBeenCalledTimes(1)
  expect(remake).not.toHaveBeenCalled()
  const after = detail()
  expect(after.some((node) => typeof node.type === 'function' && node.type.name === 'ShotVideoTab')).toBe(false)
  expect(hasText(after, UNKNOWN)).toBe(true)
})

it('이미지 탭에서 까닭이 보인 뒤 다시 눌러 Take 잔액이 읽히면 만들기를 시작하고 영상 탭으로 넘어가며 까닭 줄을 지운다', async () => {
  // 왜: 다시 눌러 읽히면 그때 바로 만든다(영상 탭 단추와 같은 규칙).
  takes.state = { ...FAILED }
  takes.fetch.mockResolvedValueOnce({ ...FAILED }).mockResolvedValueOnce({ ...READ })
  const remake = vi.fn().mockResolvedValue('take-new')
  director.setState({ remakeShotVideo: remake } as never)
  ;(button(detail(), '다음: 영상 만들기').props.onClick as () => void)()
  await flush()
  ;(button(detail(), '다음: 영상 만들기').props.onClick as () => void)()
  await flush()
  expect(remake).toHaveBeenCalledExactlyOnceWith(shotId)
  const after = detail()
  expect(after.some((node) => typeof node.type === 'function' && node.type.name === 'ShotVideoTab')).toBe(true)
  expect(hasText(after, UNKNOWN)).toBe(false)
})
