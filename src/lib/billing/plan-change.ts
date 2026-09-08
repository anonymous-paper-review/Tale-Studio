// 플랜 변경 판정 (#payments-phase-3 P15). 약속: tests/billing/plan-change.test.ts.
//
//   2026-09-08 샌드박스 실측(plan-change-probe.html): Paddle 은 "항목 변경 + 갱신일 변경" 을 한 요청으로 거부한다
//   ("not possible to change items and billing date in the same request"). 그래서 상위 변경만 두 요청이다.
//   ① items + full_immediately → 새 플랜 한 달치 전액 청구(크레딧 0). 그 결제가 transaction.completed 웹훅으로
//      돌아와 새 플랜 Take 를 적립한다 — 실측에서 잔액 260→290 으로 확인했다. 적립 코드는 손대지 않는다.
//   ② next_billed_at + do_not_bill → 갱신일을 오늘+1개월로. 추가 청구 없음.
//   하위 변경은 do_not_bill 한 요청이면 된다(다음 갱신일부터 적용, 지금 환불 없음 — 09-07 오너 확정).
import { PADDLE_PLANS, type PaddlePlanId } from '@/lib/billing/catalog'

/** Paddle 구독 수정 한 번. steps 순서대로 보낸다. */
export interface PlanChangeStep {
  /** 새 플랜으로 갈아끼울 때만. 갱신일 변경과 같은 요청에 못 넣는다(실측). */
  items?: { planId: PaddlePlanId }[]
  /** 갱신일을 옮길 때만. */
  nextBilledAt?: string
  prorationBillingMode: 'full_immediately' | 'do_not_bill'
}

export type PlanChangeDecision =
  | {
      ok: true
      direction: 'upgrade' | 'downgrade'
      subscriptionId: string
      /** 오늘 카드에서 빠지는 금액. 하위 변경이면 0. */
      chargeTodayUsd: number
      /** 상위면 오늘+1개월, 하위면 null(갱신일 안 건드림). */
      nextBilledAt: string | null
      /** 이번에 들어오는 새 플랜 Take. 남은 Take 는 그대로 얹힌다(09-07 오너 확정: 이월형). */
      takesAdded: number
      steps: PlanChangeStep[]
    }
  | { ok: false; reason: 'same_plan' | 'no_subscription' | 'unknown_plan' }

function findPlan(id: string) {
  return PADDLE_PLANS.find((p) => p.id === id) ?? null
}

export function decidePlanChange(input: {
  currentPlan: string
  targetPlan: string
  subscriptionId: string | null
  now: Date
}): PlanChangeDecision {
  const target = findPlan(input.targetPlan)
  if (!target) return { ok: false, reason: 'unknown_plan' }
  if (input.currentPlan === input.targetPlan) return { ok: false, reason: 'same_plan' }
  // 구독이 없으면 플랜 변경이 아니라 신규 구독이다 — 결제창을 띄워야 한다(P7 경로).
  if (!input.subscriptionId) return { ok: false, reason: 'no_subscription' }

  const current = findPlan(input.currentPlan)
  const isUpgrade = !current || target.monthlyPriceUsd > current.monthlyPriceUsd

  if (!isUpgrade) {
    return {
      ok: true,
      direction: 'downgrade',
      subscriptionId: input.subscriptionId,
      chargeTodayUsd: 0,
      nextBilledAt: null,
      takesAdded: 0,
      steps: [{ items: [{ planId: target.id }], prorationBillingMode: 'do_not_bill' }],
    }
  }

  const nextBilledAt = new Date(input.now)
  nextBilledAt.setUTCMonth(nextBilledAt.getUTCMonth() + 1)
  const nextIso = nextBilledAt.toISOString()

  return {
    ok: true,
    direction: 'upgrade',
    subscriptionId: input.subscriptionId,
    chargeTodayUsd: target.monthlyPriceUsd,
    nextBilledAt: nextIso,
    takesAdded: target.entitlements.includedTakesPerMonth,
    steps: [
      // ① 먼저 청구한다. 이게 실패하면 아무것도 안 바뀐 채로 끝나는 게 안전하다.
      { items: [{ planId: target.id }], prorationBillingMode: 'full_immediately' },
      // ② 갱신일 리셋. 여기서 실패하면 돈은 받았는데 갱신일이 안 밀린 상태 — 라우트가 경보를 보낸다.
      { nextBilledAt: nextIso, prorationBillingMode: 'do_not_bill' },
    ],
  }
}
