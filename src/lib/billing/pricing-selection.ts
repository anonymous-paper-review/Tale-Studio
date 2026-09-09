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
