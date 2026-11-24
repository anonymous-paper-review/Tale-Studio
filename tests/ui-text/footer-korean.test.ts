// 한국어 화면의 바닥글이 사업자 정보를 한국어로, 영문 바닥글과 같은 번호로 보이는지 검사한다 (오너 2026-11-24 ④).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BusinessInfoKo, BUSINESS_INFO_KO } from '@/components/legal/legal-footer'
import { footerMarkdown } from '@/content/legal/footer'

describe('한국어 바닥글', () => {
  // 왜: 카드사 심사관·한국 손님이 한국어 화면에서 사업자 정보를 바로 읽을 수 있어야 한다.
  it('한국어 화면 바닥글은 상호·대표·사업자번호·통신판매업 번호·주소·전화를 한국어로 보인다', () => {
    const html = renderToStaticMarkup(createElement(BusinessInfoKo))
    for (const part of ['테일스튜디오', '대표 윤대원', '사업자등록번호 333-27-02069', '통신판매업 신고 제2026-성남수정-0914호', '경기도 성남시 수정구 위례서일로 46', '010-6766-3007', 'support@talestudio.art']) {
      expect(html).toContain(part)
    }
  })

  // 왜: 한국어·영문 바닥글이 따로 적혀 있어서, 한쪽만 고치면 번호가 어긋날 수 있다.
  it('한국어 바닥글의 사업자번호·통신판매업 번호·전화는 영문 바닥글과 같다', () => {
    expect(footerMarkdown).toContain(BUSINESS_INFO_KO.registration)
    expect(footerMarkdown).toContain(BUSINESS_INFO_KO.mailOrder)
    expect(footerMarkdown).toContain(BUSINESS_INFO_KO.phoneIntl)
  })
})
