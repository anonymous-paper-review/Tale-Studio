// 정책 페이지는 받은 원문을 보존하고 홈·요금표에서 로그인 없이 찾을 수 있게 연결한다.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/marketing/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/contact-popover', () => ({ ContactPopover: () => null }))

const plain = (text: string) => text
  .replace(/<[^>]*>/g, '')
  .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim()
const markdownText = (text: string) => text
  .replace(/^\|(?:[\s:|-]+)\|$/gm, '')
  .replace(/^---$/gm, '')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^[-*] /gm, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\*\*|\*/g, '')
  .replace(/\|/g, ' ')
  .replace(/\s+/g, ' ').trim()

describe('공개 정책 문서', () => {
  // 왜: 정상 경로 고정. 담당자가 올린 문장을 화면 작업 중 바꾸거나 빼면 안 된다.
  it('정책을 열면 전달받은 원문의 문장과 표를 빠짐없이 읽을 수 있다', async () => {
    const { LEGAL_DOCUMENTS } = await import('@/lib/legal/documents')
    const { LegalMarkdown } = await import('@/components/legal/legal-markdown')
    const manifest = JSON.parse(readFileSync('src/content/legal/source-manifest.json', 'utf8'))
    for (const document of Object.values(LEGAL_DOCUMENTS)) {
      expect(createHash('sha256').update(document.markdown).digest('hex')).toBe(manifest.files[document.sourceFile].sha256)
      const html = renderToStaticMarkup(createElement(LegalMarkdown, { markdown: document.markdown }))
      expect(plain(html)).toBe(markdownText(document.markdown))
      expect(html).toContain('<h1')
      expect(html).toContain('<h2')
    }
    const privacy = renderToStaticMarkup(createElement(LegalMarkdown, { markdown: LEGAL_DOCUMENTS.privacy.markdown }))
    expect(privacy.match(/<table/g)).toHaveLength(3)
    expect(privacy).toContain('scope="col"')
    expect(privacy).toContain('href="https://www.paddle.com/legal/privacy"')
  })

  // 왜: 정상 경로 고정. 방문자가 약관과 가격을 왕복하며 확인할 수 있어야 한다.
  it('정책 페이지를 열면 다른 정책과 요금표로 이동할 수 있다', async () => {
    const { LEGAL_DOCUMENTS } = await import('@/lib/legal/documents')
    for (const key of ['terms', 'refund', 'privacy'] as const) {
      const { default: Page, metadata } = await import(`../../src/app/${key}/page`)
      const html = renderToStaticMarkup(createElement(Page))
      for (const path of ['/terms', '/refund', '/privacy', '/pricing']) expect(html).toContain(`href="${path}"`)
      expect(html).toContain('aria-current="page"')
      expect(html).toContain('lang="en"')
      expect(metadata.alternates.canonical).toBe(`https://talestudio.art/${key}`)
      expect(plain(html)).toContain(LEGAL_DOCUMENTS[key].title)
    }
  })

  // 왜: 구매 전에 조건을 찾는 방문자가 빈 링크로 이동하면 안 된다.
  it('홈과 요금표 하단을 보면 실제 정책 링크와 전달받은 사업자 안내가 보인다', async () => {
    const { LegalFooter } = await import('@/components/legal/legal-footer')
    const { footerMarkdown } = await import('@/content/legal/footer')
    const { SiteFooter } = await import('@/components/marketing/site-footer')
    const html = renderToStaticMarkup(createElement(LegalFooter))
    expect(plain(html)).toBe(markdownText(footerMarkdown))
    for (const path of ['/terms', '/refunds', '/privacy']) {
      expect(html).toContain(`href="${path}"`)
      expect(renderToStaticMarkup(createElement(SiteFooter))).toContain(`href="${path}"`)
    }
    const home = readFileSync('src/app/page.tsx', 'utf8')
    expect(home).toContain('<LegalFooter')
    expect(home).not.toMatch(/href="#"[^>]*>\s*(Privacy Policy|Terms of Service)/)
    expect(readFileSync('src/components/billing/pricing-page.tsx', 'utf8')).toContain('<SiteFooter')
  })

  // 왜: 문서의 표시가 스크립트 실행이나 숨겨진 링크가 되면 안 된다.
  it('문서에 HTML이나 실행용 주소가 있어도 코드로 실행하지 않는다', async () => {
    const { LegalMarkdown } = await import('@/components/legal/legal-markdown')
    const html = renderToStaticMarkup(createElement(LegalMarkdown, {
      markdown: '<script>alert(1)</script>\n\n[Unsafe](javascript:alert) [Safe](/terms)',
    }))
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('href="/terms"')
  })

  // 왜: 원문 푸터의 복수형 주소를 유지해도 방문자가 같은 환불 정책에 도착해야 한다.
  it('원문에 적힌 환불 주소로 들어오면 정식 환불 페이지로 이동한다', async () => {
    const { default: RefundAlias } = await import('@/app/refunds/page')
    expect(() => RefundAlias()).toThrow('NEXT_REDIRECT')
  })
})
