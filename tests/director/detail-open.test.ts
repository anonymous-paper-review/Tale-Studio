// ⤢ 상세는 prose 의 샷 상세(openShotDetail)를 열고, 상세가 열린 노드만 단계 색 테두리 · 위 단추를 단다 — 영상 만드는 노드의 기다리는 카드는 영상 보라 (시안 D1 · D4 · R, 리드 S4-2 8)
import { readFileSync } from 'node:fs'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('@xyflow/react', () => ({ Handle: () => null, NodeToolbar: () => null, Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' } }))
vi.mock('@/lib/billing/use-take-balance', () => ({
  useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false, failed: false }),
}))

import { NodeWaitCard } from '@/components/feedback/node-wait'
import { BaseNode } from '@/features/director/canvas-nodes/BaseNode'
import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'
import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { detailTabForShot } from '@/lib/director/shot-state'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
const named = (name: string) => (node: Element) => typeof node.type === 'function' && node.type.name === name
/** memo 로 감싼 BaseNode — 요소의 type 은 memo 객체다. */
const isBaseNode = (node: Element) => node.type === BaseNode
function renderNode(component: unknown, id: string): Element[] {
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === id)!.data
  const impl = (component as { type: (props: Record<string, unknown>) => ReactNode }).type
  return elements(impl({ id, data, selected: false }))
}
function renderBase(theme: 'shot' | 'video', id: string): Element[] {
  hooks.cursor = 0
  const impl = (BaseNode as unknown as { type: (props: Record<string, unknown>) => ReactNode }).type
  return elements(impl({ id, theme, title: 'Shot 1', canBranch: false }))
}
const event = { stopPropagation: () => {} }
const grid = () => readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')

let shotId: string
let videoId: string
beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  director.setState({
    projectId: 'detail-open-project', nodes: [], edges: [], popupNodeId: null, selectedNodeId: null, detailNodeId: null,
    videoBatchBusy: false, videoBatchProgress: null, videoBatchQueue: null, videoBatchCancelled: false, realBatchBusy: false,
  })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { label: 'Shot 1', writerShotId: 'w1' })
  videoId = director.getState().addVideoTake(shotId)!
  director.setState({ selectedNodeId: null, detailNodeId: null })
  useLocaleStore.setState({ locale: 'ko' })
})

