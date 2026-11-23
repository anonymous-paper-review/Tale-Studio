// 계정을 지울 때 국내 카드(PortOne) 구독도 바로 끊기는지: Paddle 을 부르지 않고 우리 청구를 멈추고 카드를 지운다.
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paddleRequest: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  findBillingKey: vi.fn(),
  deleteBillingKey: vi.fn(),
}))

vi.mock('@/lib/billing/paddle-api', () => ({ paddleRequest: mocks.paddleRequest }))
vi.mock('@/lib/billing/portone-server', () => ({ findBillingKey: mocks.findBillingKey, deleteBillingKey: mocks.deleteBillingKey }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      update: (row: unknown) => {
        mocks.update(row)
        return { eq: async (col: string, val: string) => (mocks.eq(col, val), { error: null }) }
      },
    }),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findBillingKey.mockResolvedValue('billing-key-1')
})

// 왜: 약관 §9 — 계정을 지우면 자동갱신 구독이 함께 끊긴다. 국내 카드 구독은 Paddle 에 없어서 Paddle 을 부르면 실패하고 삭제가 막힌다.
it('국내 카드 구독은 계정을 지울 때 Paddle 을 부르지 않고 다음 청구를 멈추고 카드를 지운다', async () => {
  const { cancelSubscriptionNow } = await import('@/lib/billing/cancel-subscription')
  await cancelSubscriptionNow('portone-sub-1')
  expect(mocks.paddleRequest).not.toHaveBeenCalled()
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'canceled' }))
  expect(mocks.eq).toHaveBeenCalledWith('mor_subscription_id', 'portone-sub-1')
  expect(mocks.deleteBillingKey).toHaveBeenCalledWith('billing-key-1')
})

// 왜: 정상 경로 고정. Paddle 구독은 종전대로 Paddle 에 즉시 해지를 요청한다.
it('Paddle 구독은 종전대로 Paddle 에 즉시 해지를 요청한다', async () => {
  const { cancelSubscriptionNow } = await import('@/lib/billing/cancel-subscription')
  await cancelSubscriptionNow('sub_1')
  expect(mocks.paddleRequest).toHaveBeenCalledWith('POST', '/subscriptions/sub_1/cancel', { effective_from: 'immediately' })
  expect(mocks.update).not.toHaveBeenCalled()
})
