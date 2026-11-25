// 요금표는 로그인한 사람에겐 앱 안 메뉴로, 로그인 전 방문자에겐 첫 화면 메뉴로 보인다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({ signedIn: null as boolean | null }))
vi.mock('@/lib/supabase/use-signed-in', () => ({ useSignedIn: () => session.signedIn }))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text, useLocale: () => 'en' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => '/pricing', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/dashboard/dashboard-header', () => ({
  DASHBOARD_CONTAINER: 'dashboard-container',
  DashboardHeader: ({ active }: { active: string }) => createElement('div', { 'data-app-menu': active }),
}))
vi.mock('@/components/marketing/site-header', () => ({ SiteHeader: () => createElement('div', { 'data-landing-menu': '' }) }))
vi.mock('@/components/marketing/site-footer', () => ({ SiteFooter: () => createElement('div', { 'data-site-footer': '' }) }))
vi.mock('@/components/contact-popover', () => ({ ContactPopover: () => null }))

async function pricingHtml() {
  const { PricingPageContent } = await import('@/components/billing/pricing-page')
  return renderToStaticMarkup(createElement(PricingPageContent, { checkoutEnabled: false }))
}

describe('요금표의 머리글', () => {
  beforeEach(() => {
    session.signedIn = null
  })

  // 왜: 2026-11-25 오너 "pricing 메뉴만 진입했을 때 루프가 꼬여있다". 앱 안 Pricing 탭·계정의 Change plan 으로 들어오면
  //   첫 화면 메뉴(Tale 서비스·작품·시작하기)가 떠서 앱으로 돌아갈 길 없이 첫 화면 ↔ 요금표만 오갔다.
  it('로그인한 사용자가 요금표에 들어오면 Pricing 탭이 선택된 앱 안 메뉴가 보인다', async () => {
    session.signedIn = true
    expect(await pricingHtml()).toContain('data-app-menu="pricing"')
  })

  // 왜: 같은 상황. 앱 안 메뉴와 첫 화면 메뉴가 함께 뜨면 다시 첫 화면으로 빠지는 길이 남는다.
  it('로그인한 사용자의 요금표에는 첫 화면 메뉴가 없다', async () => {
    session.signedIn = true
    expect(await pricingHtml()).not.toContain('data-landing-menu')
  })

  // 왜: 정상 경로 고정. PG 심사 담당자와 방문자는 로그인 없이 첫 화면 메뉴·바닥글(사업자 정보)이 붙은 요금표를 본다.
  it('로그인하지 않은 방문자의 요금표는 첫 화면 메뉴와 바닥글을 그대로 보인다', async () => {
    session.signedIn = false
    const html = await pricingHtml()
    expect(html).toContain('data-landing-menu')
    expect(html).toContain('data-site-footer')
    expect(html).not.toContain('data-app-menu')
  })

  // 왜: 로그인 여부를 아직 모르는 첫 그림에서 한쪽 메뉴를 그렸다가 바꾸면 메뉴가 깜빡인다. 가격과 바닥글은 그대로 보인다.
  it('로그인 여부를 확인하는 동안에는 어느 메뉴도 그리지 않고 요금과 바닥글은 보인다', async () => {
    const html = await pricingHtml()
    expect(html).not.toContain('data-app-menu')
    expect(html).not.toContain('data-landing-menu')
    expect(html).toContain('data-pricing-family="starter"')
    expect(html).toContain('data-site-footer')
  })
})
