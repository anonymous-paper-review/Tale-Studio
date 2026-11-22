// Artist 스타일 창(처음 그리기 · 다시 만들기)은 네 가지만 고를 칸으로 보이고, 이미 이 작품 · 앞 화가 쓰는 없어진 스타일은 그 칸 하나만 남긴다 (D6 오너 2026-11-22, 기존 작품은 리드 2026-11-22 안 1 바탕)
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
// 시리즈 정보는 시험마다 정한다(서버를 읽지 않는다).
const series = vi.hoisted(() => ({ view: null as unknown }))
vi.mock('@/features/series/use-series-info', () => ({ useSeriesInfo: () => ({ view: series.view, loading: false, error: false }) }))

import { StyleMakeDialog } from '@/features/artist-room/style-make-dialog'
import { RegenerateStyleDialog } from '@/features/artist-room/regenerate-style-dialog'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore, type StyleAnchor } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { translate } from '@/lib/i18n/translate'

const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
const anchor = (key: string, label: string, medium: string, subtitle: string | null = null): StyleAnchor => ({ key, label, medium, imageUrl: null, previewUrl: null, subtitle })
// 개발 DB 카탈로그와 같은 12종(순서 · 매체 그대로).
const CATALOG: StyleAnchor[] = [
  anchor('real', '실사', 'live_action'),
  anchor('real_3d', '3D 애니메이션', '3d'),
  anchor('jp_anime', '2D 일본 애니', '2d_anime'),
  anchor('us_cartoon', '미국 카툰', '2d_cartoon'),
  anchor('stop_motion', '스톱모션', 'stop_motion'),
  anchor('watercolor', '수채', 'watercolor'),
  anchor('real_jp_melo', '일본 멜로', 'live_action', 'Japanese Melodrama'),
  anchor('real_psy_horror', '심리 공포', 'live_action', 'Psychological Horror'),
  anchor('real_hitech_sf', '하이테크 SF', 'live_action', 'Hi-Tech Sci-Fi'),
  anchor('real_desert_fantasy', '사막 판타지', 'live_action', 'Desert Fantasy'),
  anchor('real_urban_hero', '도심 히어로', 'live_action', 'Urban Hero'),
  anchor('real_euro_period', '유럽 역사극', 'live_action', 'European Period Drama'),
]

