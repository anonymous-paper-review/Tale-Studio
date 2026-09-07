// 결제 상품 목록 — 우리 플랜·팩과 Paddle 상품의 대응표 (#payments-phase-3 P2, v4 3_요금제·2_Take경제).
//   가격·Take 수의 진실원은 ~/Downloads/ref/tale_pricing_usd_v4.xlsx (v4.0 · 2026-08-24)이고 이 파일은
//   그 시트를 코드로 옮긴 것이다. 축 4개(프로젝트당 분·연결·Take·Export)와 Account 는 plan-limits.ts 가
//   소유하므로 여기서 복제하지 않고 getPlanEntitlements 로 가리킨다 (tests/paddle-catalog.test.ts 가 대조).
//
//   Paddle 가격 ID 는 환경마다 다르다(샌드박스·라이브 별개 계정). env 에서 읽고, 없으면 null —
//   isPurchasable 이 false 라 결제 버튼이 비활성으로 그려진다. ID 는 P6(상품 등록 스크립트)이 채운다.
import { getPlanEntitlements, type PlanEntitlements } from '@/lib/plan-limits'

export type PaddlePlanId = 's1' | 's2' | 's5' | 's10' | 'p10' | 'p15' | 'p20' | 'p25' | 'p30'
export type PaddleTakePackId = 'mini' | 'standard' | 'pro' | 'studio'
export type PlanTier = 'starter' | 'production'

export interface PaddlePlan {
  id: PaddlePlanId
  /** 시트 표기 그대로 (S-1 … P-30). */
  name: string
  tier: PlanTier
  monthlyPriceUsd: number
  entitlements: PlanEntitlements
  /** Paddle price ID (pri_…). 등록 전에는 null. */
  paddlePriceId: string | null
}

export interface PaddleTakePack {
  id: PaddleTakePackId
  name: string
  takes: number
  priceUsd: number
  paddlePriceId: string | null
}

function envPriceId(key: string): string | null {
  const value = process.env[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function plan(id: PaddlePlanId, name: string, tier: PlanTier, monthlyPriceUsd: number): PaddlePlan {
  return {
    id,
    name,
    tier,
    monthlyPriceUsd,
    entitlements: getPlanEntitlements(id),
    paddlePriceId: envPriceId(`NEXT_PUBLIC_PADDLE_PRICE_PLAN_${id.toUpperCase()}`),
  }
}

function pack(id: PaddleTakePackId, name: string, takes: number, priceUsd: number): PaddleTakePack {
  return {
    id,
    name,
    takes,
    priceUsd,
    paddlePriceId: envPriceId(`NEXT_PUBLIC_PADDLE_PRICE_PACK_${id.toUpperCase()}`),
  }
}

/** 구독 플랜 9개 — 무료(결제 없음)와 스튜디오(수동 계약)는 여기 없다. */
export const PADDLE_PLANS: readonly PaddlePlan[] = [
  plan('s1', 'S-1', 'starter', 15),
  plan('s2', 'S-2', 'starter', 30),
  plan('s5', 'S-5', 'starter', 60),
  plan('s10', 'S-10', 'starter', 110),
  plan('p10', 'P-10', 'production', 199),
  plan('p15', 'P-15', 'production', 449),
  plan('p20', 'P-20', 'production', 649),
  plan('p25', 'P-25', 'production', 999),
  plan('p30', 'P-30', 'production', 1299),
]

/** Take 충전 팩 4개 — 구매일부터 12개월 유효 (v4 6_소멸시효). */
export const PADDLE_TAKE_PACKS: readonly PaddleTakePack[] = [
  pack('mini', 'Mini', 50, 29),
  pack('standard', 'Standard', 200, 109),
  pack('pro', 'Pro', 1000, 479),
  pack('studio', 'Studio', 5000, 2199),
]

/** Paddle 가격 ID 가 있어야 결제창을 열 수 있다. 없으면 버튼은 비활성. */
export function isPurchasable(item: { paddlePriceId: string | null }): boolean {
  return typeof item.paddlePriceId === 'string' && item.paddlePriceId.length > 0
}

export type ResolvedPaddlePrice = { kind: 'plan'; plan: PaddlePlan } | { kind: 'pack'; pack: PaddleTakePack }

/**
 * 웹훅 역매핑 — 결제 알림에 실린 Paddle 가격 ID 를 우리 플랜·팩으로. env 를 매 호출 다시 읽는다
 * (테스트가 env 를 바꾸며 돌고, 런타임에서도 모듈 로드 시점에 고정되지 않게). 모르는 ID 는 null.
 */
export function resolvePaddlePrice(priceId: string | null | undefined): ResolvedPaddlePrice | null {
  if (!priceId) return null
  for (const p of PADDLE_PLANS) {
    if (envPriceId(`NEXT_PUBLIC_PADDLE_PRICE_PLAN_${p.id.toUpperCase()}`) === priceId) return { kind: 'plan', plan: p }
  }
  for (const p of PADDLE_TAKE_PACKS) {
    if (envPriceId(`NEXT_PUBLIC_PADDLE_PRICE_PACK_${p.id.toUpperCase()}`) === priceId) return { kind: 'pack', pack: p }
  }
  return null
}

/** Take 계수 (v4 2_Take경제) — 가격 페이지 각주용. 실제 차감 계수는 take-cost.ts 가 소유한다. */
export const TAKE_COEFFICIENT_NOTES: readonly { model: string; takes: number }[] = [
  { model: 'Seedance Pro 720p', takes: 1 },
  { model: 'Seedance Pro 1080p', takes: 4 },
  { model: 'Seedance 2.0 Fast 720p', takes: 4 },
  { model: 'Seedance 2.0 720p', takes: 5 },
  { model: 'Seedance 2.0 1080p', takes: 10 },
]
