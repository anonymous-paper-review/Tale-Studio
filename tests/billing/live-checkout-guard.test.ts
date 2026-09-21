// 운영 결제를 열기 전에는 구매만 잠그고 요금표 공개와 샌드박스 검증은 유지한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), request: vi.fn(), loadPaddle: vi.fn(), subscribe: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/billing/paddle-api', () => ({ paddleRequest: mocks.request }))
vi.mock('@/lib/ops-alert', () => ({ sendOpsAlert: vi.fn() }))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text, useLocale: () => 'en' }))
vi.mock('@/lib/billing/paddle-client', () => ({ loadPaddle: mocks.loadPaddle, subscribePaddleEvents: mocks.subscribe }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => '/pricing', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/marketing/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/marketing/site-footer', () => ({ SiteFooter: () => null }))
vi.mock('@/components/marketing/locale-toggle', () => ({ LocaleToggle: () => null }))
vi.mock('@/components/contact-popover', () => ({ ContactPopover: () => null }))

function query(data: unknown) {
  const result = { data, error: null }
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_PADDLE_ENV', 'production')
  vi.stubEnv('PADDLE_LIVE_CHECKOUT_ENABLED', undefined)
  vi.stubEnv('NEXT_PUBLIC_PADDLE_PRICE_PLAN_S1', 'pri_s1')
  vi.stubEnv('NEXT_PUBLIC_PADDLE_PRICE_PLAN_S2', 'pri_s2')
  vi.stubEnv('NEXT_PUBLIC_PADDLE_PRICE_PACK_MINI', 'pri_mini')
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'buyer@example.test' } } })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'workspaces') return query({ id: 'ws-1', plan: 's1' })
    if (table === 'billing_customers') return query({ mor_customer_id: 'ctm_existing' })
    if (table === 'subscriptions') return query([{ mor_subscription_id: 'sub_existing', status: 'active', plan: 's1', updated_at: '2026-09-09' }])
    if (table === 'take_ledger') return query([])
    throw new Error(`Unexpected table: ${table}`)
  })
  mocks.request.mockResolvedValue({ id: 'txn_test' })
  mocks.subscribe.mockReturnValue(() => {})
  mocks.loadPaddle.mockResolvedValue({})
})

afterEach(() => { vi.unstubAllEnvs() })

describe.each([undefined, 'false', 'TRUE', '1', ' true '])('운영 결제 설정 %s', (value) => {
  // 왜: 설정 누락·오타와 직접 구매 요청이 승인 전 실제 카드 청구로 이어지면 안 된다.
  it('운영 결제를 열기 전에는 새 구매와 즉시 청구를 막는다', async () => {
    vi.stubEnv('PADDLE_LIVE_CHECKOUT_ENABLED', value)
    const { POST: checkout } = await import('@/app/api/billing/checkout/route')
    const purchase = await checkout(new NextRequest('http://localhost/api/billing/checkout', {
      method: 'POST', body: JSON.stringify({ kind: 'pack', id: 'mini', checkoutEnabled: true }),
    }))
    expect(purchase.status).toBe(503)
    expect(await purchase.json()).toMatchObject({ error: 'payments_not_open' })
    const { POST: changePlan } = await import('@/app/api/billing/change-plan/route')
    const change = await changePlan(new Request('http://localhost/api/billing/change-plan', {
      method: 'POST', body: JSON.stringify({ plan: 's2', checkoutEnabled: true }),
    }))
    expect(change.status).toBe(503)
    expect(await change.json()).toMatchObject({ error: 'payments_not_open' })
    expect(mocks.request).not.toHaveBeenCalled()
  })
})

// 왜: 운영 구매 잠금 때문에 실제 돈이 오가지 않는 개발 결제 검증까지 막히면 안 된다.
it('운영 결제가 닫혀 있어도 샌드박스 구매 검증은 가능하다', async () => {
  vi.stubEnv('NEXT_PUBLIC_PADDLE_ENV', 'sandbox')
  const { POST } = await import('@/app/api/billing/checkout/route')
  const result = await POST(new NextRequest('http://localhost/api/billing/checkout', {
    method: 'POST', body: JSON.stringify({ kind: 'pack', id: 'mini' }),
  }))
  expect(result.status).toBe(200)
  expect(await result.json()).toMatchObject({ transactionId: 'txn_test' })
  expect(mocks.request).toHaveBeenCalledWith('POST', '/transactions', expect.objectContaining({ currency_code: 'USD' }))
})

