// 구독 즉시 해지 (약관 §9 — 계정을 지우면 자동갱신 구독이 함께 끊긴다).
//   종전에는 해지 입구가 Paddle 고객 포털 주소(src/lib/billing/portal.ts 의 cancelUrl)뿐이라
//   사람이 포털에서 눌러야 했다. 계정 삭제는 사람이 포털을 거칠 수 없으므로 서버가 직접 끊는다.
//
//   effective_from: 'immediately' 인 이유 — 계정이 사라진 뒤 남은 기간을 쓸 수 없고, 약관 §9 가
//   "the unused remainder of a paid period are forfeited" 라고 적었다. 다음 갱신일까지 유지하는
//   next_billing_period 는 지워진 계정에 청구가 또 갈 여지를 남긴다.
//
//   실패는 던진다. 계정 삭제 라우트가 이걸 받고 삭제를 중단한다 — 계정은 없는데 결제는 계속되는
//   상태가 가장 나쁘다.
//
//   국내 카드(PortOne) 구독(2026-11-19)은 PortOne 쪽에 예약이 없다 — 청구는 우리 매시간 점검이 한다.
//   그래서 상태를 canceled 로 내려 다음 청구를 멈추고, 저장된 카드(빌링키)를 PortOne 에서 지운다.
import { paddleRequest } from '@/lib/billing/paddle-api'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { deleteBillingKey, findBillingKey } from '@/lib/billing/portone-server'
import { isPortOneSubscriptionId } from '@/lib/billing/portone-public'

export async function cancelSubscriptionNow(subscriptionId: string): Promise<void> {
  if (isPortOneSubscriptionId(subscriptionId)) {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('mor_subscription_id', subscriptionId)
    if (error) throw error
    const billingKey = await findBillingKey(subscriptionId)
    if (billingKey) await deleteBillingKey(billingKey)
    return
  }
  await paddleRequest('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    effective_from: 'immediately',
  })
}
