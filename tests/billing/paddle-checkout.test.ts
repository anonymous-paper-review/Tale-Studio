// 결제창은 서버가 열어 준다 — 열지 말아야 할 때는 안 열고, 열 때는 어느 워크스페이스 결제인지 실어 보낸다 (#payments-phase-3 P7).
//   왜: 결제창을 브라우저가 직접 열면 "무료는 팩 1회" 같은 판정을 우회할 수 있다. 서버가 Paddle 에 거래를 먼저 만들고
//   그 번호로만 결제창이 열리게 하면 판정이 강제된다. Paddle 호출은 fetch 를 흉내내서 본다.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPaddleTransaction, decideCheckout } from '@/lib/billing/checkout'

process.env.NEXT_PUBLIC_PADDLE_PRICE_PLAN_S5 = 'pri_s5'
process.env.NEXT_PUBLIC_PADDLE_PRICE_PLAN_S10 = 'pri_s10'
process.env.NEXT_PUBLIC_PADDLE_PRICE_PACK_MINI = 'pri_mini'
process.env.PADDLE_API_KEY = 'pdl_sdbx_apikey_test'
process.env.NEXT_PUBLIC_PADDLE_ENV = 'sandbox'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('결제창을 열지 판정', () => {
  // 왜: 정상 경로 고정 — 무료 계정의 첫 팩, 무료 계정의 첫 구독은 열려야 한다.
  it('무료 플랜이 처음 팩을 사면 결제창이 열린다', () => {
    expect(decideCheckout({ kind: 'pack', id: 'mini', workspacePlan: 'free', packPurchasedBefore: false, subscriptionStatus: 'none' })).toEqual({ ok: true, priceId: 'pri_mini', label: 'Mini' })
  })
  it('무료 플랜이 구독을 시작하면 결제창이 열린다', () => {
    expect(decideCheckout({ kind: 'plan', id: 's5', workspacePlan: 'free', packPurchasedBefore: false, subscriptionStatus: 'none' })).toEqual({ ok: true, priceId: 'pri_s5', label: 'S-5' })
  })
  // 왜: v4 충전 상한. 무료는 Mini 1회. 이게 앞문이고 웹훅의 경보는 이 문이 뚫렸을 때의 안전망이다.
  it('무료 플랜이 이미 팩을 샀으면 팩 결제창이 열리지 않고 정액 가입을 권한다', () => {
    expect(decideCheckout({ kind: 'pack', id: 'mini', workspacePlan: 'free', packPurchasedBefore: true, subscriptionStatus: 'none' })).toEqual({ ok: false, reason: 'free_pack_limit' })
  })
  // 왜: 구독 중이면 몇 번이든 살 수 있다(오너 09-07).
  it('구독 중이면 팩을 몇 번이든 살 수 있다', () => {
    expect(decideCheckout({ kind: 'pack', id: 'mini', workspacePlan: 's5', packPurchasedBefore: true, subscriptionStatus: 'active' })).toMatchObject({ ok: true })
  })
  // 왜: 첫 버전엔 플랜 변경 화면이 없다. 구독 중에 또 구독 결제창을 열면 구독이 두 개가 된다.
  it('이미 구독 중이면 플랜 결제창이 열리지 않는다(플랜 변경은 나중 슬라이스)', () => {
    expect(decideCheckout({ kind: 'plan', id: 's10', workspacePlan: 's5', packPurchasedBefore: false, subscriptionStatus: 'active' })).toEqual({ ok: false, reason: 'already_subscribed' })
    expect(decideCheckout({ kind: 'plan', id: 's10', workspacePlan: 's5', packPurchasedBefore: false, subscriptionStatus: 'cancel_scheduled' })).toEqual({ ok: false, reason: 'already_subscribed' })
  })
  // 왜: 갱신 실패로 무료로 내려간 사람이 다시 구독하려는 경우 — Paddle 이 재시도 중이라 새 구독을 열면 둘이 된다.
  it('갱신 결제가 밀린 상태면 새 구독 결제창 대신 카드 확인을 권한다', () => {
    expect(decideCheckout({ kind: 'plan', id: 's5', workspacePlan: 'free', packPurchasedBefore: false, subscriptionStatus: 'past_due' })).toEqual({ ok: false, reason: 'past_due' })
  })
  // 왜: Paddle 에 아직 등록 안 된 상품(env 없음)은 버튼이 비활성이지만, 직접 API 를 부르면 여기서 막혀야 한다.
  it('Paddle 상품 ID가 없는 상품은 결제창이 열리지 않는다', () => {
    expect(decideCheckout({ kind: 'pack', id: 'pro', workspacePlan: 'free', packPurchasedBefore: false, subscriptionStatus: 'none' })).toEqual({ ok: false, reason: 'not_purchasable' })
    expect(decideCheckout({ kind: 'plan', id: 'nope', workspacePlan: 'free', packPurchasedBefore: false, subscriptionStatus: 'none' })).toEqual({ ok: false, reason: 'unknown_item' })
  })
})

