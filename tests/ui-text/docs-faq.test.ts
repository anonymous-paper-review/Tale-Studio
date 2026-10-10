// 이용 가이드의 자주 묻는 질문은 대표가 정한 답변 문장을 그대로 보여준다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/marketing/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/marketing/site-footer', () => ({ SiteFooter: () => null }))

const plain = (html: string) => html
  .replace(/<[^>]*>/g, '')
  .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim()

describe('이용 가이드 자주 묻는 질문', () => {
  // 왜: 정상 경로 고정. 예전 답변은 "상업 이용 전에 문의하라"고 해서 약관과 어긋났고, 대표가 2026-10-10 새 문장을 정했다.
  it('상업적 이용 질문을 보면 대표가 정한 답변이 그대로 보인다', async () => {
    const { default: DocsPage } = await import('@/app/docs/page')
    const text = plain(renderToStaticMarkup(createElement(DocsPage)))
    expect(text).toContain('Can I use what I generate commercially?')
    expect(text).toContain(
      'Yes. You may use your output commercially. You must have the rights to any material you upload, follow our content rules and the applicable AI model terms, and stay within your plan’s export limits.',
    )
    expect(text).not.toContain('please reach out before using anything in a commercial project')
  })

  // 왜: 이용 가이드 첫 단계 문장 끝에 코드용 표시 "// copy-ok: fragment"가 방문자 화면에 그대로 찍히고 있었다.
  it('이용 가이드를 열면 코드용 표시 문구가 화면에 보이지 않는다', async () => {
    const { default: DocsPage } = await import('@/app/docs/page')
    const text = plain(renderToStaticMarkup(createElement(DocsPage)))
    expect(text).toContain('Log in and create a new project.')
    expect(text).not.toContain('copy-ok')
  })
})
