// 러프 한 장 다시 그리기 알림이 영어 화면에서 "Start frame frame"처럼 겹치지 않고, 한국어 문구는 그대로인지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const still = readFileSync('src/features/writer/rough-frames-still.tsx', 'utf8')
const keys = [...still.matchAll(/t\('((?:Redrawing|Redrew) the \{frame\}[^']*)'/g)].map((m) => m[1])
const FRAMES = ['Start frame', 'Directing frame', 'End frame']

describe('한 장 다시 그리기 알림 문구', () => {
  // 왜: 2026-10-31 영어 화면 QA — 장 이름이 이미 "Start frame"이라 알림이 "Redrew the Start frame frame."으로 떴다(시연 계정은 영어 화면).
  it('영어 화면에서 [이 장만 다시 만들기] 알림은 장 이름 뒤에 frame 을 한 번만 쓴다', () => {
    expect(keys).toHaveLength(2)
    for (const key of keys) {
      for (const frame of FRAMES) {
        const text = translate('en', key, { frame: translate('en', frame) })
        expect(text).not.toMatch(/frame frame/i)
        expect(text).toContain(frame)
      }
    }
  })

  // 왜: 한국어 화면 문구는 맞게 나오고 있었다 — 고치면서 바뀌지 않게 고정한다(정상 경로 고정).
  it('한국어 화면에서는 "시작 장을 다시 그렸어요. 나머지 두 장은 그대로예요."처럼 그대로 보인다', () => {
    const done = keys.find((key) => key.startsWith('Redrew'))!
    const doing = keys.find((key) => key.startsWith('Redrawing'))!
    expect(translate('ko', done, { frame: translate('ko', 'Start frame') })).toBe('시작 장을 다시 그렸어요. 나머지 두 장은 그대로예요.')
    expect(translate('ko', doing, { frame: translate('ko', 'End frame') })).toBe('끝 장을 다시 그리는 중이에요. 30초쯤 걸려요.')
  })
})
