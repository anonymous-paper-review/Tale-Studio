// 고를 수 있는 그림체는 실사 · 2D 일본 애니 · 수채 · 스톱모션 네 가지이고, 없어진 그림체에는 네 가지 중 가장 가까운 것을 권한다 (D6 오너 2026-11-22)
import { describe, expect, it } from 'vitest'
import { OFFERED_STYLE_KEYS, isOfferedStyle, nearestOfferedStyle, offeredStyles } from '@/lib/style-offer'
import { styleAnchorName } from '@/lib/style-anchor-name'

// 개발 DB 카탈로그(style_anchors)와 같은 12종 — 이름 · 매체 · 순서(sort_order) 그대로.
const CATALOG = [
  { key: 'real', label: '실사', subtitle: null, medium: 'live_action' },
  { key: 'real_3d', label: '3D 애니메이션', subtitle: null, medium: '3d' },
  { key: 'jp_anime', label: '2D 일본 애니', subtitle: null, medium: '2d_anime' },
  { key: 'us_cartoon', label: '미국 카툰', subtitle: null, medium: '2d_cartoon' },
  { key: 'stop_motion', label: '스톱모션', subtitle: null, medium: 'stop_motion' },
  { key: 'watercolor', label: '수채', subtitle: null, medium: 'watercolor' },
  { key: 'real_jp_melo', label: '일본 멜로', subtitle: 'Japanese Melodrama', medium: 'live_action' },
  { key: 'real_psy_horror', label: '심리 공포', subtitle: 'Psychological Horror', medium: 'live_action' },
  { key: 'real_hitech_sf', label: '하이테크 SF', subtitle: 'Hi-Tech Sci-Fi', medium: 'live_action' },
  { key: 'real_desert_fantasy', label: '사막 판타지', subtitle: 'Desert Fantasy', medium: 'live_action' },
  { key: 'real_urban_hero', label: '도심 히어로', subtitle: 'Urban Hero', medium: 'live_action' },
  { key: 'real_euro_period', label: '유럽 역사극', subtitle: 'European Period Drama', medium: 'live_action' },
]

describe('고를 수 있는 그림체 네 가지', () => {
  it('고를 수 있는 그림체는 실사 · 2D 일본 애니 · 수채 · 스톱모션 네 가지이고 목록 순서를 따른다', () => {
    // 왜: 오너 "4종만 놔두고 다른 선택지를 아예 없애줘" — 영상 품질을 지킬 수 있는 네 가지만 남긴다(D6). 순서는 DB 카탈로그 순서 그대로(혼자 정한 것).
    expect([...OFFERED_STYLE_KEYS].sort()).toEqual(['jp_anime', 'real', 'stop_motion', 'watercolor'])
    expect(offeredStyles(CATALOG).map((style) => style.key)).toEqual(['real', 'jp_anime', 'stop_motion', 'watercolor'])
    expect(CATALOG.filter((style) => isOfferedStyle(style.key)).length).toBe(4)
    expect(isOfferedStyle('real_3d')).toBe(false)
    expect(isOfferedStyle('custom_1234')).toBe(false)
    expect(isOfferedStyle(null)).toBe(false)
  })

  it('네 가지 이름은 한국어 화면에서 실사 · 2D 일본 애니 · 수채 · 스톱모션, 영어 화면에서 Live Action · 2D Japanese Anime · Watercolor · Stop Motion이다', () => {
    // 왜: 오너 "애니는 2D 일본 애니", "원래 이름인 스톱모션" — 이름은 이미 같아 바꾸지 않는다(D6). 영어 화면에 한국어가 나오면 안 된다.
    const four = offeredStyles(CATALOG)
    const byKey = (key: string) => four.find((style) => style.key === key)!
    expect(['real', 'jp_anime', 'watercolor', 'stop_motion'].map((key) => styleAnchorName(byKey(key), 'ko'))).toEqual(['실사', '2D 일본 애니', '수채', '스톱모션'])
    expect(['real', 'jp_anime', 'watercolor', 'stop_motion'].map((key) => styleAnchorName(byKey(key), 'en'))).toEqual(['Live Action', '2D Japanese Anime', 'Watercolor', 'Stop Motion'])
  })
})

describe('없어진 그림체의 가장 가까운 짝', () => {
  it('3D 애니메이션에는 스톱모션, 미국 카툰에는 2D 일본 애니, 실사 변형 여섯에는 실사를 가장 가까운 것으로 권한다', () => {
    // 왜(혼자 정한 것): 개발 DB 그림체 설명을 견줬다 — 3D 와 스톱모션은 선 없이 이어지는 음영 · 접촉 그림자 · 섬유 질감이 같고,
    //   미국 카툰과 2D 일본 애니는 외곽선 · 딱딱한 그림자의 2D 그림이며, 실사 변형은 매체가 실사이고 색 · 빛 결만 다르다.
    const nearest = Object.fromEntries(CATALOG.filter((style) => !isOfferedStyle(style.key)).map((style) => [style.key, nearestOfferedStyle({ key: style.key, medium: style.medium })]))
    expect(nearest).toEqual({
      real_3d: 'stop_motion',
      us_cartoon: 'jp_anime',
      real_jp_melo: 'real',
      real_psy_horror: 'real',
      real_hitech_sf: 'real',
      real_desert_fantasy: 'real',
      real_urban_hero: 'real',
      real_euro_period: 'real',
    })
  })

  it('네 가지 안의 그림체는 그대로 자기 자신이고, 올린 그림체는 저장된 매체로 가장 가까운 것을 정한다', () => {
    // 왜: 이미 그림체를 올린 작품은 그림을 다시 보지 않고 저장된 매체로 짝을 정한다(혼자 정한 것 — 결정 2: 그림을 보고 권하지 않는다).
    for (const key of OFFERED_STYLE_KEYS) expect(nearestOfferedStyle({ key })).toBe(key)
    expect(nearestOfferedStyle({ key: 'custom_1', medium: '2d_cartoon' })).toBe('jp_anime')
    expect(nearestOfferedStyle({ key: 'custom_2', medium: '3d' })).toBe('stop_motion')
    expect(nearestOfferedStyle({ key: 'custom_3', medium: 'live_action' })).toBe('real')
    expect(nearestOfferedStyle({ key: 'custom_4', medium: 'watercolor' })).toBe('watercolor')
    expect(nearestOfferedStyle({ key: 'custom_5', medium: null })).toBeNull()
    expect(nearestOfferedStyle({ key: null })).toBeNull()
  })
})
