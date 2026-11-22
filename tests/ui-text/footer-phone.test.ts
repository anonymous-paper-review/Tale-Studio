// 사이트 바닥글에 사업자 연락 전화번호가 보이는지 검사한다 (국내 카드사 심사 요건).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/marketing/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/contact-popover', () => ({ ContactPopover: () => null }))

describe('바닥글 사업자 정보', () => {
  // 왜: 국내 PG·카드사 심사가 사이트 하단에서 유선 연락처를 확인한다 (포트원 사전검사 "유선번호 없음" 경고, 2026-11-19).
  it('바닥글을 열면 사업자 전화번호 +82-10-6766-3007 이 보인다', async () => {
    const { LegalFooter } = await import('@/components/legal/legal-footer')
    const html = renderToStaticMarkup(createElement(LegalFooter))
    expect(html).toContain('+82-10-6766-3007')
  })
})
