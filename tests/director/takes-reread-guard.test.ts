// 바로 시작하는 영상 단추는 Take 잔액을 다시 읽는 동안 꺼지고, 그사이 두 번 눌러도 한 번만 시작한다 (리드 11/14 검토 b 낮음 2 · prose 이미지 탭과 같은 꼴)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

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
    return [hooks.slots[slot], (value: unknown) => { hooks.slots[slot] = value }]
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
const balance = vi.hoisted(() => ({ failed: false }))
vi.mock('@/lib/billing/use-take-balance', () => ({
  useTakeBalance: () => ({ balance: balance.failed ? null : 100, mode: balance.failed ? 'off' : 'shadow', loading: false, failed: balance.failed }),
}))
const takes = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/features/director/takes-check', () => ({
  TAKES_UNKNOWN_TEXT: "I couldn't check your Takes, so I didn't start. Please try again in a moment.",
  takesReadable: () => takes.read(),
}))

import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'
import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!isValidElement<Record<string, unknown>>(node)) return ''
  return textOf(node.props.children as ReactNode)
}
function render(component: unknown, id: string): Element[] {
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === id)!.data
  const impl = (component as { type: (props: Record<string, unknown>) => ReactNode }).type
  return elements(impl({ id, data, selected: false }))
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
const event = { stopPropagation: () => {} }

let shotId: string
let videoId: string
let release: (value: boolean) => void
const generate = vi.fn()

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  balance.failed = false
  generate.mockReset()
  takes.read.mockReset()
  takes.read.mockReturnValue(new Promise<boolean>((resolve) => { release = resolve }))
  director.setState({
    projectId: 'reread-guard-project', nodes: [], edges: [], popupNodeId: null, selectedNodeId: null,
    videoBatchBusy: false, videoBatchProgress: null, videoBatchQueue: null, videoBatchCancelled: false, realBatchBusy: false,
  })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { label: 'Shot 1', writerShotId: 'w1' })
  videoId = director.getState().addVideoTake(shotId)!
  director.getState().updateNodeData<'video'>(videoId, { status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://media.test/1.mp4' })
  director.setState({ generateVideoForShot: generate } as never)
  useLocaleStore.setState({ locale: 'ko' })
})

describe('혼자 정한 것', () => {
  it('Take 노드 [영상 리테이크]는 Take 잔액을 다시 읽는 동안 꺼지고, 그사이 두 번 눌러도 한 번만 시작한다', async () => {
    // 왜: 검토 b 낮음 2 — 읽는 동안 단추가 켜져 있으면 두 번 눌러 새 Take 가 두 번 나갈 수 있다(샷 잠금이 일찍 풀리면 Take 가 하나 더).
    const retake = () => render(VideoNode, videoId).find((el) => textOf(el.props.children as ReactNode).includes('영상 리테이크') && typeof el.props.onClick === 'function')!
    const first = retake()
    void (first.props.onClick as (e: unknown) => Promise<void>)(event)
    const reading = retake()
    expect(reading.props.disabled).toBe(true)
    void (reading.props.onClick as (e: unknown) => Promise<void>)(event)
    void (first.props.onClick as (e: unknown) => Promise<void>)(event)
    release(true)
    await flush()
    expect(generate).toHaveBeenCalledTimes(1)
    expect(retake().props.disabled).toBe(false)
  })

  it('샷 노드에서 가지를 내어 바로 만들 때 Take 잔액을 다시 읽는 동안 가지 단추가 꺼지고, 그사이 두 번 눌러도 한 번만 시작한다', async () => {
    // 왜: 가지 내기도 바로 Take 를 쓰는 길이다 — 같은 틈(검토 b 낮음 2).
    const base = () => render(ShotNode, shotId).find((el) => typeof el.props.onBranch === 'function')!
    const first = base()
    expect(first.props.canBranch).toBe(true)
    void (first.props.onBranch as () => Promise<void>)()
    const reading = base()
    expect(reading.props.canBranch).toBe(false)
    void (reading.props.onBranch as () => Promise<void>)()
    void (first.props.onBranch as () => Promise<void>)()
    release(true)
    await flush()
    expect(generate).toHaveBeenCalledTimes(1)
    expect(base().props.canBranch).toBe(true)
  })

  it('러프 보기 카드 [영상 만들기]는 Take 잔액을 다시 읽기 전에 단추를 끄고, 그사이 두 번 불려도 한 번만 시작한다', () => {
    // 왜: 카드는 읽은 뒤에야 "만드는 중"(videoBusy)이 되어 그사이 두 번 불릴 수 있었다(검토 b 낮음 2 — setVideoBusy 를 읽기 앞으로).
    const grid = readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')
    const run = grid.slice(grid.indexOf('const runVideo = async () => {'), grid.indexOf('await generateVideoForShot(node.id)'))
    expect(run).toContain('if (videoBusy || videoStartingRef.current) return')
    expect(run.indexOf('setVideoBusy(true)')).toBeGreaterThan(-1)
    expect(run.indexOf('setVideoBusy(true)')).toBeLessThan(run.indexOf('await takesReadable()'))
  })

  it('잔액을 못 읽으면 시작하지 않고 단추는 다시 켜진다', async () => {
    // 왜: 정상 경로 고정 — 읽기에 실패해도 단추가 꺼진 채 남지 않는다(다시 눌러 다시 읽는다).
    const retake = () => render(VideoNode, videoId).find((el) => textOf(el.props.children as ReactNode).includes('영상 리테이크') && typeof el.props.onClick === 'function')!
    void (retake().props.onClick as (e: unknown) => Promise<void>)(event)
    release(false)
    await flush()
    expect(generate).not.toHaveBeenCalled()
    expect(retake().props.disabled).toBe(false)
  })
})

describe('가지 내기 — 못 읽음 (검토 c)', () => {
  it('샷 노드 가지 내기는 Take 잔액을 못 읽으면 시작하지 않고 까닭을 보이며 단추는 다시 켜진다', async () => {
    // 왜: 검토 c — 정규식을 느슨하게 한 뒤로 이 약속을 동작으로 지키는 시험이 없었다(가지 내기를 읽기 전에 시작하게 고장 내도 모두 통과).
    const branch = () => render(ShotNode, shotId).find((el) => typeof el.props.onBranch === 'function')!
    void (branch().props.onBranch as () => Promise<void>)()
    balance.failed = true
    release(false)
    await flush()
    expect(generate).not.toHaveBeenCalled()
    expect(branch().props.canBranch).toBe(true)
    const shown = render(ShotNode, shotId).map((el) => textOf(el.props.children as ReactNode))
    expect(shown.some((text) => text.includes('Take 를 확인하지 못해 시작하지 않았어요'))).toBe(true)
  })
})
