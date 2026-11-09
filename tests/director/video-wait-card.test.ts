// 영상을 만드는 동안 영상 노드는 기다리는 카드로, 다 만들면 "✓ 완성" 배지로 보인다 (11/5 시안 DG, 리드 2026-11-09)
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
vi.mock('@/lib/billing/use-take-balance', () => ({
  useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }),
}))

import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { ShotNodeData, VideoNodeData } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>

/** 함수 컴포넌트(NodeWaitCard · DoneBadge 등)는 펼치지 않고 요소만 따라간다. 공용 부품에 무엇을 넘기는지 본다. */
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
const named = (name: string) => (node: Element) => typeof node.type === 'function' && node.type.name === name

let shotId: string
let videoId: string
function render(): Element[] {
  hooks.cursor = 0
  const data = director.getState().nodes.find((node) => node.id === videoId)!.data as VideoNodeData
  const impl = (VideoNode as unknown as { type: (props: Record<string, unknown>) => ReactNode }).type
  return elements(impl({ id: videoId, data, selected: false }))
}
const waitCard = () => render().find(named('NodeWaitCard'))
function addShot(label: string, writerShotId: string): string {
  const id = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(id, { label, writerShotId })
  return id
}
function generate(jobId = 'job-1') {
  director.getState().updateNodeData<'video'>(videoId, {
    status: 'generating', lastAttemptStatus: 'generating', generationJobId: jobId, videoUrl: null, thumbnailUrl: null,
  })
}
function inBatch(pendingShotIds: string[], progress = { done: 2, total: 8, failed: 0 }) {
  director.setState({ videoBatchBusy: true, videoBatchProgress: progress, videoBatchQueue: { jobIds: ['job-1'], pendingShotIds } })
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  director.setState({
    projectId: 'wait-card-project', nodes: [], edges: [], popupNodeId: null,
    videoBatchBusy: false, videoBatchProgress: null, videoBatchQueue: null, videoBatchCancelled: false,
  })
  shotId = addShot('Shot 1', 'shot-1')
  director.getState().updateNodeData<'shot'>(shotId, { provider: 'seedance', durationSeconds: 5 } as Partial<ShotNodeData>)
  addShot('Shot 2', 'shot-2')
  addShot('Shot 3', 'shot-3')
  addShot('Shot 4', 'shot-4')
  addShot('Shot 5', 'shot-5')
  videoId = director.getState().addVideoTake(shotId)!
  useLocaleStore.setState({ locale: 'ko' })
})

