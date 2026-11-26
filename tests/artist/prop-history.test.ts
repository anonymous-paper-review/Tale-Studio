// Artist 소품 카드에 마우스를 올리면 고른 모습의 지난 그림 줄이 뜨고, 누르면 소품 상세가 그 그림을 먼저 보이며, [채택]이 그 칸의 카드 그림을 그 그림으로 바꾼다 (오너 2026-11-26 A4 · 리드 승인 소품 기록 표)
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand/vanilla'

// 이 파일은 React 훅을 꾸며 두고 부품을 함수로 불러 그 안의 요소(지난 그림 줄 · 상세 창과 그 값)를 본다 — history-cards 와 같은 방식.
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

import { PropPanel } from '@/features/artist/prop-panel'
import { PropViewDialog } from '@/features/artist/prop-view-dialog'
import { useArtistStore } from '@/stores/artist-store'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import type { PropAsset } from '@/types'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
const named = (name: string) => (node: Element) => typeof node.type === 'function' && node.type.name === name
const render = (component: (props: Record<string, unknown>) => ReactNode, props: Record<string, unknown>) => {
  hooks.cursor = 0
  return elements(component(props))
}
/** 소품 상세의 왼쪽 칸 — 창 틀(DetailFrame)의 left 값(왼쪽 칸 부품)을 불러 펼친다. */
function leftOf(tree: Element[]): Element[] {
  const left = tree.find(named('DetailFrame'))!.props.left as Element
  return elements((left.type as (props: Record<string, unknown>) => ReactNode)(left.props))
}

