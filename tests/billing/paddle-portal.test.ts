// 구독 관리·결제 수단 변경은 유저가 우리 계정 페이지에서 한다 — Paddle 고객 포털 주소를 서버가 만들어 준다 (#payments-phase-3 P9).
//   왜: 취소·카드 변경·영수증은 Paddle 이 화면을 제공한다(우리가 안 만든다). 오너 09-07: "취소는 유저가 직접 할 수 있어야".
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPortalSession } from '@/lib/billing/portal'

process.env.PADDLE_API_KEY = 'pdl_sdbx_apikey_test'
process.env.NEXT_PUBLIC_PADDLE_ENV = 'sandbox'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('고객 포털', () => {
  // 왜: 결제한 적이 없는 워크스페이스는 Paddle 에 고객이 없어서 포털이 없다. 버튼이 열려 있으면 빈 화면으로 간다.
  it('Paddle 고객이 없는 워크스페이스는 포털을 열 수 없다', async () => {
    await expect(createPortalSession({ customerId: null, subscriptionId: null })).rejects.toThrow(/no customer/)
  })

  // 왜: 정상 경로 고정. 포털 주소와 "구독 취소" "결제 수단 변경" 바로가기가 온다.
  it('고객이 있으면 포털 주소와 구독별 바로가기(취소·결제 수단 변경)를 돌려준다', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push(`${init?.method} ${String(url)}`)
        return new Response(
          JSON.stringify({
            data: {
              id: 'cpls_1',
              urls: {
                general: { overview: 'https://customer-portal.paddle.com/cpl_x' },
                subscriptions: [
                  {
                    id: 'sub_1',
                    cancel_subscription: 'https://customer-portal.paddle.com/cpl_x/subscriptions/sub_1/cancel',
                    update_subscription_payment_method: 'https://customer-portal.paddle.com/cpl_x/subscriptions/sub_1/update-payment-method',
                  },
                ],
              },
            },
          }),
          { status: 201 },
        )
      }),
    )
    const out = await createPortalSession({ customerId: 'ctm_1', subscriptionId: 'sub_1' })
    expect(calls).toEqual(['POST https://sandbox-api.paddle.com/customers/ctm_1/portal-sessions'])
    expect(out).toEqual({
      overviewUrl: 'https://customer-portal.paddle.com/cpl_x',
      cancelUrl: 'https://customer-portal.paddle.com/cpl_x/subscriptions/sub_1/cancel',
      updatePaymentMethodUrl: 'https://customer-portal.paddle.com/cpl_x/subscriptions/sub_1/update-payment-method',
    })
  })

  // 왜: 구독 없이 팩만 산 고객도 영수증·카드 관리는 포털에서 한다. 구독 바로가기만 없다.
  it('구독이 없는 고객은 포털 주소만 온다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: { id: 'cpls_2', urls: { general: { overview: 'https://customer-portal.paddle.com/cpl_y' }, subscriptions: [] } } }), { status: 201 })),
    )
    const out = await createPortalSession({ customerId: 'ctm_2', subscriptionId: null })
    expect(out).toEqual({ overviewUrl: 'https://customer-portal.paddle.com/cpl_y', cancelUrl: null, updatePaymentMethodUrl: null })
  })
})