describe('혼자 정한 것', () => {
  // 왜: 시안 DG. 만드는 영상 노드를 노드 크기 카드(Lumi · "영상을 만들고 있어요")가 덮는다. 예전엔 도는 빛과 그림 위 작은 알약뿐이었다.
  it("영상을 만드는 중이면 그 영상 노드를 '영상을 만들고 있어요' 카드가 덮는다", () => {
    generate()

    expect(waitCard()?.props).toMatchObject({ lumi: 'director', title: '영상을 만들고 있어요' })
  })

  // 왜: 남은 시간은 근거가 없다(업체가 진행률을 주지 않는다). 오너 2026-08-26 "경과 초를 보이지 않는다" 결정을 지킨다(리드 b2).
  //   길이는 모델에 실제로 요청하는 초다. 모델이 못 내는 길이는 모델 범위로 맞춘 값(예: Seedance 는 4초부터, Veo 는 늘 8초).
  it('카드의 둘째 줄은 샷 이름과 모델에 요청한 영상 길이이고 남은 시간은 쓰지 않는다', () => {
    generate()
    expect(waitCard()?.props.description).toBe('Shot 1 · 5초')

    director.getState().updateNodeData<'shot'>(shotId, { durationSeconds: 2 } as Partial<ShotNodeData>)
    expect(waitCard()?.props.description).toBe('Shot 1 · 4초')

    director.getState().updateNodeData<'shot'>(shotId, { provider: 'veo' } as Partial<ShotNodeData>)
    expect(waitCard()?.props.description).toBe('Shot 1 · 8초')
    expect(String(waitCard()?.props.description)).not.toContain('남음')
  })

  // 왜: 낱개로 누른 영상은 줄이 없고, 영상 하나의 진행률은 알 수 없다(리드 b3 · b4).
  it('낱개로 만드는 영상의 카드에는 막대와 다음 차례가 없다', () => {
    generate()

    expect(waitCard()).toBeDefined()
    expect(waitCard()?.props.progress).toBeUndefined()
    expect(waitCard()?.props.note).toBeUndefined()
  })

  // 왜: 영상 하나의 진행률 대신 묶음 진행을 막대로 보인다(리드 b3①). 숫자 뜻은 툴바와 같은 끝난 수.
  it('묶음으로 만드는 영상의 카드 막대는 묶음에서 끝난 수 / 전체다', () => {
    generate()
    inBatch([], { done: 2, total: 8, failed: 0 })

    expect(waitCard()?.props.progress).toBe(25)
  })

  // 왜: 시안 DG "다음 차례: 새 샷 → 샷 2". 묶음에서 아직 안 낸 샷을 낼 순서대로 보인다(리드 b4).
  it("묶음으로 만드는 영상의 카드 아래에는 아직 안 낸 샷을 낼 순서대로 '다음 차례: …'로 보인다", () => {
    generate()
    inBatch(['shot-3', 'shot-2'])

    expect(waitCard()?.props.note).toBe('다음 차례: Shot 3 → Shot 2')
  })

  // 왜: 카드 폭(240)에 이름을 다 늘어놓으면 줄이 넘친다. 앞의 둘이면 무엇이 곧 시작하는지 충분히 보인다.
  it('다음 차례가 셋 이상이면 앞의 둘과 남은 수만 보인다', () => {
    generate()
    inBatch(['shot-3', 'shot-2', 'shot-4', 'shot-5'])

    expect(waitCard()?.props.note).toBe('다음 차례: Shot 3 → Shot 2 외 2개')
  })

  // 왜: 같은 묶음이 돌아도 묶음 밖에서 따로 누른 영상은 묶음의 막대 · 다음 차례를 빌려 쓰지 않는다.
  it('묶음이 도는 동안 따로 누른 영상의 카드에는 묶음 막대와 다음 차례가 없다', () => {
    generate('job-single')
    inBatch(['shot-3'])

    expect(waitCard()).toBeDefined()
    expect(waitCard()?.props.progress).toBeUndefined()
    expect(waitCard()?.props.note).toBeUndefined()
  })

  // 왜: 시안 DG 완성 표시를 "● 완료" 자리의 "✓ 완성" 배지로 한다. 빛은 design.md §9 금지, 단계 색 테두리는 '고른 노드'와 같아 보여 넣지 않는다(리드 b5).
  it("영상이 다 만들어지면 꼬리에 '✓ 완성' 배지를 달고 테두리 · 빛은 더하지 않는다", () => {
    director.getState().updateNodeData<'video'>(videoId, {
      status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://media.test/v.mp4', thumbnailUrl: 'https://media.test/t.jpg',
    })
    const nodes = render()
    const footer = nodes.find((node) => node.type === 'div' && elements(node.props.children as ReactNode).some(named('DoneBadge')))

    expect(footer).toBeDefined()
    expect(textOf(footer)).not.toContain('완료')
    expect(nodes.find((node) => node.props.theme === 'video')?.props.beam ?? null).toBeNull()
    expect(waitCard()).toBeUndefined()
  })

  // 왜: 정상 경로 고정. 아직 만들지 않은 영상 노드는 카드도 배지도 없이 지금처럼 "대기 중"이다.
  it('아직 만들지 않은 영상 노드에는 기다리는 카드도 완성 배지도 없다', () => {
    const nodes = render()

    expect(nodes.find(named('NodeWaitCard'))).toBeUndefined()
    expect(nodes.find(named('DoneBadge'))).toBeUndefined()
  })
})
