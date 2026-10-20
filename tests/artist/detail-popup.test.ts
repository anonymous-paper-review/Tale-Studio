// Artist 카드 상세 팝업(프로토타입 A7 · A7r): 다시 만들기 창의 추천 칩은 설명에 @단어로 들어가고 빠진다 (2026-10-20 오너 "HTML 확인해서 팝업 수정")
import { describe, expect, it } from 'vitest'
import { TRAIT_GROUPS, artistDetailTitleKey, toggleTrait } from '@/features/artist/detail-parts'
import { translate } from '@/lib/i18n'

describe('다시 만들기 창의 추천 칩', () => {
  it('인물 추천 칩은 성격 · 분위기·톤 · 체형·인상 · 시대·패션 묶음이다', () => {
    // 왜: 프로토타입 A7r "캐릭터성 추천" 그대로.
    expect(TRAIT_GROUPS.person.map((group) => translate('ko', group.name))).toEqual(['성격', '분위기·톤', '체형·인상', '시대·패션'])
    expect(TRAIT_GROUPS.person[1].words.map((word) => translate('ko', word))).toEqual(['코미디', '호러', '로맨스', '누아르', '따뜻한'])
    expect(TRAIT_GROUPS.person[0].words.map((word) => translate('ko', word))).toEqual(['냉철한', '다정한', '엉뚱한', '소심한', '당당한'])
  })

  it('배경 추천 칩은 시간·날씨 · 분위기·톤 · 공간감 묶음이다', () => {
    // 왜: 프로토타입 A7r "공간의 성격 추천" 그대로 — 배경에는 얼굴 · 의상 같은 인물 칩이 없다.
    expect(TRAIT_GROUPS.background.map((group) => translate('ko', group.name))).toEqual(['시간·날씨', '분위기·톤', '공간감'])
    expect(TRAIT_GROUPS.background[0].words.map((word) => translate('ko', word))).toEqual(['낮', '밤', '비', '노을'])
  })

  it('추천 칩을 누르면 설명 끝에 @단어가 들어가고, 다시 누르면 빠진다', () => {
    // 왜: 프로토타입 "누르면 설명에 @로 들어가요" — 같은 칩을 다시 누르면 넣은 것을 뺀다.
    const added = toggleTrait('20대 후반 직장인.', '다정한')
    expect(added).toBe('20대 후반 직장인. @다정한')
    expect(toggleTrait(added, '다정한')).toBe('20대 후반 직장인.')
  })

  it('설명이 비어 있으면 @단어만 들어간다', () => {
    expect(toggleTrait('', '밤')).toBe('@밤')
  })
})

describe('상세 팝업 제목', () => {
  it('인물은 "이름 · 인물", 배경은 "이름 · 배경", 사물은 "이름 · 사물"로 부른다', () => {
    // 왜: 프로토타입 A7 제목 — 무엇의 상세인지 이름 옆에 바로 보인다.
    expect(artistDetailTitleKey('person')).toBe('{name} · Character')
    expect(artistDetailTitleKey('background')).toBe('{name} · Background')
    expect(artistDetailTitleKey('object')).toBe('{name} · Object')
  })
})
