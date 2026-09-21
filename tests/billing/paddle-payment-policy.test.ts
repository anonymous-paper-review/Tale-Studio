// 한국 고객을 제외하지 않고 USD 카드결제를 받는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  initializePaddle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/ops-alert', () => ({ sendOpsAlert: vi.fn() }))
vi.mock('@paddle/paddle-js', () => ({ initializePaddle: mocks.initializePaddle }))

function query(data: unknown) {
  const result = { data, error: null }
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv('PADDLE_API_KEY', 'pdl_sdbx_apikey_test')
  vi.stubEnv('NEXT_PUBLIC_PADDLE_ENV', 'sandbox')
  vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', 'test_checkout')
  vi.stubEnv('NEXT_PUBLIC_PADDLE_PRICE_PACK_MINI', 'pri_mini')
  mocks.initializePaddle.mockResolvedValue({ Checkout: { open: vi.fn() } })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'workspaces') return query({ id: 'ws-1', plan: 'free' })
    if (table === 'billing_customers') return query({ mor_customer_id: 'ctm_existing' })
    if (table === 'subscriptions' || table === 'take_ledger') return query([])
    throw new Error(`Unexpected table: ${table}`)
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe.each([
  { country: 'KR', locale: 'ko' },
  { country: 'US', locale: 'en' },
])('$country 고객 결제', ({ country, locale }) => {
  // 왜: 국내 요청을 막거나 원화로 바꾸지 않고, 같은 USD 거래를 카드 전용 결제창으로 보내야 한다.
  it('한국 고객을 제외하지 않고 USD 카드결제를 받는다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'buyer@example.test', user_metadata: { locale, country } } } })
    const paddleFetch = vi.fn(async () => Response.json({ data: { id: 'txn_usd' } }))
    vi.stubGlobal('fetch', paddleFetch)
    const { POST } = await import('@/app/api/billing/checkout/route')
    const response = await POST(new NextRequest('http://localhost/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vercel-ip-country': country, 'accept-language': locale },
      body: JSON.stringify({ kind: 'pack', id: 'mini', currency_code: 'KRW' }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ transactionId: 'txn_usd' })
    expect(paddleFetch).toHaveBeenCalledWith('https://sandbox-api.paddle.com/transactions', expect.objectContaining({
      method: 'POST',
      body: expect.any(String),
    }))
    const request = paddleFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(request[1].body))).toMatchObject({ currency_code: 'USD', customer_id: 'ctm_existing' })

    const { loadPaddle } = await import('@/lib/billing/paddle-client')
    await loadPaddle()
    expect(mocks.initializePaddle).toHaveBeenCalledWith({
      token: 'test_checkout',
      environment: 'sandbox',
      checkout: { settings: { displayMode: 'overlay', theme: 'dark', allowedPaymentMethods: ['card'] } },
      eventCallback: expect.any(Function),
    })
  })
})

// 왜: 거래 링크는 Paddle 초기화 중 자동으로 열리므로 페이지가 그 첫 이벤트부터 받아야 한다.
it('거래 링크를 열 때 첫 결제 상태부터 모든 연결된 화면에 전달한다', async () => {
  const { loadPaddle, subscribePaddleEvents } = await import('@/lib/billing/paddle-client')
  const first = vi.fn()
  const second = vi.fn()
  subscribePaddleEvents(first)
  subscribePaddleEvents(second)
  const event = { name: 'checkout.loaded', data: { transaction_id: 'txn_link' } }
  mocks.initializePaddle.mockImplementation(async (options) => {
    options.eventCallback(event)
    return { Checkout: { open: vi.fn() } }
  })

  await Promise.all([loadPaddle(), loadPaddle()])

  expect(mocks.initializePaddle).toHaveBeenCalledTimes(1)
  expect(first).toHaveBeenCalledExactlyOnceWith(event)
  expect(second).toHaveBeenCalledExactlyOnceWith(event)
})

// 왜: 가격 팝업이 닫혀도 별도 결제 페이지의 상태 표시를 함께 끊으면 안 된다.
it('한 화면이 결제 상태 연결을 끝내도 다른 화면은 계속 받는다', async () => {
  const { loadPaddle, subscribePaddleEvents } = await import('@/lib/billing/paddle-client')
  const first = vi.fn()
  const second = vi.fn()
  const unsubscribe = subscribePaddleEvents(first)
  subscribePaddleEvents(second)
  await loadPaddle()
  unsubscribe()
  unsubscribe()
  const event = { name: 'checkout.closed', data: { transaction_id: 'txn_link' } }
  mocks.initializePaddle.mock.calls[0][0].eventCallback(event)

  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledExactlyOnceWith(event)
})

// 왜: 첫 스크립트 로딩이 일시적으로 실패해도 다음 구매 시도까지 실패를 기억하면 안 된다.
it('결제창 준비가 실패해도 다음 시도에서 다시 준비한다', async () => {
  const { loadPaddle } = await import('@/lib/billing/paddle-client')
  mocks.initializePaddle.mockRejectedValueOnce(new Error('Network unavailable'))
  await expect(loadPaddle()).rejects.toThrow('Network unavailable')
  await expect(loadPaddle()).resolves.toBeDefined()
  expect(mocks.initializePaddle).toHaveBeenCalledTimes(2)
})
