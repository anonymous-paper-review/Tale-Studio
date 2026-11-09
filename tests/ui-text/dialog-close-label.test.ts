// 한국어 화면에서 팝업의 닫기 단추가 영어 "Close" 대신 "닫기"로 읽히는지 검사한다
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'

type Element = ReactElement<Record<string, unknown>>
/** 함수 부품을 그리지 않고 props 의 자식만 따라 내려간다 — 이 시험이 보는 것은 글자뿐이다. */
const elements = (node: ReactNode): Element[] =>
  Array.isArray(node) ? node.flatMap(elements) : isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : []
const texts = (node: ReactNode): string[] =>
  elements(node).flatMap((el) => [el.props.children].flat().filter((c): c is string => typeof c === 'string'))

describe('팝업 닫기 단추 이름', () => {
  // 왜: 검토 A L2 — 팝업 오른쪽 위 X 의 숨은 이름과 아래 [닫기] 단추가 한국어 화면에서도 영어 "Close"로 읽혔다.
  it('한국어 화면에서 팝업의 닫기 단추는 "닫기"로 읽힌다', () => {
    const top = texts(DialogContent({ children: null }))
    expect(top).toContain('닫기')
    expect(top).not.toContain('Close')
    // 아래 [닫기] 단추는 팝업 안에서만 그려진다(Radix) — 열린 팝업 뿌리 안에 두고 그린다.
    const bottom = renderToStaticMarkup(createElement(Dialog, { open: true }, createElement(DialogFooter, { showCloseButton: true })))
    expect(bottom).toMatch(/<button[^>]*>닫기<\/button>/)
    expect(bottom).not.toContain('Close')
  })
})
