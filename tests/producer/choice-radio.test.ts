// 하나만 고르는 칸(장르 · 길이 · 화면 비율)은 화면 읽기 프로그램에 고른 칸을 '선택됨'으로, 눌러 켜고 끄는 칩은 '눌림'으로 알리는지 검사한다 (2026-11-03 v3)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { ChoiceChip, OptionCard } from '@/components/controls/choice-chip'

describe('고르기 칩 · 선택 카드의 고름 알림', () => {
  it("하나만 고르는 칸은 화면 읽기 프로그램에 고른 칸을 '선택됨'으로 알린다", () => {
    // 왜: 장르 · 길이 · 화면 비율처럼 하나만 고르는 설정 칸을 '눌림'으로 알리면 화면 읽기 프로그램이 무엇을 골랐는지 읽지 못한다.
    const chip = renderToStaticMarkup(createElement(ChoiceChip, { role: 'radio', selected: true }, '코미디'))
    expect(chip).toContain('role="radio" aria-checked="true"')
    expect(chip).not.toContain('aria-pressed')
    const card = renderToStaticMarkup(createElement(OptionCard, { role: 'radio', selected: false, title: '15초 이하', description: '숏폼' }))
    expect(card).toContain('role="radio" aria-checked="false"')
    expect(card).not.toContain('aria-pressed')
  })

  it("눌러 켜고 끄는 칩 · 카드는 지금처럼 화면 읽기 프로그램에 '눌림'으로 알린다", () => {
    // 왜: 정상 경로 고정 — 채팅 빠른 답 · 필터 칩처럼 눌러 켜고 끄는 단추는 눌림으로 알린다.
    const chip = renderToStaticMarkup(createElement(ChoiceChip, { selected: true }, '전부 다시 써 줘'))
    expect(chip).toContain('aria-pressed="true"')
    expect(chip).not.toContain('aria-checked')
    const card = renderToStaticMarkup(createElement(OptionCard, { selected: false, title: '9:16' }))
    expect(card).toContain('aria-pressed="false"')
    expect(card).not.toContain('aria-checked')
  })
})
