// 사이트 Contact 창의 지원 이메일. Creem 심사는 사이트·정책 문서·Creem 사업자 정보의 지원 주소가 같은지 본다.
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// 팝업은 눌러야 열린다. 정적 렌더에서 열린 내용을 보려고 껍데기만 걷어 낸다.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: ({ children }: { children: ReactNode }) => children,
  PopoverContent: ({ children }: { children: ReactNode }) => children,
}))

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g

describe('Contact 창 지원 이메일', () => {
  // 왜: Creem 문서가 꼽은 수정 요청 사유 1위가 지원 이메일이다. 개인 Gmail이 보이거나 정책 문서와 주소가 다르면 심사에서 고치라고 돌려보낸다.
  it('Contact 창을 열면 정책 문서에 적힌 것과 같은 브랜드 주소와 메일 링크를 보여 준다', async () => {
    const { ContactPopover } = await import('@/components/contact-popover')
    const { LEGAL_DOCUMENTS } = await import('@/lib/legal/documents')
    const { footerMarkdown } = await import('@/content/legal/footer')

    const policyEmails = new Set(
      [...Object.values(LEGAL_DOCUMENTS).map((document) => document.markdown), footerMarkdown]
        .flatMap((markdown) => markdown.match(EMAIL_PATTERN) ?? []),
    )
    expect([...policyEmails]).toEqual(['support@talestudio.art'])

    const html = renderToStaticMarkup(createElement(ContactPopover))
    expect(html).toContain('href="mailto:support@talestudio.art"')
    expect(html).toContain('>support@talestudio.art</a>')
    expect(html).not.toMatch(/gmail\.com/)
  })
})
