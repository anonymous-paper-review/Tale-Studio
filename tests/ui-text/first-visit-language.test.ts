// 처음 온 방문자의 화면 언어를 브라우저 언어로 정하는지 검사한다 (국내 카드 결제가 한국어 화면에만 보이므로).
import { describe, expect, it } from 'vitest'
import { initialLocaleFor } from '@/lib/locale'

describe('처음 방문자 화면 언어', () => {
  // 왜: 로그인 전 방문자는 늘 영어로 시작해서, 한국 손님과 카드사 심사관이 원화 결제를 못 보고 나갈 수 있었다 (오너 2026-11-24 ③A).
  it('처음 온 방문자의 브라우저가 한국어면 화면을 한국어로 시작한다', () => {
    expect(initialLocaleFor(['ko-KR', 'en-US'])).toBe('ko')
    expect(initialLocaleFor(['ko'])).toBe('ko')
  })

  // 왜: 정상 경로 고정. 해외 방문자는 지금처럼 영어로 본다.
  it('처음 온 방문자의 브라우저 첫 언어가 한국어가 아니면 영어로 시작한다', () => {
    expect(initialLocaleFor(['en-US', 'ko-KR'])).toBe('en')
    expect(initialLocaleFor(['ja-JP'])).toBe('en')
    expect(initialLocaleFor([])).toBe('en')
    expect(initialLocaleFor(undefined)).toBe('en')
  })
})
