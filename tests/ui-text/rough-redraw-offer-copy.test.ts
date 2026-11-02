// 채팅 고치기 뒤 [러프 다시 그리기] 제안 문구가 영어 화면에서 "1 changed shots"처럼 수가 어긋나지 않는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const store = readFileSync('src/stores/global-chat-store.ts', 'utf8')
const start = store.indexOf('roughRedrawCandidates(completedTools')
const offer = store.slice(start, store.indexOf("translate(locale, 'Redraw the rough')", start))
// 샷을 고친 때와 씬을 고친 때의 두 문구.
const keys = [...offer.matchAll(/translate\(locale, '([^']+)', \{ count/g)].map((m) => m[1])
const shotKey = keys.find((key) => key.startsWith('The rough sketches of the shots')) ?? ''

describe('러프 다시 그리기 제안 문구', () => {
  // 왜: 2026-10-31 영어 화면 확인 — 샷 하나를 고쳤을 때 "for 1 changed shots"로 떴다(시연 계정은 영어 화면).
  it('영어 화면에서 샷 하나만 고쳐도 제안 문구의 수가 어긋나지 않는다', () => {
    expect(keys).toHaveLength(2)
    for (const key of keys) {
      for (const count of [1, 3]) {
        const text = translate('en', key, { count })
        expect(text).not.toMatch(/\b1 changed shots\b|\b1 shots\b|\b1 drawn shots\b/)
        expect(text).toContain(`: ${count}.`)
      }
    }
  })

  // 왜: 한국어 화면은 몇 개를 다시 그리는지 그대로 알려 준다(정상 경로 고정).
  it('한국어 화면에서는 "고친 샷 2개의 러프 그림은 아직 예전 그대로예요"처럼 수를 알려 준다', () => {
    expect(translate('ko', shotKey, { count: 2 })).toContain('고친 샷 2개의 러프 그림은 아직 예전 그대로예요')
  })
})
