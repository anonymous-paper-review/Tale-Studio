// Artist 인물 · 배경 카드에 마우스를 올리면 카드 아래에 지난 그림 줄이 뜨고, 누르면 상세가 그 그림을 먼저 보이며, 상세의 [채택]이 그 그림을 카드 그림(최종)으로 만든다 (오너 2026-11-26 A4)
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand/vanilla'

// 이 파일은 React 훅을 꾸며 두고 부품을 함수로 불러 그 안의 요소(지난 그림 줄 · 상세 창과 그 값)를 본다 — director/version-history-cards 와 같은 방식.
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

import { CharacterPanel } from '@/features/artist/character-panel'
import { WorldPanel } from '@/features/artist/world-panel'
import { CharacterViewDialog } from '@/features/artist/character-view-dialog'
import { WorldViewDialog } from '@/features/artist/world-view-dialog'
import { ArtistHistoryHover } from '@/features/artist-room/artist-history-hover'
import { VersionHistoryHover } from '@/components/version-history/version-history-hover'
import { useArtistStore } from '@/stores/artist-store'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

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
/** 상세 창의 왼쪽 칸(큰 그림 · 보는 그림 줄) — 창 틀(DetailFrame)의 left 값. */
const leftOf = (tree: Element[]) => elements(tree.find(named('DetailFrame'))!.props.left as ReactNode)

