import { PADDLE_PLANS, PADDLE_TAKE_PACKS, type PaddlePlan, type PaddleTakePack } from './catalog'

export const PRICING_FAMILIES = ['starter', 'production', 'take'] as const
export type PricingFamily = (typeof PRICING_FAMILIES)[number]
export type PricingOption = { kind: 'plan'; item: PaddlePlan } | { kind: 'pack'; item: PaddleTakePack }
export type PricingSelection = { family: PricingFamily; index: number }

/** 화면과 로그인 복귀가 같은 카탈로그 항목을 선택한다. */
export function pricingOptions(family: PricingFamily): PricingOption[] {
  return family === 'take'
    ? PADDLE_TAKE_PACKS.map(item => ({ kind: 'pack', item }))
    : PADDLE_PLANS.filter(item => item.tier === family).map(item => ({ kind: 'plan', item }))
}

export function pricingSelectionFromSearch(search: Pick<URLSearchParams, 'getAll'>): PricingSelection | null {
  const plans = search.getAll('plan')
  const packs = search.getAll('pack')
  if (plans.length + packs.length !== 1) return null
  const kind = plans.length ? 'plan' : 'pack'
  const id = (plans.length ? plans : packs)[0]
  for (const family of PRICING_FAMILIES) {
    const index = pricingOptions(family).findIndex(option => option.kind === kind && option.item.id === id)
    if (index !== -1) return { family, index }
  }
  return null
}

export function pricingReturnPath(option: PricingOption): string {
  return `/pricing?${option.kind}=${encodeURIComponent(option.item.id)}`
}

/** 운영 구매가 닫힌 동안 구매 버튼이 띄우는 안내. 서버가 payments_not_open 으로 거절할 때(계정 화면 Take 충전)와 같은 문장이다. */
export const PAYMENTS_NOT_OPEN_COPY = 'Payments are being prepared'

/**
 * 요금표 구매 버튼의 상태(2026-11-22 오너: "눌러도 Take 충전처럼 아직 안 된다고 뜨게").
 * 구매가 닫힌 동안에는 버튼을 죽이지 않고, 누르면 서버에 가지 않고 준비 중 안내만 띄운다 — 로그인 전 방문자도 같은 안내를 본다.
 */
export function purchaseButton(input: { checkoutEnabled: boolean; purchasable: boolean; busy: boolean }): {
  disabled: boolean
  action: 'checkout' | 'notice'
  notice: string | null
} {
  if (!input.checkoutEnabled) return { disabled: input.busy, action: 'notice', notice: PAYMENTS_NOT_OPEN_COPY }
  return { disabled: input.busy || !input.purchasable, action: 'checkout', notice: null }
}
