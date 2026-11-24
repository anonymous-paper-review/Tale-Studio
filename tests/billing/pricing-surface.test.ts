// 요금 화면이 화면 언어와 결제 준비 상태에 따라 어떤 통화·안내·구매 버튼을 보일지 검사한다 (오너 2026-11-24 시안 v2).
import { describe, expect, it } from 'vitest'
import { pricingSurface, purchaseAction } from '@/lib/billing/pricing-selection'

const koReady = pricingSurface({ locale: 'ko', checkoutEnabled: false, koreanCardReady: true, koreanSubscriptionReady: false })
const enClosed = pricingSurface({ locale: 'en', checkoutEnabled: false, koreanCardReady: true, koreanSubscriptionReady: false })

describe('요금 화면 표시', () => {
  // 왜: 한국 손님에게 달러가 크게 보이고 원화가 작게 보였다 (오너 2026-11-24).
  it('한국어 화면에서 국내 카드 결제가 열려 있으면 가격을 원화로 보인다', () => {
    expect(koReady.currency).toBe('krw')
  })

  // 왜: 큰 "결제 준비 중" 상자 때문에 카드사 심사관·손님이 결제가 안 되는 사이트로 볼 수 있었다.
  it('한국어 화면에서 국내 카드 결제가 열려 있으면 "결제 준비 중" 대신 "Take 팩은 국내 카드로 바로 살 수 있어요" 안내를 보인다', () => {
    expect(koReady.banner).toBe('korean-card')
  })

  // 왜: 이니시스 정기결제 계약 전이라 구독은 아직 팔 수 없다 (오너 ②).
  it('한국어 화면에서 정기결제가 아직 없으면 구독은 "구독 결제는 곧 열려요"로 보이고 결제창을 열지 않는다', () => {
    expect(purchaseAction(koReady, 'plan')).toBe('subscription-soon')
  })

  // 왜: 되는 버튼(국내 카드)이 가장 약하게 보였고, 눌러도 안 되는 달러 버튼이 가장 눈에 띄었다.
  it('한국어 화면에서 Take 팩 구매 버튼은 하나이고 국내 카드 결제창으로 간다', () => {
    expect(purchaseAction(koReady, 'pack')).toBe('korean-card')
  })

  // 왜: 정기결제 계약이 끝나면 구독도 같은 버튼으로 국내 카드 결제가 된다.
  it('한국어 화면에서 정기결제가 열리면 구독도 국내 카드 결제창으로 간다', () => {
    const ready = pricingSurface({ locale: 'ko', checkoutEnabled: false, koreanCardReady: true, koreanSubscriptionReady: true })
    expect(purchaseAction(ready, 'plan')).toBe('korean-card')
  })

  // 왜: 정상 경로 고정. 영어 화면은 Paddle 을 붙일 때까지 지금처럼 닫혀 있다 (오너 2026-11-24).
  it('영어 화면은 달러 가격과 "결제 준비 중" 안내를 보이고 구매 버튼은 안내만 띄운다', () => {
    expect(enClosed.currency).toBe('usd')
    expect(enClosed.banner).toBe('preparing')
    expect(purchaseAction(enClosed, 'pack')).toBe('notice')
  })

  // 왜: 영어 화면의 한국 손님이 국내 카드 결제가 있는 줄 모르고 나갈 수 있다.
  it('영어 화면에서 국내 카드 결제가 열려 있으면 "한국어로 바꾸기" 링크를 보인다', () => {
    expect(enClosed.switchToKorean).toBe(true)
    expect(koReady.switchToKorean).toBe(false)
  })

  // 왜: 오너 2026-11-25 "한국어일 때는 원화로 표기". 국내 카드 키가 없는 미리보기에서도 한국어면 원화다.
  it('한국어 화면은 국내 카드 결제가 준비되지 않았어도 가격을 원화로 보이고 구매 단추는 준비 중 안내만 띄운다', () => {
    const notReady = pricingSurface({ locale: 'ko', checkoutEnabled: false, koreanCardReady: false, koreanSubscriptionReady: false })
    expect(notReady.currency).toBe('krw')
    expect(notReady.banner).toBe('preparing')
    expect(purchaseAction(notReady, 'pack')).toBe('notice')
    expect(notReady.switchToKorean).toBe(false)
  })

  // 왜: 정상 경로 고정. 해외 결제(Paddle)가 열리면 영어 화면은 달러로 바로 산다.
  it('해외 결제가 열려 있으면 영어 화면은 안내 상자 없이 Paddle 결제로 간다', () => {
    const open = pricingSurface({ locale: 'en', checkoutEnabled: true, koreanCardReady: true, koreanSubscriptionReady: false })
    expect(open.banner).toBe(null)
    expect(purchaseAction(open, 'pack')).toBe('paddle')
  })
})
