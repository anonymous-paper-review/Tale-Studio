// 채팅 고치기 뒤 [러프 다시 그리기] 제안 문구가 영어 화면에서 "1 changed shots"처럼 수가 어긋나지 않는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const store = readFileSync('src/stores/global-chat-store.ts', 'utf8')
const offer = store.slice(store.indexOf('shotsToRedrawAfterChat(completedTools'))
const key = /content: translate\(locale, '([^']+)'/.exec(offer)?.[1] ?? ''

describe('러프 다시 그리기 제안 문구', () => {
  // 왜: 2026-10-31 영어 화면 확인 — 샷 하나를 고쳤을 때 "for 1 changed shots"로 떴다(시연 계정은 영어 화면).
  it('영어 화면에서 샷 하나만 고쳐도 제안 문구의 수가 어긋나지 않는다', () => {
    expect(key).not.toBe('')
    for (const count of [1, 3]) expect(translate('en', key, { count })).not.toMatch(/\b1 changed shots\b|\b1 shots\b/)
  })

  // 왜: 한국어 화면은 몇 개를 다시 그리는지 그대로 알려 준다(정상 경로 고정).
  it('한국어 화면에서는 "고친 샷 2개의 러프 그림은 아직 예전 그대로예요"처럼 수를 알려 준다', () => {
    expect(translate('ko', key, { count: 2 })).toContain('고친 샷 2개의 러프 그림은 아직 예전 그대로예요')
  })
})
