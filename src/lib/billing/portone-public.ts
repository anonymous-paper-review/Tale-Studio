// PortOne(국내 카드) 값 중 브라우저에서도 읽는 것: 원화 가격표와 결제창 키. 서버 전용 규칙은 portone.ts.
import type { PaddlePlanId, PaddleTakePackId } from '@/lib/billing/catalog'

// ── 원화 가격 ──────────────────────────────────────────────────────────────────
// 원화 금액은 오너가 정한다(고객에게 한 약속). 정해지지 않은 팩은 null — 결제창을 열지 않는다.
// 2026-11-20 오너 확정: 부가세 포함, 고객 예산 구간 바로 아래(tests/billing/portone-prices.test.ts).
export const PORTONE_PACK_PRICES_KRW: Record<PaddleTakePackId, number | null> = {
  mini: 49_900,
  standard: 149_000,
  pro: 699_000,
  studio: 2_990_000,
}

// 플랜 월 원화 금액. 역시 오너가 정한다. null 이면 구독 결제창을 열지 않는다.
export const PORTONE_PLAN_PRICES_KRW: Record<PaddlePlanId, number | null> = {
  s1: 29_900,
  s2: 49_900,
  s5: 99_900,
  s10: 149_000,
  p10: 299_000,
  p15: 699_000,
  p20: 990_000,
  p25: 1_490_000,
  p30: 1_990_000,
}

// 브라우저 번들에는 process.env.NEXT_PUBLIC_… 를 글자 그대로 쓴 곳만 값이 심긴다(catalog.ts 와 같은 이유).
export function readPortOnePublicConfig(): { storeId: string; channelKey: string } | null {
  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID?.trim()
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY?.trim()
  return storeId && channelKey ? { storeId, channelKey } : null
}

/** KG이니시스 정기결제는 일반 결제와 다른 채널(MID)이다. 카드 등록(빌링키 발급) 결제창이 이 키로 열린다. */
export function readPortOneBillingChannelKey(): string | null {
  return process.env.NEXT_PUBLIC_PORTONE_BILLING_CHANNEL_KEY?.trim() || null
}

export const PORTONE_SUBSCRIPTION_PREFIX = 'portone-sub-'
export const isPortOneSubscriptionId = (id: string | null | undefined): boolean => !!id && id.startsWith(PORTONE_SUBSCRIPTION_PREFIX)