const url = (id: string) => `https://media.test/${id}.png`
const cand = (id: string, day: number, isSelected = false) => ({ id, url: url(id), isSelected, sourceHash: null, appearanceHash: null, generatedAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z` })
const MINHO_MAIN = [cand('now', 25, true), cand('old2', 24), cand('old1', 23)]
const HALL = [cand('hall-now', 25, true), cand('hall-old', 24)]
const NIGHT = [cand('night-now', 25), cand('night-old', 24)]

let selectCandidate: ReturnType<typeof vi.fn>
let selectLocationCandidate: ReturnType<typeof vi.fn>
let generateCharacterView: ReturnType<typeof vi.fn>

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  selectCandidate = vi.fn(async () => {})
  selectLocationCandidate = vi.fn(async () => ({ ok: true }))
  generateCharacterView = vi.fn(async () => {})
  useLocaleStore.setState({ locale: 'en' })
  useProjectStore.setState({ projectId: 'p1' } as never)
  useProducerStore.setState({ styleAnchorKey: 'watercolor', customStyleAnchor: null, styleAnchors: [] } as never)
  useArtistVersionStore.setState({ versions: [] })
  useArtistStore.setState({
    sceneManifest: null,
    characterAssets: [{
      characterId: 'minho', name: '민호', entityType: 'person', views: {}, viewCandidates: {},
      appearances: [{ appearanceKey: 'current', label: 'Now', isDefault: true, narrativeTime: null, sheetUrl: url('now'), portraitUrl: null, appearance: 'a man', appearanceNative: '남자', viewCandidates: { main: MINHO_MAIN } }],
    }],
    worldAssets: [{
      locationId: 'hall', name: '복도', sceneId: 'sc1', wideShot: url('hall-now'), visualDescription: 'a hall', visualDescriptionNative: '복도', candidates: HALL,
      appearances: [{ appearanceKey: 'night', label: 'Night', narrativeTime: null, visualDescription: 'a hall at night', visualDescriptionNative: '밤 복도', wideShot: url('night-now'), candidates: NIGHT }],
    }],
    selectedLocationAppearances: { hall: 'night' },
    generatingViews: [], generatingLocations: [], viewFailures: {}, worldFailures: {}, contentRefusals: {},
    selectCandidate, selectLocationCandidate, generateCharacterView,
  } as never)
})

describe('같이 정한 것', () => {
  it('인물 카드는 그 모습 시트의 지난 그림 줄로 감싸여 있고, 줄의 그림을 누르면 상세가 그 그림을 먼저 보인다', () => {
    // 왜: 오너 A4 "Artist 호버링하면 과거 이력 아래에 뜨기" · "과거 클릭 후 상세페이지로 들어가면 '채택'" — 카드 그림이 곧 그 모습의 시트다.
    const hover = render(CharacterPanel as never, { columns: 2 }).find(named('ArtistHistoryHover'))!
    expect(hover.props.candidates).toBe(MINHO_MAIN)
    expect(hover.props.shownUrl).toBe(url('now'))
    ;(hover.props.onOpen as (id: string) => void)('old1')
    expect(render(CharacterPanel as never, { columns: 2 }).find(named('CharacterViewDialog'))!.props).toMatchObject({ charId: 'minho', appearanceKey: 'current', view: 'main', viewCandidateId: 'old1' })
    // "+N"(더 있음)은 지난 그림 없이 상세를 연다 — 모든 그림은 상세의 기록(시계)에 있다.
    ;(hover.props.onMore as () => void)()
    const dialog = render(CharacterPanel as never, { columns: 2 }).find(named('CharacterViewDialog'))!.props
    expect(dialog).toMatchObject({ charId: 'minho', appearanceKey: 'current', view: 'main' })
    expect(dialog.viewCandidateId ?? null).toBeNull()
  })

  it('배경 카드는 고른 모습의 지난 그림 줄로 감싸여 있고, 줄의 그림을 누르면 상세가 그 모습의 그 그림을 먼저 보인다', () => {
    // 왜: 오너 A4 — 배경 카드는 고른 모습(밤 등)의 그림을 보이므로 줄도 그 모습의 지난 그림이다.
    const hover = render(WorldPanel as never, { columns: 2 }).find(named('ArtistHistoryHover'))!
    expect(hover.props.candidates).toBe(NIGHT)
    expect(hover.props.shownUrl).toBe(url('night-now'))
    ;(hover.props.onOpen as (id: string) => void)('night-old')
    expect(render(WorldPanel as never, { columns: 2 }).find(named('WorldViewDialog'))!.props).toMatchObject({ locationId: 'hall', appearanceKey: 'night', viewCandidateId: 'night-old' })
  })

  it('인물 상세에서 지난 그림을 보며 [채택]을 누르면 그 그림 고르기(다시 그리지 않음)로 카드 그림이 된다', async () => {
    // 왜: 오너 A4 "'채택' → 최종 버전으로 지정됨" — 상세 기록(시계)의 [불러오기]와 같은 길(그림 · Take 없음).
    const props = { charId: 'minho', appearanceKey: 'current', view: 'main', viewCandidateId: 'old1', onClose: () => {} }
    const left = leftOf(render(CharacterViewDialog as never, props))
    expect(left.find(named('ImagePlaceholder'))!.props.imageUrl).toBe(url('old1'))
    const bar = left.find(named('VersionViewingBar'))!
    expect(bar.props.adoptDisabled).toBe(false)
    await (bar.props.onAdopt as () => Promise<void>)()
    expect(selectCandidate).toHaveBeenCalledWith('minho', 'current', 'main', 'old1')
    expect(generateCharacterView).not.toHaveBeenCalled()
  })

  it('배경 상세에서 지난 그림을 보며 [채택]을 누르면 그 모습의 그림 고르기로 카드 그림이 된다', async () => {
    // 왜: 오너 A4 — 배경 기록의 [불러오기]와 같은 길(그 모습 칸의 그림을 고른다).
    const props = { locationId: 'hall', shot: 'wideShot', appearanceKey: 'night', viewCandidateId: 'night-old', onClose: () => {} }
    const left = leftOf(render(WorldViewDialog as never, props))
    expect(left.find(named('ImagePlaceholder'))!.props.imageUrl).toBe(url('night-old'))
    await (left.find(named('VersionViewingBar'))!.props.onAdopt as () => Promise<void>)()
    expect(selectLocationCandidate).toHaveBeenCalledWith('hall', 'night-old', 'night')
  })

  it('세 탭과 같은 지난 판 줄을 쓴다 — 인물 · 배경 카드의 줄은 공용 지난 판 줄이다', () => {
    // 왜: 리드 "세 탭이 같은 부품 · 같은 모양" — Artist 만 다른 줄을 만들면 모양이 갈린다.
    hooks.cursor = 0
    const out = (ArtistHistoryHover as unknown as (props: Record<string, unknown>) => Element)({ candidates: MINHO_MAIN, shownUrl: url('now'), onOpen: () => {}, onMore: () => {}, children: null })
    expect(out.type).toBe(VersionHistoryHover)
    expect((out.props.cards as Array<{ id: string }>).map((card) => card.id)).toEqual(['old2', 'old1'])
  })
})

describe('혼자 정한 것', () => {
  it('[지금 그림 보기]를 누르면 채택하지 않고 지금 그림으로 돌아간다', () => {
    // 왜: 보기만 하고 나갈 길(Director 상세와 같은 혼자 정한 것 h).
    const props = { charId: 'minho', appearanceKey: 'current', view: 'main', viewCandidateId: 'old1', onClose: () => {} }
    ;(leftOf(render(CharacterViewDialog as never, props)).find(named('VersionViewingBar'))!.props.onBack as () => void)()
    const left = leftOf(render(CharacterViewDialog as never, props))
    expect(left.find(named('VersionViewingBar'))).toBeUndefined()
    expect(left.find(named('ImagePlaceholder'))!.props.imageUrl).toBe(url('now'))
    expect(selectCandidate).not.toHaveBeenCalled()
  })

  it('그 칸을 다시 그리는 중이면 인물 · 배경 상세의 [채택]이 꺼지고 까닭이 보이며, 눌러도 고르지 않는다', async () => {
    // 왜: 다시 그리는 중에 채택하면 끝난 새 그림이 그 채택을 덮는다 — Director · Storyboard 상세와 같은 규칙(검토 rev-director 11/26).
    useArtistStore.setState({
      generatingViews: [{ characterId: 'minho', appearanceKey: 'current', view: 'main' }],
      generatingLocations: ['hall:night'],
    } as never)
    const person = leftOf(render(CharacterViewDialog as never, { charId: 'minho', appearanceKey: 'current', view: 'main', viewCandidateId: 'old1', onClose: () => {} }))
      .find(named('VersionViewingBar'))!
    expect(person.props.adoptDisabled).toBe(true)
    expect(person.props.adoptReason).toBe('You can adopt it after the image is remade.')
    await (person.props.onAdopt as () => Promise<void>)()
    expect(selectCandidate).not.toHaveBeenCalled()
    // 다른 부품을 그리기 전에 꾸민 훅 자리를 비운다(앞 창의 상태 칸이 남지 않게).
    hooks.slots = []
    const place = leftOf(render(WorldViewDialog as never, { locationId: 'hall', shot: 'wideShot', appearanceKey: 'night', viewCandidateId: 'night-old', onClose: () => {} }))
      .find(named('VersionViewingBar'))!
    expect(place.props.adoptDisabled).toBe(true)
    expect(place.props.adoptReason).toBe('You can adopt it after the image is remade.')
    await (place.props.onAdopt as () => Promise<void>)()
    expect(selectLocationCandidate).not.toHaveBeenCalled()
  })

  it('다른 작품 스타일 판에서 그린 지난 그림은 상세에서 볼 수 있지만 [채택]이 꺼지고 어느 판 · 스타일인지 보인다', () => {
    // 왜: 작품 스타일은 하나다(10/28 오너) — 서버도 다른 스타일 그림 고르기를 거절한다. 상세 기록의 [불러오기]가 꺼지는 것과 같은 판정.
    const switchedAt = '2026-11-24T00:00:00.000Z'
    useArtistVersionStore.setState({ versions: [
      { n: 1, styleId: 'real', styleKey: 'real', customStyle: null, current: false, active: [{ from: null, to: switchedAt }], createdAt: '', thumbs: [] },
      { n: 2, styleId: 'watercolor', styleKey: 'watercolor', customStyle: null, current: true, active: [{ from: switchedAt, to: null }], createdAt: '', thumbs: [] },
    ] as never })
    const props = { charId: 'minho', appearanceKey: 'current', view: 'main', viewCandidateId: 'old1', onClose: () => {} }
    const bar = leftOf(render(CharacterViewDialog as never, props)).find(named('VersionViewingBar'))!
    expect(bar.props.adoptDisabled).toBe(true)
    expect(String(bar.props.note)).toContain('another style')
  })
})
