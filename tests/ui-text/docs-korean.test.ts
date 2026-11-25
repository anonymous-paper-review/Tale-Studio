// 한국어 화면에서 이용 가이드(문서)의 모든 문구가 한국어로 보이는지 검사한다 (오너 2026-11-25).
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { STAGE_GUIDE, FAQ, DOCS_COPY, DocsContent } from '@/components/marketing/docs-content'
import { translate } from '@/lib/i18n/translate'

const hangul = /[가-힣]/

describe('이용 가이드 언어', () => {
  // 왜: 한국어 화면인데 이용 가이드만 영어로 나왔다 (오너 2026-11-25).
  it('한국어 화면에서 이용 가이드를 열면 제목·시작 순서·단계 설명·자주 묻는 질문이 모두 한국어로 보인다', () => {
    const all = [...DOCS_COPY, ...STAGE_GUIDE.flatMap((s) => [s.name, s.body]), ...FAQ.flatMap((f) => [f.q, f.a])]
    const missing = all.filter((text) => !hangul.test(translate('ko', text)))
    expect(missing).toEqual([])
  })

  // 왜: 오너 2026-11-25 "p1, p2 … 코딩할 때 남은 단어들". 제작 단계 머리에 P1~P5 가 붙어 있었다.
  it('이용 가이드의 제작 단계에는 개발용 번호(P1~P5)가 붙지 않는다', () => {
    const html = renderToStaticMarkup(createElement(DocsContent))
    expect(html).not.toMatch(/>P<!-- -->\d|>P\d/)
  })
})
