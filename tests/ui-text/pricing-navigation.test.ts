// 메인 홈과 로그인 후 메뉴에서 가격을 확인하러 갈 수 있고 기존 메뉴는 유지된다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (state: object) => unknown) => select({ switchProject: vi.fn(), createNewProject: vi.fn() }) }))
vi.mock('@/components/contact-popover', () => ({ ContactPopover: () => null }))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text }))

describe('메인 메뉴의 요금표 연결', () => {
  // 왜: 홈 방문자가 하단까지 내려가지 않고 가격을 찾을 수 있어야 한다.
  it('메인 홈을 열면 상단 메뉴에서 Pricing으로 이동할 수 있다', async () => {
    const { default: HomePage } = await import('@/app/page')
    const html = renderToStaticMarkup(createElement(HomePage))
    const nav = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''
    expect(nav).toMatch(/<a\b[^>]*href="\/pricing"[^>]*>\s*Pricing\s*<\/a>/)
    expect(nav).toContain('href="#services"')
    expect(nav).toContain('href="#projects"')
    expect(nav).toContain('Get Started')
  })

  // 왜: 메인 내비게이션은 홈과 로그인 대시보드로 나뉘어 있어 양쪽에서 가격을 찾는다.
  it('로그인 후 메인 메뉴를 열면 기존 메뉴와 함께 Pricing으로 이동할 수 있다', async () => {
    const { DashboardHeader } = await import('@/components/dashboard/dashboard-header')
    for (const active of ['projects', 'playground', 'queue', 'account'] as const) {
      const html = renderToStaticMarkup(createElement(DashboardHeader, { active }))
      const nav = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''
      expect(nav).toMatch(/<a\b[^>]*href="\/pricing"[^>]*>\s*Pricing\s*<\/a>/)
      for (const label of ['Projects', 'Playground', 'Queue', 'Account']) expect(nav).toContain(label)
    }
  })
})