function serveCurrent(...stores: Array<{ getState: () => object; getInitialState: () => object }>) {
  for (const store of stores) Object.assign(store.getInitialState(), store.getState())
}
const html = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(element).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
/** testid 칸들의 [이름, 골라짐] — 그린 순서대로. */
function tiles(out: string, testId: string): Array<[string, boolean]> {
  const found: Array<[string, boolean]> = []
  const re = new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</button>`, 'g')
  for (const match of out.matchAll(re)) {
    const name = match[1].match(/<span class="truncate text-\[13px\][^"]*">([^<]+)<\/span>/)?.[1] ?? ''
    found.push([name, /aria-checked="true"/.test(match[0])])
  }
  return found
}

function setStyle(savedKey: string) {
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'p1', currentStage: 'artist', reachedStage: 'artist', producerLocked: true, treatmentDraft: true })
  useProducerStore.setState({ styleAnchors: CATALOG, styleAnchorKey: savedKey, customStyleAnchor: null, cast: [], backgrounds: [] })
  useArtistVersionStore.setState({ projectId: 'p1', versions: [], currentN: 1, loaded: true, busy: null, regenDialogOpen: true, regen: null })
  serveCurrent(useLocaleStore, useProjectStore, useProducerStore, useArtistVersionStore)
}
const makeWindow = () => html(createElement(StyleMakeDialog, { open: true, onOpenChange: () => {}, onStarted: () => {} }))
const regenWindow = () => html(createElement(RegenerateStyleDialog))

beforeEach(() => {
  series.view = null
})

describe('스타일 창은 네 가지만', () => {
  it('Artist 처음 그리기 창과 다시 만들기 창에는 실사 · 2D 일본 애니 · 수채 · 스톱모션 네 칸만 고를 칸으로 보인다', () => {
    // 왜: 오너 "4종만 놔두고 다른 선택지를 아예 없애줘" — 처음 고를 때도, 다른 스타일로 다시 만들 때도 네 가지뿐이다(D6).
    setStyle('real')
    const make = makeWindow()
    expect(tiles(make, 'artist-style-option')).toEqual([['실사', true], ['2D 일본 애니', false], ['스톱모션', false], ['수채', false]])
    expect(make).not.toContain('data-testid="artist-style-retired"')
    setStyle('watercolor')
    const regen = regenWindow()
    expect(tiles(regen, 'artist-style-option')).toEqual([['실사', false], ['2D 일본 애니', false], ['스톱모션', false], ['수채', true]])
    for (const hidden of ['3D 애니메이션', '미국 카툰', '일본 멜로', '심리 공포', '하이테크 SF', '사막 판타지', '도심 히어로', '유럽 역사극']) {
      expect(make, hidden).not.toContain(hidden)
      expect(regen, hidden).not.toContain(hidden)
    }
  })

  it('Artist 처음 그리기 창을 열 때 정해 둔 스타일이 없어진 것이면 가장 가까운 것을 골라 두고 그 까닭을 한 줄 보인다', () => {
    // 왜: 오너 "숨긴 스타일은 가장 가까운 4종 중 하나를 제안해줘"(D6) — 그림이 아직 없는 작품이 예전에 정해 둔 3D 애니메이션이면 스톱모션을 골라 두고 말한다.
    setStyle('real_3d')
    const out = makeWindow()
    expect(tiles(out, 'artist-style-option')).toEqual([['실사', false], ['2D 일본 애니', false], ['스톱모션', true], ['수채', false]])
    expect(out).toContain('data-testid="artist-style-nearest"')
    expect(out).toContain('3D 애니메이션은 이제 고를 수 없어서 가장 가까운 스톱모션을 골라 뒀어요.')
    expect(out).toContain('스톱모션으로 그리기')
  })

  it('시리즈 다음 화는 앞 화 스타일이 없어진 것이어도 이어받아 처음 그리기 창에 앞 화 스타일 칸으로 골라져 있다', () => {
    // 왜(리드 2026-11-22 안 1 바탕): 같은 작품의 다음 화는 앞 화 그림체를 이어받는다 — 앞 화 그림을 그대로 쓰려면 스타일이 같아야 한다. 다른 칸은 네 가지뿐이다.
    setStyle('us_cartoon')
    series.view = { prevTitle: '1화', prevProjectId: 'p0', prevDeleted: false, characters: [], locations: [], styleId: 'us_cartoon', currentStyleId: 'us_cartoon', hasVoices: false, continuesLastScene: false, copyFailures: [] }
    const out = makeWindow()
    expect(tiles(out, 'artist-style-retired')).toEqual([['미국 카툰', true]])
    expect(tiles(out, 'artist-style-option')).toEqual([['실사', false], ['2D 일본 애니', false], ['스톱모션', false], ['수채', false]])
    expect(out).toContain(ko('Previous episode style'))
    expect(out).toContain(ko('No longer offered'))
    expect(out).not.toContain('data-testid="artist-style-nearest"')
    expect(out).toContain('미국 카툰으로 그리기')
  })

  it('다시 만들기 창에서 지금 스타일이 없어진 것이면 "지금 · 새로 고를 수 없음" 칸으로 보이고 나머지는 네 칸이다', () => {
    // 왜(리드 2026-11-22 안 1 바탕): 이미 그 스타일로 그린 작품은 그 스타일로 계속 그릴 수 있다(같은 스타일로 다시 만들기 포함) — 새로 고르는 칸은 네 가지뿐이다.
    setStyle('real_psy_horror')
    const out = regenWindow()
    expect(tiles(out, 'artist-style-retired')).toEqual([['심리 공포', true]])
    expect(tiles(out, 'artist-style-option')).toEqual([['실사', false], ['2D 일본 애니', false], ['스톱모션', false], ['수채', false]])
    expect(out).toContain(ko('Now'))
    expect(out).toContain(ko('No longer offered'))
  })
})
