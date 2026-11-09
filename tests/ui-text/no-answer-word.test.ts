// 한국어 화면의 거절 단추가 "아니오"가 아니라 "아니요"로 쓰이는지 검사한다
import { describe, expect, it } from 'vitest'
import { KO } from '@/lib/i18n/messages-ko'
import { translate } from '@/lib/i18n/translate'

describe('거절 단추 말', () => {
  // 왜: 오너 2026-11-09 추천대로(결정 11) — 묻는 말에 대답하는 말은 "아니요"다("아니오"는 "~이 아니오"처럼 문장 끝에 쓰는 꼴).
  //   확인 창 · 채팅 빠른 답의 거절 단추가 화면마다 "아니오"와 "아니요"로 갈려 있었다.
  it('한국어 화면의 거절 단추는 "아니오"가 아니라 "아니요"라고 쓴다', () => {
    expect(translate('ko', 'No')).toBe('아니요')
    expect(translate('ko', 'No, let me fix it')).toBe('아니요, 고칠래요')
    expect(Object.entries(KO).filter(([, ko]) => ko.includes('아니오'))).toEqual([])
  })
})
