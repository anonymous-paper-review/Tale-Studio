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
import { paddleRequest } from '@/lib/billing/paddle-api'

export async function cancelSubscriptionNow(subscriptionId: string): Promise<void> {
  await paddleRequest('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    effective_from: 'immediately',
  })
}
