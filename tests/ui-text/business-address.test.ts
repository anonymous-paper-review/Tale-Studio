// 바닥글·약관·개인정보처리방침에 사업자등록증과 같은 사업장 주소가 실리는지 검사한다 (카드사 심사·통신판매업 신고 요건).
import { describe, expect, it } from 'vitest'
import { footerMarkdown } from '@/content/legal/footer'
import { termsMarkdown } from '@/content/legal/terms'
import { privacyMarkdown } from '@/content/legal/privacy'

const REGISTERED_ADDRESS = 'Unit 2010, 20F, Bldg. 1, 46 Wiryeseoil-ro, Sujeong-gu, Seongnam-si, Gyeonggi-do, Republic of Korea'

describe('사업장 주소', () => {
  // 왜: 2026-11-23 통신판매업 신고가 "주소가 사업자등록증과 다르다"로 반려됐다. 카드사 심사도 사이트 하단 주소를 등록증과 맞춰 본다.
  it('바닥글·약관·개인정보처리방침의 주소는 사업자등록증 주소(위례서일로 46, 1동 20층 2010호)다', () => {
    for (const doc of [footerMarkdown, termsMarkdown, privacyMarkdown]) {
      expect(doc).toContain(REGISTERED_ADDRESS)
      expect(doc).not.toContain('Dolma-ro')
    }
  })
})
