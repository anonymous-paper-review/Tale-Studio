// 요금표를 숨겨 두면 홈·공개 페이지·로그인 후 메뉴·정책 화면에서 Pricing 링크가 빠지고, 열어 두면 원래 메뉴로 돌아온다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const visibility = vi.hoisted(() => ({ open: false }))
vi.mock('@/lib/billing/pricing-visibility', () => ({
  get PRICING_PAGE_VISIBLE() {
    return visibility.open
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (state: object) => unknown) => select({ switchProject: vi.fn(), createNewProject: vi.fn() }) }))
vi.mock('@/components/contact-popover', () => ({ ContactPopover: () => null }))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text }))

const PRICING_LINK = /<a\b[^>]*href="\/pricing"[^>]*>\s*Pricing\s*<\/a>/
const DASHBOARD_TABS = ['projects', 'playground', 'queue', 'account'] as const
const navOf = (html: string) => html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''

async function homeHtml() {
  const { default: HomePage } = await import('@/app/page')
  return renderToStaticMarkup(createElement(HomePage))
}

async function dashboardNavs() {
  const { DashboardHeader } = await import('@/components/dashboard/dashboard-header')
  return DASHBOARD_TABS.map((active) => navOf(renderToStaticMarkup(createElement(DashboardHeader, { active }))))
}

async function publicHeaderAndFooter() {
  const { SiteHeader } = await import('@/components/marketing/site-header')
  const { SiteFooter } = await import('@/components/marketing/site-footer')
  return [renderToStaticMarkup(createElement(SiteHeader)), renderToStaticMarkup(createElement(SiteFooter))]
}

async function legalPageHtml() {
  const { LegalPage } = await import('@/components/legal/legal-page')
  const { LEGAL_DOCUMENTS } = await import('@/lib/legal/documents')
  return renderToStaticMarkup(createElement(LegalPage, { document: LEGAL_DOCUMENTS.terms }))
}

describe('요금표를 숨겨 둔 동안의 메뉴', () => {
  beforeEach(() => {
    visibility.open = false
  })

  // 왜: 2026-11-04 오너 "진입점을 일단 없애줘". 홈 방문자가 상단 메뉴(PC·모바일)에서 요금표를 찾지 못해야 한다.
  it('요금표를 숨겨 두면 메인 홈 상단 메뉴에 Pricing이 없고 나머지 메뉴는 그대로다', async () => {
    const html = await homeHtml()
    expect(html).not.toContain('href="/pricing"')
    const nav = navOf(html)
    expect(nav).toContain('href="#services"')
    expect(nav).toContain('href="#projects"')
    expect(nav).toContain('Get Started')
  })

  // 왜: 로그인한 사용자도 메뉴 탭으로 숨긴 요금표에 들어가지 못해야 한다.
  it('요금표를 숨겨 두면 로그인 후 메인 메뉴에 Pricing 탭이 없고 나머지 메뉴는 그대로다', async () => {
    for (const nav of await dashboardNavs()) {
      expect(nav).not.toContain('href="/pricing"')
      expect(nav).not.toContain('Pricing')
      for (const label of ['Projects', 'Playground', 'Queue', 'Account']) expect(nav).toContain(label)
    }
  })

  // 왜: Playground·Docs·정책 페이지가 함께 쓰는 머리글과 바닥글도 요금표로 가는 길이다.
  it('요금표를 숨겨 두면 공개 페이지 머리글과 바닥글에 Pricing이 없고 Playground와 Docs는 그대로다', async () => {
    for (const html of await publicHeaderAndFooter()) {
      expect(html).not.toContain('href="/pricing"')
      expect(html).toContain('href="/playground"')
      expect(html).toContain('href="/docs"')
    }
  })

  // 왜: 정책 페이지의 돌아가기 링크가 숨긴 요금표를 가리키면 누른 사람이 엉뚱한 곳에 떨어진다.
  it('요금표를 숨겨 두면 정책 페이지에 요금표로 돌아가는 링크가 없고 다른 정책으로는 이동할 수 있다', async () => {
    const html = await legalPageHtml()
    expect(html).not.toContain('href="/pricing"')
    expect(html).not.toContain('Back to pricing')
    for (const path of ['/refund', '/privacy', '/acceptable-use']) expect(html).toContain(`href="${path}"`)
  })
})

describe('요금표를 열어 둔 동안의 메뉴', () => {
  beforeEach(() => {
    visibility.open = true
  })

  // 왜: 숨김은 잠시다. 다시 열면 홈 방문자가 하단까지 내려가지 않고 가격을 찾을 수 있어야 한다.
  it('요금표를 열어 두면 메인 홈 상단 메뉴에서 Pricing으로 이동할 수 있다', async () => {
    const nav = navOf(await homeHtml())
    expect(nav).toMatch(PRICING_LINK)
    expect(nav).toContain('href="#services"')
    expect(nav).toContain('href="#projects"')
    expect(nav).toContain('Get Started')
  })

  // 왜: 메인 내비게이션은 홈과 로그인 대시보드로 나뉘어 있어 양쪽에서 가격을 찾는다.
  it('요금표를 열어 두면 로그인 후 메인 메뉴에서 기존 메뉴와 함께 Pricing으로 이동할 수 있다', async () => {
    for (const nav of await dashboardNavs()) {
      expect(nav).toMatch(PRICING_LINK)
      for (const label of ['Projects', 'Playground', 'Queue', 'Account']) expect(nav).toContain(label)
    }
  })

  // 왜: 다시 열면 공개 페이지와 정책 페이지에서 약관과 가격을 왕복하며 확인할 수 있어야 한다.
  it('요금표를 열어 두면 공개 페이지 머리글·바닥글과 정책 페이지에서 Pricing으로 이동할 수 있다', async () => {
    for (const html of await publicHeaderAndFooter()) expect(html).toMatch(PRICING_LINK)
    const legal = await legalPageHtml()
    expect(legal).toContain('href="/pricing"')
    expect(legal).toContain('Back to pricing')
  })
})
