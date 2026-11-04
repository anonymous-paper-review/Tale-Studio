// 요금표를 숨겨 두면 계정·다음 화 창의 요금표 진입점이 빠지되 /pricing 주소는 그대로 열리고, 열어 두면 원래대로 돌아온다.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const visibility = vi.hoisted(() => ({ open: false }))
const auth = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/lib/billing/pricing-visibility', () => ({
  get PRICING_PAGE_VISIBLE() {
    return visibility.open
  },
}))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: auth.getUser } }) }))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text, useLocale: () => 'en' }))
vi.mock('@/lib/billing/use-billing-account', () => ({
  // 무료 플랜이 팩을 이미 산 상태: 플랜 카드의 [Change plan]과 구매 카드의 [See plans]가 함께 그려지는 경우.
  useBillingAccount: () => ({
    data: {
      email: 'owner@example.test',
      subscription: { plan: 'free', status: 'none', nextBillingAt: null, accessEndsAt: null, paymentFailed: false },
      balance: null,
      recent: [],
      isAdmin: false,
      canBuyPack: false,
      hasPaddleCustomer: false,
    },
    loading: false,
    error: null,
  }),
  refetchBillingAccount: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: () => 'en' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/dashboard/dashboard-header', () => ({ DashboardHeader: () => null }))
vi.mock('@/components/billing/checkout-button', () => ({ CheckoutButton: () => null }))
vi.mock('@/components/billing/portal-button', () => ({ PortalButton: () => null }))

async function visit(path: string) {
  const { middleware } = await import('@/middleware')
  return middleware(new NextRequest(`https://example.test${path}`))
}

async function accountHtml() {
  const { default: AccountPage } = await import('@/app/account/page')
  return renderToStaticMarkup(createElement(AccountPage))
}

beforeEach(() => {
  auth.getUser.mockReset()
  auth.getUser.mockResolvedValue({ data: { user: null } })
})

// 왜: 2026-11-04 오너 "진입점을 일단 없애줘 나중에 다시 원복할거임". 다시 열 때는 오너가 이 문장을 바꾼다.
it('지금은 요금표를 숨겨 둔다', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/pricing-visibility')>('@/lib/billing/pricing-visibility')
  expect(actual.PRICING_PAGE_VISIBLE).toBe(false)
})

describe('요금표를 숨겨 둔 동안', () => {
  beforeEach(() => {
    visibility.open = false
  })

  // 왜: 2026-11-04 오너는 진입점만 없애라고 했다. 예전 공유 링크로 들어온 사람까지 막지는 않는다.
  it('요금표를 숨겨 둬도 /pricing 주소로 직접 들어오면 요금표가 열린다', async () => {
    const response = await visit('/pricing?plan=s5')
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  // 왜: 계정 화면의 플랜 바꾸기·요금제 보기 버튼이 숨긴 요금표로 이어지면 안 된다.
  it('요금표를 숨겨 두면 계정 화면에 [Change plan]과 [See plans] 버튼이 보이지 않는다', async () => {
    const html = await accountHtml()
    expect(html).not.toContain('href="/pricing"')
    expect(html).not.toContain('Change plan')
    expect(html).not.toContain('See plans')
    expect(html).toContain('Free plans can buy one pack. Subscribe to keep topping up.')
  })

  // 왜: 다음 화 잠금 창과 칸 부족 창의 버튼도 요금표로 가는 길이다. 닫기는 남아야 창에서 나올 수 있다.
  it('요금표를 숨겨 두면 다음 화 잠금 창과 칸 부족 창에 View pricing 버튼이 없고 Close만 남는다', () => {
    const source = readFileSync('src/features/projects/next-episode-dialog.tsx', 'utf8')
    expect(source.match(/PRICING_PAGE_VISIBLE && <Button onClick=\{\(\) => router\.push\('\/pricing'\)\}>/g)).toHaveLength(2)
    expect(source.match(/router\.push\('\/pricing'\)/g)).toHaveLength(2)
  })
})

describe('요금표를 열어 둔 동안', () => {
  beforeEach(() => {
    visibility.open = true
  })

  // 왜: 정상 경로 고정. 다시 열면 가입 전 방문자가 로그인 없이 가격을 확인한다.
  it('요금표를 열어 두면 /pricing 주소로 들어온 방문자에게 로그인 없이 요금표를 연다', async () => {
    const response = await visit('/pricing?plan=s5')
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  // 왜: 정상 경로 고정. 다시 열면 계정 화면에서 플랜을 바꾸러 요금표로 갈 수 있다.
  it('요금표를 열어 두면 계정 화면에서 [Change plan]과 [See plans]로 요금표에 갈 수 있다', async () => {
    const html = await accountHtml()
    expect(html.match(/href="\/pricing"/g)).toHaveLength(2)
    expect(html).toContain('Change plan')
    expect(html).toContain('See plans')
  })
})