describe('같이 정한 것', () => {
  it('노드의 ⤢ 상세는 그 샷의 샷 상세를 연다 — 샷 노드는 이미지 탭, Take 노드는 영상 탭으로', () => {
    // 왜: 시안 R "⤢ = 상세 열기" — 예전엔 옛 왼쪽 패널 고르기(selectNode)라 prose 의 새 샷 상세(D6 · D7) 탭을 고를 수 없었다.
    const details = (theme: 'shot' | 'video', id: string) =>
      renderBase(theme, id).find((el) => el.props['aria-label'] === '상세 열기' && typeof el.props.onClick === 'function')!
    ;(details('shot', shotId).props.onClick as (e: unknown) => void)(event)
    expect(director.getState()).toMatchObject({ detailNodeId: shotId, detailTab: 'image' })
    ;(details('video', videoId).props.onClick as (e: unknown) => void)(event)
    expect(director.getState()).toMatchObject({ detailNodeId: videoId, detailTab: 'video' })
  })

  it('스토리보드 카드의 ⤢ 상세와 두 번 누르기는 그 샷의 샷 상세를 연다', () => {
    // 왜: 시안 D2 · R — 카드 몸통은 고르기, 상세는 ⤢ · 두 번 누르기. 실사 보기는 prose 의 샷 상세 팝업이 맡는다.
    const open = grid().slice(grid().indexOf('const openDetail = () => {'), grid().indexOf('const prompt = effectivePrompt(data)'))
    expect(open).toContain('openShotDetail(node.id, detailTabForShot(shotState))')
    expect(open).not.toContain('openPopup(node.id)\n      return')
  })

  it('상세가 열린 노드만 단계 색 테두리 · 위 단추를 단다 — 상세를 닫으면 사라진다', () => {
    // 왜: 시안 D1 노드형 — 상세를 연 노드만 단계 색 테두리. ⤢ 가 openShotDetail 로 열게 되어 테두리도 그 표시(detailNodeId)를 따라야 한다.
    const base = () => renderNode(ShotNode, shotId).find(isBaseNode)!
    expect(base().props.selected).toBe(false)
    director.getState().openShotDetail(shotId, 'image')
    expect(base().props.selected).toBe(true)
    expect(renderNode(VideoNode, videoId).find(isBaseNode)!.props.selected).toBe(false)
    director.getState().closeShotDetail()
    expect(base().props.selected).toBe(false)
  })

  it('노드형에서 영상을 만드는 Take 노드의 기다리는 카드는 테두리 · 막대가 영상 보라다', () => {
    // 왜: 시안 D4 — 영상 만드는 노드는 보라(상태 색 "영상 만드는 중"), 이미지 그리는 노드는 단계 파랑. 11/9 부품 그대로면 둘 다 파랑이었다.
    director.getState().updateNodeData<'video'>(videoId, { status: 'generating', lastAttemptStatus: 'generating', videoUrl: null })
    expect(renderNode(VideoNode, videoId).find(named('NodeWaitCard'))!.props.tone).toBe('video')
    // 공용 카드는 훅이 없어 함수로 불러 그 class 를 본다(이 파일은 React 훅을 꾸며 두어 서버 그리기를 쓰지 않는다).
    const classes = (props: Record<string, unknown>) =>
      elements((NodeWaitCard as unknown as (p: Record<string, unknown>) => ReactNode)({ lumi: 'director', title: '영상을 만들고 있어요', progress: 40, ...props }))
        .map((el) => String(el.props.className ?? '')).join(' ')
    expect(classes({ tone: 'video' })).toContain('border-state-video')
    expect(classes({ tone: 'video' })).toContain('bg-state-video')
    expect(classes({ tone: 'video' })).not.toMatch(/border-stage(\s|$)/)
    // 이미지 그리는 카드(기본)는 단계 색 그대로.
    expect(classes({})).toMatch(/border-stage(\s|$)/)
    expect(classes({})).toContain('bg-stage-gradient')
  })
})

describe('빈 캔버스 누르기 (검토 c 낮음)', () => {
  it('⤢ 로 연 샷 상세는 빈 캔버스를 누르면 닫힌다', () => {
    // 왜: 빈 캔버스 누르기는 옛 고르기(selectNode(null))만 풀어 ⤢(openShotDetail)로 연 상세가 남았다 — 예전 ⤢ · 두 번 누르기 · 메뉴로 연 상세는 닫혔다.
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    const start = page.indexOf('onPaneClick={() => {')
    const pane = page.slice(start, page.indexOf('}}', start))
    expect(pane).toContain('closeShotDetail()')
    director.getState().openShotDetail(shotId, 'image')
    director.getState().selectNode(null)
    director.getState().closeShotDetail()
    expect(director.getState().detailNodeId).toBeNull()
  })
})

describe('혼자 정한 것', () => {
  it('스토리보드 카드의 ⤢ 는 그 샷이 영상 단계(만드는 중 · 완성 · 실패)면 영상 탭으로, 아니면 이미지 탭으로 연다', () => {
    // 왜: 카드가 지금 말하는 일(영상)의 탭으로 바로 간다 — 영상 실패 카드에서 이미지 탭부터 보이면 한 번 더 눌러야 한다.
    expect(detailTabForShot('video_generating')).toBe('video')
    expect(detailTabForShot('video_done')).toBe('video')
    expect(detailTabForShot('video_failed')).toBe('video')
    expect(detailTabForShot('image_done')).toBe('image')
    expect(detailTabForShot('image_needed')).toBe('image')
  })
})