// 왜: 승인과 운영 연결을 확인한 뒤에는 서버의 명시적인 개방 설정으로 기존 구매 흐름을 사용할 수 있어야 한다.
it('운영 결제를 명시적으로 열면 기존 구매 흐름을 사용할 수 있다', async () => {
  vi.stubEnv('PADDLE_LIVE_CHECKOUT_ENABLED', 'true')
  const { POST } = await import('@/app/api/billing/checkout/route')
  const response = await POST(new NextRequest('http://localhost/api/billing/checkout', {
    method: 'POST', body: JSON.stringify({ kind: 'pack', id: 'mini' }),
  }))
  expect(response.status).toBe(200)
  expect(mocks.request).toHaveBeenCalledTimes(1)
})

// 왜: 이미 발급된 거래 번호를 주소에 붙여도 승인 전 결제창이 자동으로 열리면 안 된다.
it('운영 결제가 닫혀 있으면 기존 결제 링크도 결제창을 열지 않는다', async () => {
  const { default: CheckoutPage } = await import('@/app/checkout/page')
  const markup = renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve({ _ptxn: 'txn_existing' }) }))
  expect(markup).toContain('Payments are being prepared')
  expect(markup).not.toContain('Opening checkout')
  const { startPaymentLinkCheckout } = await import('@/lib/billing/payment-link-checkout')
  const states: string[] = []
  startPaymentLinkCheckout(true, (state) => states.push(state), false)()
  expect(states).toEqual(['preparing'])
  expect(mocks.loadPaddle).not.toHaveBeenCalled()
  expect(mocks.subscribe).not.toHaveBeenCalled()
})

// 왜: 심사 담당자와 방문자는 구매가 닫힌 동안에도 세 상품군과 기존 가격을 살펴볼 수 있어야 한다.
it('운영 결제가 닫혀 있어도 요금과 옵션은 볼 수 있다', async () => {
  const { default: PricingPage } = await import('@/app/pricing/page')
  const page = PricingPage()
  expect(page.props.checkoutEnabled).toBe(false)
  const markup = renderToStaticMarkup(page)
  expect(markup).toContain('Payments are being prepared')
  for (const family of ['starter', 'production', 'take']) expect(markup).toContain(`data-pricing-family="${family}"`)
  for (const price of ['$15', '$199', '$29']) expect(markup).toContain(price)
})

// 왜: 가격 ID가 채워진 것과 운영 결제를 연 것은 서로 다른 상태다. 운영 점검이 이를 혼동하면 안 된다.
it('운영 결제가 닫혀 있으면 상품 설정과 구매 가능 상태를 따로 보여준다', async () => {
  const { GET } = await import('@/app/api/billing/catalog-status/route')
  const response = await GET()
  expect(await response.json()).toMatchObject({ checkoutEnabled: false, purchasable: 0, configured: 3, total: 13 })
})

// 왜: 구매 잠금은 고객의 비용을 줄이는 변경이나 해지를 가로막기 위한 기능이 아니다.
it('운영 결제가 닫혀 있어도 지금 청구하지 않는 하위 플랜 변경은 유지한다', async () => {
  mocks.from.mockImplementation((table: string) => table === 'workspaces'
    ? query({ id: 'ws-1', plan: 's2' })
    : query([{ mor_subscription_id: 'sub_existing', status: 'active', plan: 's2', updated_at: '2026-09-09' }]))
  const { POST } = await import('@/app/api/billing/change-plan/route')
  const response = await POST(new Request('http://localhost/api/billing/change-plan', {
    method: 'POST', body: JSON.stringify({ plan: 's1' }),
  }))
  expect(response.status).toBe(200)
  expect(mocks.request).toHaveBeenCalledWith('PATCH', '/subscriptions/sub_existing', {
    proration_billing_mode: 'do_not_bill', items: [{ price_id: 'pri_s1', quantity: 1 }],
  })
})
