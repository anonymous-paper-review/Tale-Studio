// 영상 팝업 · 왼쪽 상세 패널 · 영상 노드가 해상도 단추(720p · 1080p)와 그 해상도의 Take 를 보여준다 (오너 2026-10-31 1080p)
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
// 운영은 shadow(숫자는 보이되 막지 않음) — Take 표시가 켜진 상태로 본다.
vi.mock('@/lib/billing/use-take-balance', () => ({
  useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }),
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))

import { VideoDetailPanel } from '@/features/director/canvas-panels/VideoDetailPanel'
import { VideoNodePopup } from '@/features/director/canvas-popups/VideoNodePopup'
import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { createDefaultStandaloneVideoConfig } from '@/lib/director/standalone-video'
import { FAL_VIDEO_MODEL_ORDER, VIDEO_MODELS } from '@/lib/video-models'
import type { DirectorNode, VideoNodeData } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>
type Surface = (props: { nodeId: string; data: VideoNodeData }) => ReactNode

// 함수 컴포넌트는 펼치지 않고 요소만 따라간다 — 해상도 단추 · Take 표시처럼 이 기능이 새로 둔 조각만 펼쳐 본다.
const EXPAND = new Set(['VideoResolutionButtons', 'VideoTakeCost'])
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
  if (!isValidElement<Record<string, unknown>>(node)) return ''
  if (typeof node.type === 'function' && EXPAND.has(node.type.name)) {
    return textOf((node.type as (props: Record<string, unknown>) => ReactNode)(node.props))
  }
  return textOf(node.props.children as ReactNode)
}

const MODEL_LABELS = FAL_VIDEO_MODEL_ORDER.map((key) => VIDEO_MODELS[key].label)
const buttonsOf = (nodes: Element[]) => nodes.filter((node) => node.type === 'button')
const modelButtons = (nodes: Element[]) => buttonsOf(nodes).filter((node) => MODEL_LABELS.includes(textOf(node)))
const resolutionButtons = (nodes: Element[]) => buttonsOf(nodes).filter((node) => ['720p', '1080p'].includes(textOf(node)))
const resolutionButton = (nodes: Element[], label: '720p' | '1080p') => {
  const found = resolutionButtons(nodes).find((node) => textOf(node) === label)
  expect(found, `${label} 단추`).toBeDefined()
  return found!
}
const takeTexts = (nodes: Element[]) =>
  nodes.filter((node) => node.type === 'span' && /^Take \d+개$/.test(textOf(node))).map((node) => textOf(node))

let shotId: string
let videoId: string
function videoData(id = videoId): VideoNodeData {
  return director.getState().nodes.find((node) => node.id === id)!.data as VideoNodeData
}
function render(surface: Surface, id = videoId): Element[] {
  hooks.cursor = 0
  return elements(surface({ nodeId: id, data: videoData(id) }))
}
function renderNode(id = videoId): Element[] {
  hooks.cursor = 0
  const impl = (VideoNode as unknown as { type: (props: Record<string, unknown>) => ReactNode }).type
  return elements(impl({ id, data: videoData(id), selected: true }))
}

const SURFACES = [['왼쪽 상세 패널', VideoDetailPanel], ['영상 팝업', VideoNodePopup]] as const
// 오너 문장의 "Node 뷰의 영상 팝업" = Node 뷰에서 영상 노드를 누르면 열리는 왼쪽 상세 패널. 같은 단추를 둔 영상 팝업도 같이 본다.
const WHERE = [['Director Node 뷰의 왼쪽 상세 패널', VideoDetailPanel], ['영상 팝업', VideoNodePopup]] as const

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  director.setState({ projectId: 'resolution-ui-project', nodes: [], edges: [], popupNodeId: null })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', provider: 'seedance' })
  videoId = director.getState().addVideoTake(shotId)!
  useLocaleStore.setState({ locale: 'ko' })
})

describe('같이 정한 것', () => {
  // 왜: Node 뷰에서 영상 노드를 누르면 왼쪽 상세 패널이 열린다(오너가 말한 "영상 팝업"). 같은 단추를 둔 영상 팝업도 같은 자리에 있어야 한다.
  it.each(WHERE)('%s에서 영상 생성 모델 아래에 해상도 단추(720p · 1080p)가 있다', (_label, surface) => {
    const nodes = render(surface)
    const models = modelButtons(nodes)
    const resolutions = resolutionButtons(nodes)

    expect(models).toHaveLength(FAL_VIDEO_MODEL_ORDER.length)
    expect(resolutions.map((node) => textOf(node))).toEqual(['720p', '1080p'])
    expect(nodes.indexOf(resolutions[0]!)).toBeGreaterThan(nodes.indexOf(models.at(-1)!))
  })
})

