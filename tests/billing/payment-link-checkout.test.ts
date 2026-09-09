// 결제 링크는 기존 거래만 열고, 링크가 없거나 창이 닫히거나 실패하면 가격표와 재시도로 안내한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import type { PaddleEventData } from '@paddle/paddle-js'

const mocks = vi.hoisted(() => ({ loadPaddle: vi.fn(), subscribe: vi.fn(), open: vi.fn() }))
vi.mock('@/lib/billing/paddle-client', () => ({ loadPaddle: mocks.loadPaddle, subscribePaddleEvents: mocks.subscribe }))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))

let listener: ((event: PaddleEventData) => void) | undefined
let unsubscribe: ReturnType<typeof vi.fn>

function emit(name: string) {
  listener?.({ name } as PaddleEventData)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Payment links must not create transactions') }))
  listener = undefined
  unsubscribe = vi.fn(() => { listener = undefined })
  mocks.subscribe.mockImplementation((callback: (event: PaddleEventData) => void) => {
    listener = callback
    return unsubscribe
  })
  mocks.loadPaddle.mockResolvedValue({ Checkout: { open: mocks.open } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe.each([
  { label: '일반 결제', query: { _ptxn: 'txn_01h2b0qpjc0xt8k5aw6nsdec4p' } },
  { label: '결제수단 갱신용 거래', query: { _ptxn: 'txn_01h2ast61chjbjmz9z4pvwvt0h', source: 'update-payment-method' } },
])('$label', ({ query }) => {
  // 왜: 정상 경로 고정. Paddle가 여는 기존 거래를 새 주문으로 바꾸거나 두 번 열면 안 된다.
  it('유효한 결제 링크로 들어오면 기존 거래의 Paddle 결제창을 연다', async () => {
    const { default: CheckoutPage, metadata } = await import('@/app/checkout/page')
    const page = await CheckoutPage({ searchParams: Promise.resolve(query) })
    expect(renderToStaticMarkup(page)).toContain('Opening checkout…')
    expect(metadata.robots).toEqual({ index: false, follow: false })
    const { middleware } = await import('@/middleware')
    const params = new URLSearchParams({ _ptxn: query._ptxn })
    if (query.source) params.set('source', query.source)
    const response = await middleware(new NextRequest(`https://example.test/checkout?${params}`))
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()

    const { startPaymentLinkCheckout } = await import('@/lib/billing/payment-link-checkout')
    const states: string[] = []
    mocks.loadPaddle.mockImplementation(async () => {
      emit('checkout.loaded')
      return { Checkout: { open: mocks.open } }
    })
    const dispose = startPaymentLinkCheckout(true, (state) => states.push(state))
    await vi.advanceTimersByTimeAsync(0)
    expect(states).toEqual(['opening', 'open'])
    expect(mocks.loadPaddle).toHaveBeenCalledTimes(1)
    expect(mocks.open).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    dispose()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe.each([{}, { source: 'pricing' }, { _ptxn: '' }, { _ptxn: '   ' }])('결제 링크 없음: %j', (query) => {
  // 왜: 주소를 직접 열거나 빈 링크로 들어온 방문자에게 새 결제나 로그인 강요 없이 선택지를 돌려준다.
  it('결제 링크 없이 들어오면 새 거래를 만들지 않고 가격표로 안내한다', async () => {
    const { default: CheckoutPage } = await import('@/app/checkout/page')
    const markup = renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve(query) }))
    expect(markup).toContain('href="/pricing"')
    expect(markup).toContain('Choose a plan or Take pack from pricing to start checkout.')
    expect(markup).not.toContain('Try again')
    const { middleware } = await import('@/middleware')
    expect((await middleware(new NextRequest('https://example.test/checkout'))).status).toBe(200)
    for (const path of ['/checkout-extra', '/checkout/private', '/account']) {
      const protectedResponse = await middleware(new NextRequest(`https://example.test${path}`))
      expect(protectedResponse.status).toBe(307)
      expect(protectedResponse.headers.get('location')).toContain('/login')
    }

    const { startPaymentLinkCheckout } = await import('@/lib/billing/payment-link-checkout')
    const states: string[] = []
    startPaymentLinkCheckout(false, (state) => states.push(state))()
    expect(states).toEqual(['missing'])
    expect(mocks.loadPaddle).not.toHaveBeenCalled()
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe.each(['checkout.closed', 'checkout.error', 'checkout.failed', 'rejected', 'unavailable', 'timeout'])('%s', (failure) => {
  // 왜: 사용자가 창을 닫거나 SDK·네트워크가 실패한 뒤에도 같은 링크 재시도와 가격표 복귀가 남아야 한다.
  it('결제창을 닫거나 불러오지 못하면 다시 시도하거나 가격표로 돌아갈 수 있다', async () => {
    const { startPaymentLinkCheckout } = await import('@/lib/billing/payment-link-checkout')
    const { PaymentLinkCheckoutView } = await import('@/components/billing/payment-link-checkout')
    const states: string[] = []
    if (failure === 'rejected') mocks.loadPaddle.mockRejectedValue(new Error('SDK unavailable'))
    if (failure === 'unavailable') mocks.loadPaddle.mockResolvedValue(undefined)
    if (failure === 'timeout') mocks.loadPaddle.mockReturnValue(new Promise(() => {}))
    const dispose = startPaymentLinkCheckout(true, (state) => states.push(state))
    if (failure.startsWith('checkout.')) emit(failure)
    await vi.advanceTimersByTimeAsync(15_000)
    const state = failure === 'checkout.closed' ? 'closed' : 'error'
    expect(states.at(-1)).toBe(state)
    const retry = vi.fn()
    const markup = renderToStaticMarkup(createElement(PaymentLinkCheckoutView, { state, onRetry: retry }))
    expect(markup).toContain('Try again')
    expect(markup).toContain('href="/pricing"')
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled()
    dispose()
  })
})

// 왜: 결제창 완료는 장부 지급 완료가 아니다. 늦은 닫힘 신호나 이전 페이지의 응답이 완료 안내를 되돌리면 안 된다.
it('유효한 결제 링크로 들어오면 기존 거래의 Paddle 결제창을 연다', async () => {
  const { startPaymentLinkCheckout } = await import('@/lib/billing/payment-link-checkout')
  const { PaymentLinkCheckoutView } = await import('@/components/billing/payment-link-checkout')
  const states: string[] = []
  const dispose = startPaymentLinkCheckout(true, (state) => states.push(state))
  emit('checkout.completed')
  emit('checkout.closed')
  await vi.advanceTimersByTimeAsync(15_000)
  expect(states.at(-1)).toBe('completed')
  const markup = renderToStaticMarkup(createElement(PaymentLinkCheckoutView, { state: 'completed', onRetry: vi.fn() }))
  expect(markup).toContain('Check your account for the latest payment and balance status.')
  expect(markup).not.toContain('Takes added')
  dispose()
  const count = states.length
  emit('checkout.error')
  await vi.advanceTimersByTimeAsync(15_000)
  expect(states).toHaveLength(count)
})
