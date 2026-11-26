// 채팅 승인 카드의 머리 글(영어 "Suggestion" · 한국어 "제안")이 화면 언어를 따르는지 검사한다 (2026-11-22 fb-artist 찾음 · 리드 지시)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { translate } from '@/lib/i18n/translate'

describe('채팅 승인 카드 머리', () => {
  // 왜: 승인 카드(인물 · 배경 · 소품 다시 그리기 등 모든 단계)의 머리 글이 영어 글자 그대로 박혀 있어 한국어 화면에도 "Suggestion" 이 보였다.
  //   사전에는 '제안'이 있는데 부르지 않았다(2026-08-27 채팅 계측 작업 때 t() 가 빠짐, 까닭 기록 없음).
  it('한국어 화면의 승인 카드 머리는 한국어다', () => {
    const chat = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    const card = chat.slice(chat.indexOf('{showProposal && pendingProposal && ('))
    const head = card.slice(0, card.indexOf('</span>'))
    expect(head).toContain("{t('Suggestion')}")
    expect(translate('ko', 'Suggestion')).toBe('제안')
    expect(translate('en', 'Suggestion')).toBe('Suggestion')
  })
})