const url = (id: string) => `https://media.test/${id}.png`
const cand = (id: string, day: number, isSelected = false) => ({ id, url: url(id), isSelected, sourceHash: `hash-${id}`, generatedAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z` })
const RING = [cand('ring-now', 25, true), cand('ring-old', 24)]
const BROKEN = [cand('broken-now', 25, true), cand('broken-old', 23)]
const ring = (): PropAsset => ({
  propId: 'obj_ring', name: '은반지', appearance: 'a thin silver ring', appearanceNative: '가는 은반지', imageUrl: url('ring-now'), sourceHash: 'hash-ring-now', origin: 'producer',
  candidates: RING,
  appearances: [{ appearanceKey: 'broken', label: '깨진 반지', narrativeTime: null, appearance: 'a broken ring', appearanceNative: '깨진 반지', imageUrl: url('broken-now'), sourceHash: 'hash-broken-now', candidates: BROKEN }],
})

let selectPropCandidate: ReturnType<typeof vi.fn>
let generateProp: ReturnType<typeof vi.fn>
const realSelect = useArtistStore.getState().selectPropCandidate

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  selectPropCandidate = vi.fn(async () => ({ ok: true }))
  generateProp = vi.fn(async () => {})
  useLocaleStore.setState({ locale: 'en' })
  useProjectStore.setState({ projectId: 'p1' } as never)
  useProducerStore.setState({ styleAnchorKey: 'watercolor', customStyleAnchor: null, styleAnchors: [] } as never)
  useArtistVersionStore.setState({ versions: [] })
  useArtistStore.setState({
    propAssets: [ring()], propUsage: {}, selectedPropAppearances: {}, generatingProps: [], propFailures: {}, propContentRefusals: {},
    selectPropCandidate, generateProp,
  } as never)
})
afterEach(() => vi.unstubAllGlobals())

describe('같이 정한 것', () => {
  it('소품 카드는 고른 모습의 지난 그림 줄로 감싸여 있고, 줄의 그림을 누르면 소품 상세가 그 그림을 먼저 보인다', () => {
    // 왜: 오너 A4 "Artist 호버링하면 과거 이력 아래에 뜨기" — 소품도 인물 · 배경과 같은 줄 · 같은 상세다(리드 승인 소품 기록 표).
    let hover = render(PropPanel as never, { columns: 2 }).find(named('ArtistHistoryHover'))!
    expect(hover.props.candidates).toBe(RING)
    expect(hover.props.shownUrl).toBe(url('ring-now'))
    ;(hover.props.onOpen as (id: string) => void)('ring-old')
    expect(render(PropPanel as never, { columns: 2 }).find(named('PropViewDialog'))!.props).toMatchObject({ propId: 'obj_ring', viewCandidateId: 'ring-old' })
    // 카드에서 다른 모습을 고르면 줄도 그 모습의 지난 그림이다.
    useArtistStore.setState({ selectedPropAppearances: { obj_ring: 'broken' } } as never)
    hover = render(PropPanel as never, { columns: 2 }).find(named('ArtistHistoryHover'))!
    expect(hover.props.candidates).toBe(BROKEN)
    expect(hover.props.shownUrl).toBe(url('broken-now'))
  })

  it('소품 상세에서 지난 그림을 보며 [채택]을 누르면 그 칸의 소품 그림 고르기(다시 그리지 않음)로 카드 그림이 된다', async () => {
    // 왜: 오너 A4 "'채택' → 최종 버전으로 지정됨" — 소품 그림 고르기 길(select-prop-candidate)로 바꾼다. 그림 · Take 없음.
    useArtistStore.setState({ selectedPropAppearances: { obj_ring: 'broken' } } as never)
    const left = leftOf(render(PropViewDialog as never, { propId: 'obj_ring', viewCandidateId: 'broken-old', onClose: () => {} }))
    expect(left.find(named('ImagePlaceholder'))!.props.imageUrl).toBe(url('broken-old'))
    await (left.find(named('VersionViewingBar'))!.props.onAdopt as () => Promise<void>)()
    expect(selectPropCandidate).toHaveBeenCalledWith('obj_ring', 'broken', 'broken-old')
    expect(generateProp).not.toHaveBeenCalled()
  })

  it('소품 [채택]은 그 칸의 지금 그림 · 그림 지문 · 기록 표시를 고른 그림 것으로 바꾸고 다른 칸은 그대로 둔다', async () => {
    // 왜: 채택 뒤 카드가 바로 그 그림을 보이고 "설명 바뀜" 판정이 그 그림 지문으로 되어야 한다 — 소품의 지금 그림은 모습마다 하나다.
    useArtistStore.setState({ selectPropCandidate: realSelect } as never)
    const fetcher = vi.fn(async () => Response.json({ ok: true, url: url('broken-old'), sourceHash: 'hash-broken-old' }))
    vi.stubGlobal('fetch', fetcher)
    expect(await useArtistStore.getState().selectPropCandidate('obj_ring', 'broken', 'broken-old')).toEqual({ ok: true })
    expect(fetcher).toHaveBeenCalledWith('/api/artist/select-prop-candidate', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ projectId: 'p1', propId: 'obj_ring', appearanceKey: 'broken', candidateId: 'broken-old' })
    const prop = useArtistStore.getState().propAssets[0]!
    expect(prop.appearances![0]).toMatchObject({ imageUrl: url('broken-old'), sourceHash: 'hash-broken-old' })
    expect(prop.appearances![0]!.candidates!.filter((c) => c.isSelected).map((c) => c.id)).toEqual(['broken-old'])
    expect(prop).toMatchObject({ imageUrl: url('ring-now'), sourceHash: 'hash-ring-now' })
    expect(prop.candidates!.filter((c) => c.isSelected).map((c) => c.id)).toEqual(['ring-now'])
  })
})

describe('혼자 정한 것', () => {
  it('그 칸을 다시 그리는 중이면 소품 상세의 [채택]이 꺼지고 까닭이 보이며, 눌러도 고르지 않는다', async () => {
    // 왜: 다시 그리는 중에 채택하면 끝난 새 그림이 그 채택을 덮는다 — Director · Storyboard 상세와 같은 규칙(검토 rev-director 11/26).
    useArtistStore.setState({ selectedPropAppearances: { obj_ring: 'broken' }, generatingProps: ['obj_ring\u0000broken'] } as never)
    const bar = leftOf(render(PropViewDialog as never, { propId: 'obj_ring', viewCandidateId: 'broken-old', onClose: () => {} })).find(named('VersionViewingBar'))!
    expect(bar.props.adoptDisabled).toBe(true)
    expect(bar.props.adoptReason).toBe('You can adopt it after the image is remade.')
    await (bar.props.onAdopt as () => Promise<void>)()
    expect(selectPropCandidate).not.toHaveBeenCalled()
  })

  it('다른 작품 스타일 판 그림이라 서버가 거절하면 소품 그림은 그대로이고 그 까닭을 돌려준다', async () => {
    // 왜: 화면 판정과 서버 판정이 어긋나도(다른 창에서 스타일을 바꿈) 카드 그림을 잘못 바꾸지 않는다 — 인물 · 배경 고르기와 같다.
    useArtistStore.setState({ selectPropCandidate: realSelect } as never)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'This image is in another style', code: 'other_style' }, { status: 409 })))
    expect(await useArtistStore.getState().selectPropCandidate('obj_ring', 'default', 'ring-old')).toEqual({ ok: false, code: 'other_style' })
    expect(useArtistStore.getState().propAssets[0]).toMatchObject({ imageUrl: url('ring-now'), sourceHash: 'hash-ring-now' })
  })
})
