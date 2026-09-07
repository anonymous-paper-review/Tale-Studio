// Paddle 고객 포털 세션 (#payments-phase-3 P9). 약속: tests/billing/paddle-portal.test.ts.
//   구독 취소·결제 수단 변경·영수증은 Paddle 포털 화면이 한다. 우리는 주소만 만들어 새 탭으로 연다.
//   세션 주소는 짧게 유효하므로 버튼을 누를 때마다 새로 만든다.
import { paddleRequest } from '@/lib/billing/paddle-api'

interface PortalSessionResponse {
  id: string
  urls: {
    general: { overview: string }
    subscriptions: { id: string; cancel_subscription: string; update_subscription_payment_method: string }[]
  }
}

export interface PortalLinks {
  overviewUrl: string
  cancelUrl: string | null
  updatePaymentMethodUrl: string | null
}

export async function createPortalSession(input: { customerId: string | null; subscriptionId: string | null }): Promise<PortalLinks> {
  if (!input.customerId) throw new Error('no customer for this workspace')
  const session = await paddleRequest<PortalSessionResponse>(
    'POST',
    `/customers/${encodeURIComponent(input.customerId)}/portal-sessions`,
    input.subscriptionId ? { subscription_ids: [input.subscriptionId] } : {},
  )
  const sub = input.subscriptionId ? session.urls.subscriptions.find((s) => s.id === input.subscriptionId) ?? null : null
  return {
    overviewUrl: session.urls.general.overview,
    cancelUrl: sub?.cancel_subscription ?? null,
    updatePaymentMethodUrl: sub?.update_subscription_payment_method ?? null,
  }
}
