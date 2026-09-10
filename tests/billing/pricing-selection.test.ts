// 가격표는 세 분류의 기존 상품만 고르고 로그인 뒤에도 같은 선택으로 돌아온다.
import { describe, expect, it } from 'vitest'
import { PADDLE_PLANS, PADDLE_TAKE_PACKS } from '@/lib/billing/catalog'
import { PRICING_FAMILIES, pricingOptions, pricingSelectionFromSearch, pricingReturnPath } from '@/lib/billing/pricing-selection'

describe('가격표 팝업의 상품 선택', () => {
  it('가격표는 Starter, Producer, Take 세 분류로 기존 상품 13개를 제공한다', () => {
    expect(PRICING_FAMILIES).toEqual(['starter', 'production', 'take'])
    expect(PRICING_FAMILIES.map(f => pricingOptions(f).length)).toEqual([4, 5, 4])
    expect(PRICING_FAMILIES.flatMap(f => pricingOptions(f).map(o => o.item))).toEqual([...PADDLE_PLANS, ...PADDLE_TAKE_PACKS])
  })
  it('Starter 5분을 고르면 같은 상품의 월 60달러와 매월 60 Take를 표시한다', () => {
    const selected = pricingOptions('starter')[2]
    expect(selected.kind).toBe('plan')
    expect(selected.item.id).toBe('s5')
    if (selected.kind !== 'plan') throw new Error('요금제 선택이어야 합니다')
    expect(selected.item.monthlyPriceUsd).toBe(60)
    expect(selected.item.entitlements.includedTakesPerMonth).toBe(60)
    expect(selected.item.entitlements.maxMinutesPerProject).toBe(5)
  })
  it('각 옵션은 로그인 후 같은 분류와 선택으로 돌아온다', () => {
    for (const family of PRICING_FAMILIES) {
      for (const [index, option] of pricingOptions(family).entries()) {
        const url = new URL(pricingReturnPath(option), 'https://talestudio.art')
        expect(url.pathname).toBe('/pricing')
        expect(pricingSelectionFromSearch(url.searchParams)).toEqual({ family, index })
      }
    }
  })
  it('알 수 없거나 서로 충돌하는 상품 링크는 임의 선택이나 결제를 만들지 않는다', () => {
    for (const search of ['', '?plan=unknown', '?pack=s1', '?plan=s5&pack=mini', '?plan=s5&plan=p30', '?amount=1']) {
      expect(pricingSelectionFromSearch(new URLSearchParams(search))).toBeNull()
    }
  })
})
