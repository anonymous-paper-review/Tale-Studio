// 국내 카드 결제 전 구매자 창이 이름을 미리 채우고, 왜 묻는지와 저장하지 않는다는 점을 알리는지 검사한다 (오너 2026-11-24 ⑤).
import { describe, expect, it } from 'vitest'
import { initialBuyerName, BUYER_PRIVACY_NOTE, BUYER_NEXT_STEP_NOTE } from '@/components/billing/portone-buyer-dialog'
import { translate } from '@/lib/i18n/translate'

describe('국내 카드 구매자 창', () => {
  // 왜: 이름·전화번호를 둘 다 치게 하면 손님이 이상하게 여긴다. 구글 계정 이름이 있으면 전화번호만 치면 된다.
  it('처음 결제하는 사람의 이름 칸은 구글 계정 이름으로 미리 채운다', () => {
    expect(initialBuyerName({ saved: '', account: '윤대원' })).toBe('윤대원')
  })

  // 왜: 정상 경로 고정. 지난 결제 때 직접 고친 이름이 있으면 그 이름을 쓴다.
  it('이 브라우저에서 결제한 적이 있으면 그때 쓴 이름을 채운다', () => {
    expect(initialBuyerName({ saved: '홍길동', account: '윤대원' })).toBe('홍길동')
    expect(initialBuyerName({ saved: '', account: null })).toBe('')
  })

  // 왜: 이름·전화만으로 결제되는 줄 알거나 개인정보를 모으는 줄 오해할 수 있다 (오너 2026-11-24).
  it('구매자 창은 KG이니시스에만 전달하고 Tale Studio는 저장하지 않는다고 알린다', () => {
    const ko = translate('ko', BUYER_PRIVACY_NOTE)
    expect(ko).toContain('KG이니시스에만 전달')
    expect(ko).toContain('저장하지 않아요')
  })

  // 왜: 이 창에서 결제가 끝나는 줄 아는 오해를 막는다. 카드 정보는 다음 화면(이니시스 결제창)에서 넣는다.
  it('구매자 창은 카드 번호를 다음 화면의 KG이니시스 결제창에서 넣는다고 알린다', () => {
    expect(translate('ko', BUYER_NEXT_STEP_NOTE)).toContain('KG이니시스 결제창')
  })
})
