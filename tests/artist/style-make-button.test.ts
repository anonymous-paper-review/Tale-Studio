// 스타일 고르기 창의 그리기 단추가 스타일 이름 받침에 맞는 조사(으로 · 로)를 붙인다
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { makeButtonText } from '@/features/artist-room/style-make-dialog'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const en = (text: string, params?: Record<string, string | number>) => translate('en', text, params)

describe('스타일 고르기 창의 그리기 단추', () => {
  it('받침이 있는 스타일 이름이면 그리기 단추가 "으로"를 붙인다', () => {
    // 왜: 처음 그림을 만들 때 누구나 보는 단추가 "3D 애니메이션로" · "미국 카툰로"로 보였다(스타일 이름 대부분이 받침으로 끝난다).
    expect(makeButtonText(ko, '3D 애니메이션')).toBe('3D 애니메이션으로 그리기')
    expect(makeButtonText(ko, '미국 카툰')).toBe('미국 카툰으로 그리기')
    expect(makeButtonText(ko, '스톱모션')).toBe('스톱모션으로 그리기')
    expect(makeButtonText(ko, '일본 멜로')).toBe('일본 멜로로 그리기')
  })

  it('받침이 없거나 ㄹ 받침인 스타일 이름이면 그리기 단추가 "로"를 붙인다', () => {
    // 왜: 정상 경로 고정 — 실사 · 수채처럼 받침이 없는 이름, 내가 올린 그림체에 붙인 "연필"처럼 ㄹ 받침인 이름.
    expect(makeButtonText(ko, '실사')).toBe('실사로 그리기')
    expect(makeButtonText(ko, '수채')).toBe('수채로 그리기')
    expect(makeButtonText(ko, '연필')).toBe('연필로 그리기')
  })

  it('스타일을 고르기 전이면 그리기 단추는 이름 없이 [그리기]다', () => {
    // 왜: 정상 경로 고정 — 저장된 스타일이 없는 프로젝트는 아무것도 고르지 않은 채로 창이 열린다.
    expect(makeButtonText(ko, null)).toBe('그리기')
  })

  it('영어 화면의 그리기 단추에는 조사가 끼어들지 않는다', () => {
    // 왜: 정상 경로 고정 — 조사는 한국어 문장에만 쓴다.
    expect(makeButtonText(en, '3D Animation')).toBe('Draw it in 3D Animation')
    expect(makeButtonText(en, null)).toBe('Draw')
  })
})
