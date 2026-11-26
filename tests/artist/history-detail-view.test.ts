// Artist 상세에서 지난 그림을 보는 동안 큰 그림이 그 그림이고 "지난 그림 보는 중 · 그린 때"와 [채택] · [지금 그림 보기]가 보인다 (오너 2026-11-26 A4)
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다 — style-version-screen 과 같은 방법).
vi.mock('@/components/ui/dialog', async () => {
  const { createElement: h } = await import('react')
  type Props = { children?: ReactNode; className?: string; 'data-testid'?: string; open?: boolean }
  const plain = (tag: string) => ({ children, className, 'data-testid': testId }: Props) => h(tag, { className, 'data-testid': testId }, children)
  return {
    Dialog: ({ open, children }: Props) => (open ? children : null),
    DialogContent: plain('div'),
    DialogHeader: plain('div'),
    DialogFooter: plain('div'),
    DialogTitle: plain('h2'),
    DialogDescription: plain('p'),
  }
})

import { CharacterViewDialog } from '@/features/artist/character-view-dialog'
import { WorldViewDialog } from '@/features/artist/world-view-dialog'
import { PropDetailPanels } from '@/features/artist/prop-view-dialog'
import { useArtistStore } from '@/stores/artist-store'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

const NOW = new Date('2026-11-26T10:00:00.000Z')
const url = (id: string) => `https://media.test/${id}.png`
const cand = (id: string, day: number, isSelected = false) => ({ id, url: url(id), isSelected, sourceHash: null, appearanceHash: null, generatedAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z` })

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(style-version-screen 과 같은 방법). */
function serveCurrent() {
  for (const store of [useLocaleStore, useProducerStore, useArtistStore, useArtistVersionStore, useProjectStore, useWriterStore] as Array<{ getState: () => object; getInitialState: () => object }>) {
    Object.assign(store.getInitialState(), store.getState())
  }
}
const html = (element: ReturnType<typeof createElement>) => {
  serveCurrent()
  return renderToStaticMarkup(element).replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}
const character = (viewCandidateId: string | null) => createElement(CharacterViewDialog, { charId: 'minho', appearanceKey: 'current', view: 'main', viewCandidateId, onClose: () => {} })
const world = (viewCandidateId: string | null) => createElement(WorldViewDialog, { locationId: 'hall', shot: 'wideShot', appearanceKey: 'night', viewCandidateId, onClose: () => {} })
const tagOf = (out: string, testId: string) => out.match(new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? ''

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  useLocaleStore.setState({ locale: 'en' })
  useProjectStore.setState({ projectId: 'p1' } as never)
  useWriterStore.setState({ shots: [], sceneManifest: null } as never)
  useProducerStore.setState({ styleAnchorKey: 'watercolor', customStyleAnchor: null, styleAnchors: [] } as never)
  useArtistVersionStore.setState({ versions: [] })
  useArtistStore.setState({
    characterAssets: [{
      characterId: 'minho', name: '민호', entityType: 'person', views: {}, viewCandidates: {},
      appearances: [{ appearanceKey: 'current', label: 'Now', isDefault: true, narrativeTime: null, sheetUrl: url('now'), portraitUrl: null, appearance: 'a man', appearanceNative: '남자', viewCandidates: { main: [cand('now', 25, true), cand('old1', 23)] } }],
    }],
    worldAssets: [{
      locationId: 'hall', name: '복도', sceneId: 'sc1', wideShot: url('hall-now'), visualDescription: 'a hall', visualDescriptionNative: '복도', candidates: [cand('hall-now', 25, true)],
      appearances: [{ appearanceKey: 'night', label: 'Night', narrativeTime: null, visualDescription: 'a hall at night', visualDescriptionNative: '밤 복도', wideShot: url('night-now'), candidates: [cand('night-now', 25), cand('night-old', 24)] }],
    }],
    generatingViews: [], generatingLocations: [], viewFailures: {}, worldFailures: {}, contentRefusals: {},
  } as never)
})
afterEach(() => vi.useRealTimers())

describe('Artist 상세의 보는 그림', () => {
  it('인물 상세를 지난 그림으로 열면 큰 그림이 그 그림이고 "지난 그림 보는 중 · 그린 때"와 [채택] · [지금 그림 보기]가 보인다', () => {
    // 왜: 오너 A4 "과거 클릭 후 상세페이지로 들어가면 '채택'" — 어느 그림을 보고 있는지, 무엇을 누르면 되는지 한 줄로 보인다(시안 없음).
    const out = html(character('old1'))
    expect(out).toContain('data-testid="artist-detail-viewing"')
    expect(out).toContain('Viewing an earlier picture · 3d ago')
    // 큰 그림(왼쪽 칸, 보는 줄 바로 위)이 그 그림이다 — 오른쪽 모습 목록의 작은 그림은 지금 그림 그대로.
    const big = out.slice(0, out.indexOf('data-testid="artist-detail-viewing"'))
    expect(big).toContain(`src="${url('old1')}"`)
    expect(big).not.toContain(`src="${url('now')}"`)
    expect(out).toContain('>Adopt<')
    expect(out).toContain('>Back to current<')
    useLocaleStore.setState({ locale: 'ko' })
    const ko = html(character('old1'))
    expect(ko).toContain('지난 그림 보는 중 · 3일 전')
    expect(ko).toContain('>채택<')
    expect(ko).toContain('>지금 그림 보기<')
    // 지난 그림 없이 열면(카드 그림 누르기 · +N) 지금처럼 지금 그림만.
    const plain = html(character(null))
    expect(plain).not.toContain('data-testid="artist-detail-viewing"')
    expect(plain).toContain(`src="${url('now')}"`)
  })

  it('배경 상세를 그 모습의 지난 그림으로 열면 큰 그림이 그 그림이고 [채택]이 보인다', () => {
    // 왜: 오너 A4 — 배경도 인물과 같은 상세 · 같은 말.
    const out = html(world('night-old'))
    expect(out).toContain('Viewing an earlier picture · 2d ago')
    const big = out.slice(0, out.indexOf('data-testid="artist-detail-viewing"'))
    expect(big).toContain(`src="${url('night-old')}"`)
    expect(big).not.toContain(`src="${url('night-now')}"`)
    expect(out).toContain('>Adopt<')
  })

  it('소품 상세를 지난 그림으로 열면 큰 그림이 그 그림이고 "지난 그림 보는 중 · 그린 때"와 [채택]이 보인다', () => {
    // 왜: 오너 A4 — 소품도 인물 · 배경과 같은 상세 · 같은 말(리드 승인 소품 기록 표).
    useArtistStore.setState({
      propAssets: [{ propId: 'obj_ring', name: '은반지', appearance: 'a ring', appearanceNative: '은반지', imageUrl: url('ring-now'), sourceHash: null, origin: 'producer', candidates: [cand('ring-now', 25, true), cand('ring-old', 24)] }],
      propUsage: {}, selectedPropAppearances: {}, generatingProps: [], propFailures: {}, propContentRefusals: {},
    } as never)
    const out = html(createElement(PropDetailPanels, { propId: 'obj_ring', viewCandidateId: 'ring-old' }))
    expect(out).toContain('Viewing an earlier picture · 2d ago')
    const big = out.slice(0, out.indexOf('data-testid="artist-detail-viewing"'))
    expect(big).toContain(`src="${url('ring-old')}"`)
    expect(big).not.toContain(`src="${url('ring-now')}"`)
    expect(out).toContain('>Adopt<')
    expect(html(createElement(PropDetailPanels, { propId: 'obj_ring' }))).not.toContain('data-testid="artist-detail-viewing"')
  })

  it('지난 그림을 보는 동안에는 큰 그림 아래의 지금 그림 밑 글(그림체 · 올린 그림)을 숨긴다', () => {
    // 왜: 밑 글은 지금 그림 이야기라 지난 그림 아래에 있으면 그 그림 설명으로 읽힌다 — "레퍼런스로 올린 그림"이 지난 생성 그림 아래에 보였다(브라우저 확인 11/26, 혼자 정한 것).
    expect(html(character(null))).toContain('>Turnaround sheet<')
    expect(html(character('old1'))).not.toContain('>Turnaround sheet<')
    expect(html(world(null))).toContain('>Background image<')
    expect(html(world('night-old'))).not.toContain('>Background image<')
  })

  it('다른 작품 스타일 판에서 그린 지난 그림이면 [채택]이 꺼지고 "다른 스타일이라 채택할 수 없어요"가 보인다', () => {
    // 왜: 작품 스타일은 하나다(10/28 오너) — 꺼진 까닭을 글로 보인다(QA 1차 #06 "꺼진 단추는 까닭을 글로").
    const switchedAt = '2026-11-24T00:00:00.000Z'
    useArtistVersionStore.setState({ versions: [
      { n: 1, styleId: 'real', styleKey: 'real', customStyle: null, current: false, active: [{ from: null, to: switchedAt }], createdAt: '', thumbs: [] },
      { n: 2, styleId: 'watercolor', styleKey: 'watercolor', customStyle: null, current: true, active: [{ from: switchedAt, to: null }], createdAt: '', thumbs: [] },
    ] as never })
    useLocaleStore.setState({ locale: 'ko' })
    const out = html(character('old1'))
    expect(tagOf(out, 'artist-detail-adopt')).toMatch(/\sdisabled=""/)
    expect(out).toContain('다른 스타일이라 채택할 수 없어요')
  })
})