describe('혼자 정한 것', () => {
  // 왜: 처음 여는 영상 노드는 지금과 같은 720p 로 만든다 — 정상 경로 고정.
  it.each(SURFACES)('처음 연 영상 노드는 720p가 골라져 있다 (%s)', (_label, surface) => {
    const nodes = render(surface)

    expect(resolutionButton(nodes, '720p').props['aria-pressed']).toBe(true)
    expect(resolutionButton(nodes, '1080p').props['aria-pressed']).toBe(false)
    expect(takeTexts(nodes)).toEqual(['Take 5개'])
  })

  // 왜: 사용자가 1080p 를 눌렀을 때 — 그 영상 노드 설정에 남고, 만들기 전에 두 배가 된 Take 를 본다.
  it.each(SURFACES)('1080p를 누르면 그 영상 노드 설정에 1080p가 남고 만들기 단추 옆 Take가 두 배가 된다 (%s)', (_label, surface) => {
    ;(resolutionButton(render(surface), '1080p').props.onClick as () => void)()

    expect(videoData().override).toMatchObject({ resolution: '1080p' })
    const after = render(surface)
    expect(resolutionButton(after, '1080p').props['aria-pressed']).toBe(true)
    expect(resolutionButton(after, '720p').props['aria-pressed']).toBe(false)
    expect(takeTexts(after)).toEqual(['Take 10개'])
  })

  // 왜: Kling O3 Pro 는 해상도 칸이 없는 모델이다 — 1080p 를 남겨 둔 노드에서 Kling 으로 바꿔도 두 배를 받지 않는다.
  it.each(SURFACES)('해상도를 고를 수 없는 모델을 고르면 해상도 단추가 꺼지고 "이 모델은 해상도를 고를 수 없어요"가 보인다 (%s)', (_label, surface) => {
    director.getState().applyVideoOverride(videoId, { resolution: '1080p', provider: 'kling-o3' })

    const nodes = render(surface)
    for (const button of resolutionButtons(nodes)) {
      expect(button.props.disabled).toBe(true)
      expect(button.props['aria-pressed']).toBe(false)
    }
    expect(nodes.some((node) => textOf(node) === '이 모델은 해상도를 고를 수 없어요')).toBe(true)
    expect(takeTexts(nodes)).toEqual(['Take 5개'])
  })

  // 왜: 캔버스 빈 곳에서 만든 독립 영상은 설정 전체를 그 영상이 갖고 있고, 해상도는 그 설정에 없다 — 서버도 720p 로 만든다.
  it('독립 영상의 왼쪽 패널에는 해상도 단추가 없다', () => {
    const standalone: DirectorNode = {
      id: 'standalone-video',
      type: 'video',
      position: { x: 0, y: 0 },
      data: {
        ...videoData(),
        label: 'Video',
        parentShotNodeId: null,
        standaloneVideoKey: 'standalone:123e4567-e89b-42d3-a456-426614174000',
        override: { ...createDefaultStandaloneVideoConfig(), prompt: 'A kite over a field' },
      } as VideoNodeData,
    }
    director.setState({ nodes: [...director.getState().nodes, standalone] })

    const nodes = render(VideoDetailPanel, 'standalone-video')
    expect(modelButtons(nodes)).toHaveLength(FAL_VIDEO_MODEL_ORDER.length)
    expect(resolutionButtons(nodes)).toEqual([])
  })

  // 왜: 캔버스에서 노드만 보고 [영상 리테이크]를 누를 때 — 노드의 Take 표시가 그 버튼으로 실제로 잡힐 Take 와 같아야 한다.
  it('영상 노드의 Take 표시는 다음에 만들 해상도를 따라 두 배로 보인다', () => {
    expect(takeTexts(renderNode())).toEqual(['Take 5개'])

    director.getState().applyVideoOverride(videoId, { resolution: '1080p' })

    expect(takeTexts(renderNode())).toEqual(['Take 10개'])
  })

  // 왜: 노드의 1080p 표시는 지금 보이는 영상에 대한 말이다 — 설정만 바꾸고 아직 다시 만들지 않은 영상에 붙으면 틀린 말이 된다(2026-10-31 리뷰).
  //   다음에 만들 해상도(설정)는 왼쪽 패널 단추와 Take 표시가 보여준다.
  it('영상 노드의 1080p 표시는 지금 영상이 실제로 1080p로 만들어졌을 때만 붙는다', () => {
    const has1080 = (nodes: Element[]) => nodes.some((node) => node.type === 'span' && textOf(node) === '1080p')
    director.getState().updateNodeData<'video'>(videoId, { videoUrl: 'https://media.test/take.mp4', status: 'completed', videoResolution: null })
    director.getState().applyVideoOverride(videoId, { resolution: '1080p' })
    expect(has1080(renderNode())).toBe(false)

    director.getState().updateNodeData<'video'>(videoId, { videoResolution: '1080p' })
    director.getState().applyVideoOverride(videoId, { resolution: '720p' })
    const made1080 = renderNode()
    expect(has1080(made1080)).toBe(true)
    expect(takeTexts(made1080)).toEqual(['Take 5개'])
    // 해상도는 마더 샷을 바꾼 값이 아니다 — 노란 "바꾼 설정" 표시에 넣지 않는다.
    expect(made1080.some((node) => node.type === 'span' && textOf(node) === 'resolution')).toBe(false)
  })

  // 왜: 1080p 를 남겨 둔 채 모델만 Kling 으로 바꿨다가 되돌리는 경우 — 고른 해상도는 지우지 않고, 낼 수 없는 동안만 쓰지 않는다.
  it('1080p를 남긴 채 해상도를 고를 수 없는 모델로 바꾸면 노드는 기본 Take를 보이고, 모델을 되돌리면 다시 두 배다', () => {
    director.getState().applyVideoOverride(videoId, { resolution: '1080p', provider: 'kling-o3' })
    expect(takeTexts(renderNode())).toEqual(['Take 5개'])

    director.getState().applyVideoOverride(videoId, { provider: 'seedance' })
    expect(takeTexts(renderNode())).toEqual(['Take 10개'])
  })
})
