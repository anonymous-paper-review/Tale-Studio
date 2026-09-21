// 결제창 열기 판정 + Paddle 거래 생성 (#payments-phase-3 P7). 약속: tests/paddle-checkout.test.ts.
//
//   결제창은 브라우저가 직접 열지 않는다. 서버가 여기서 "열어도 되나"를 판정하고 Paddle 에 거래(transaction)를 만든 뒤
//   그 번호만 돌려준다. 브라우저는 번호로만 결제창을 연다. 그래야 "무료는 팩 1회"(v4) 같은 판정이 강제된다.
//   거래에는 custom_data.workspace_id 를 심는다 — 웹훅(paddle-webhook.ts)이 누구 결제인지 아는 유일한 표시.

import { PADDLE_PLANS, PADDLE_TAKE_PACKS, isPurchasable } from '@/lib/billing/catalog'
import { canBuyTakePack, type SubscriptionStatus } from '@/lib/billing/account-summary'
import { paddleRequest } from '@/lib/billing/paddle-api'

export type CheckoutKind = 'plan' | 'pack'
export type CheckoutDenyReason = 'payments_not_open' | 'unknown_item' | 'not_purchasable' | 'free_pack_limit' | 'already_subscribed' | 'past_due'

export type CheckoutDecision = { ok: true; priceId: string; label: string } | { ok: false; reason: CheckoutDenyReason }

export function decideCheckout(input: {
  kind: CheckoutKind
  id: string
  workspacePlan: string
  packPurchasedBefore: boolean
  subscriptionStatus: SubscriptionStatus
}): CheckoutDecision {
  const item =
    input.kind === 'plan' ? PADDLE_PLANS.find((p) => p.id === input.id) ?? null : PADDLE_TAKE_PACKS.find((p) => p.id === input.id) ?? null
  if (!item) return { ok: false, reason: 'unknown_item' }
  if (!isPurchasable(item)) return { ok: false, reason: 'not_purchasable' }

  if (input.kind === 'pack') {
    if (!canBuyTakePack({ plan: input.workspacePlan, packPurchasedBefore: input.packPurchasedBefore })) {
      return { ok: false, reason: 'free_pack_limit' }
    }
    return { ok: true, priceId: item.paddlePriceId as string, label: item.name }
  }

  // 구독: 첫 버전엔 플랜 변경 화면이 없다. 살아 있는 구독이 있으면 새 구독을 열지 않는다.
  if (input.subscriptionStatus === 'past_due') return { ok: false, reason: 'past_due' }
  if (input.subscriptionStatus === 'active' || input.subscriptionStatus === 'cancel_scheduled') {
    return { ok: false, reason: 'already_subscribed' }
  }
  return { ok: true, priceId: item.paddlePriceId as string, label: item.name }
}

interface PaddleCustomer {
  id: string
  email?: string
}

async function ensurePaddleCustomer(email: string): Promise<string> {
  const found = await paddleRequest<PaddleCustomer[]>('GET', `/customers?email=${encodeURIComponent(email)}&status=active`)
  if (found.length > 0) return found[0].id
  const created = await paddleRequest<PaddleCustomer>('POST', '/customers', { email })
  return created.id
}

/**
 * Paddle 에 거래를 만들고 번호를 돌려준다. 고객은 워크스페이스에 저장된 것을 먼저 쓰고, 없으면 이메일로 찾거나 만든다
 * (같은 사람이 Paddle 에 둘로 갈라지면 영수증·포털이 갈라진다).
 */
export async function createPaddleTransaction(input: {
  priceId: string
  workspaceId: string
  email: string
  existingCustomerId: string | null
}): Promise<{ transactionId: string; customerId: string }> {
  const customerId = input.existingCustomerId ?? (await ensurePaddleCustomer(input.email))
  const txn = await paddleRequest<{ id: string }>('POST', '/transactions', {
    items: [{ price_id: input.priceId, quantity: 1 }],
    customer_id: customerId,
    custom_data: { workspace_id: input.workspaceId },
    currency_code: 'USD',
    collection_mode: 'automatic',
  })
  return { transactionId: txn.id, customerId }
}
