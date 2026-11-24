// 사이트 바닥글에 통신판매업 신고번호가 보이는지 검사한다 (전자상거래법 표시 의무·카드사 심사 요건).
import { describe, expect, it } from 'vitest'
import { footerMarkdown } from '@/content/legal/footer'

describe('바닥글 통신판매업 신고번호', () => {
  // 왜: 전자상거래법상 통신판매업자는 신고번호를 사이트에 표시해야 하고, 카드사 심사도 바닥글에서 이 번호를 확인한다. 2026-11-24 성남시 신고 수리.
  it('바닥글을 열면 통신판매업 신고번호 제2026-성남수정-0914호가 보인다', () => {
    expect(footerMarkdown).toContain('제2026-성남수정-0914호')
  })
})
