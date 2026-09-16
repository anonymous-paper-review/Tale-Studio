// 홈페이지 제목은 요청받은 Pre-visualization 문구를 그대로 보여 준다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/project-store', () => ({
  useProjectStore: (select: (state: object) => unknown) => select({
    switchProject: vi.fn(),
    createNewProject: vi.fn(),
  }),
}))
vi.mock('@/components/contact-popover', () => ({ ContactPopover: () => null }))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text }))

describe('홈페이지 제목', () => {
  // 왜: 정상 경로 고정. 방문자와 심사 담당자가 요청받은 소개 문구를 그대로 읽어야 한다.
  it('홈페이지를 열면 제목에 Your Tale Deserves a Take by Pre-visualization.을 표시한다', async () => {
    const { default: HomePage } = await import('@/app/page')
    const html = renderToStaticMarkup(createElement(HomePage))
    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''
    const text = heading.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

    expect(text).toBe('Your Tale Deserves a Take by Pre-visualization.')
  })
})