describe('Paddle 거래 만들기', () => {
  function stubPaddle(handlers: Record<string, (init?: RequestInit) => { status?: number; body: unknown }>) {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url)
        calls.push({ url: u, init })
        const key = Object.keys(handlers).find((k) => u.includes(k))
        if (!key) return new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 })
        const r = handlers[key](init)
        return new Response(JSON.stringify({ data: r.body }), { status: r.status ?? 200 })
      }),
    )
    return calls
  }

  // 왜: 결제 알림이 누구 것인지 알려면 거래에 workspace_id 가 실려 있어야 한다. 이게 빠지면 웹훅이 "워크스페이스 표시 없음"으로 끝난다.
  it('거래에는 어느 워크스페이스 결제인지 표시가 실린다', async () => {
    const calls = stubPaddle({
      '/customers?': () => ({ body: [{ id: 'ctm_1', email: 'a@b.c' }] }),
      '/transactions': () => ({ body: { id: 'txn_new' } }),
    })
    const out = await createPaddleTransaction({ priceId: 'pri_mini', workspaceId: 'ws-1', email: 'a@b.c', existingCustomerId: null })
    expect(out).toEqual({ transactionId: 'txn_new', customerId: 'ctm_1' })
    const txnCall = calls.find((c) => c.url.endsWith('/transactions'))!
    const body = JSON.parse(String(txnCall.init?.body))
    expect(body.custom_data).toEqual({ workspace_id: 'ws-1' })
    expect(body.customer_id).toBe('ctm_1')
    expect(body.items).toEqual([{ price_id: 'pri_mini', quantity: 1 }])
  })

  // 왜: 오너는 한국 고객도 USD로 결제받는다. 거래 생성 시 통화를 생략해 결제 설정에 맡기지 않는다.
  it('한국 고객을 제외하지 않고 USD 카드결제를 받는다', async () => {
    const calls = stubPaddle({ '/transactions': () => ({ body: { id: 'txn_usd' } }) })
    await createPaddleTransaction({ priceId: 'pri_mini', workspaceId: 'ws-1', email: 'buyer@example.co.kr', existingCustomerId: 'ctm_existing' })
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.currency_code).toBe('USD')
  })

  // 왜: 같은 사람이 팩을 두 번 사면 Paddle 에 고객이 둘 생기고 영수증·포털이 갈라진다.
  it('같은 이메일은 Paddle 고객 하나를 다시 쓴다', async () => {
    const calls = stubPaddle({
      '/customers?': () => ({ body: [] }),
      '/customers': () => ({ body: { id: 'ctm_created', email: 'new@b.c' } }),
      '/transactions': () => ({ body: { id: 'txn_1' } }),
    })
    await createPaddleTransaction({ priceId: 'pri_mini', workspaceId: 'ws-1', email: 'new@b.c', existingCustomerId: null })
    expect(calls.filter((c) => c.url.endsWith('/customers') && c.init?.method === 'POST')).toHaveLength(1)

    const calls2 = stubPaddle({ '/transactions': () => ({ body: { id: 'txn_2' } }) })
    const out = await createPaddleTransaction({ priceId: 'pri_mini', workspaceId: 'ws-1', email: 'new@b.c', existingCustomerId: 'ctm_saved' })
    expect(out.customerId).toBe('ctm_saved')
    expect(calls2.some((c) => c.url.includes('/customers'))).toBe(false)
  })

  // 왜: Paddle 이 거절하면(잘못된 가격 ID 등) 유저에게 빈 결제창 대신 오류를 보여야 한다.
  it('Paddle이 거래 생성을 거절하면 오류로 끝난다', async () => {
    stubPaddle({
      '/customers?': () => ({ body: [{ id: 'ctm_1' }] }),
      '/transactions': () => ({ status: 400, body: null }),
    })
    await expect(createPaddleTransaction({ priceId: 'pri_bad', workspaceId: 'ws-1', email: 'a@b.c', existingCustomerId: null })).rejects.toThrow()
  })
})
