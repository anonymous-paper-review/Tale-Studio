// 국내 카드(원화) 결제창에 실리는 가격이 오너가 정한 표와 같은지 검사한다.
import { describe, expect, it } from 'vitest'
import { PORTONE_PACK_PRICES_KRW, PORTONE_PLAN_PRICES_KRW } from '@/lib/billing/portone-public'

describe('국내 카드 원화 가격표', () => {
  // 왜: 오너 확정(2026-11-20). 고객 예산 구간(부가세 포함 3만·5만·10만·15만·30만·70만·100만·150만·200만) 바로 아래로 맞췄다.
  it('월 구독 원화 가격은 부가세 포함 예산 구간 바로 아래 금액이다', () => {
    expect(PORTONE_PLAN_PRICES_KRW).toEqual({
      s1: 29_900,
      s2: 49_900,
      s5: 99_900,
      s10: 149_000,
      p10: 299_000,
      p15: 699_000,
      p20: 990_000,
      p25: 1_490_000,
      p30: 1_990_000,
    })
  })

  // 왜: 오너 확정(2026-11-20). Take 개수는 그대로 두고 가격만 예산 구간 바로 아래로 맞췄다.
  it('Take 충전 원화 가격은 50개 49,900원 · 200개 149,000원 · 1,000개 699,000원 · 5,000개 2,990,000원이다', () => {
    expect(PORTONE_PACK_PRICES_KRW).toEqual({
      mini: 49_900,
      standard: 149_000,
      pro: 699_000,
      studio: 2_990_000,
    })
  })
})
