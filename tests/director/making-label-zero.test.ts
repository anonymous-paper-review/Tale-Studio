// 띠 · 만드는 중 글은 셀 샷이 아직 없을 때 "1장"이라고 하지 않고 수 없이 쓴다 (영어 재점검 qa-golden — 2샷 [Make again]이 "Making 1 image", 리드 11/14)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { makingLabel } from '@/lib/director/toolbar-work'

const en = (text: string, params?: Record<string, string | number>) => translate('en', text, params)
const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)

describe('같이 정한 것', () => {
  it('띠 · 만드는 중 글이 셀 샷이 아직 없으면 "1장"이라고 하지 않는다 — 수 없이 "이미지 만드는 중"', () => {
    // 왜: 영어 재점검 — 2샷을 [Make again] 했는데 띠가 "Making 1 image"였다. 다시 그리는 샷은 이미 이미지가 있어
    //   서버 답(작업 목록) 전에는 하나도 세지 않는데, 글은 0개일 때도 "1장"으로 떨어졌다.
    expect(makingLabel(0, 0, en)).toBe('Making images')
    expect(makingLabel(0, 0, ko)).toBe('이미지 만드는 중')
    // 셀 수가 있으면 지금처럼 수를 쓴다.
    expect(makingLabel(1, 0, en)).toBe('Making 1 image')
    expect(makingLabel(2, 0, ko)).toBe('이미지 2장 만드는 중')
    // 위쪽 띠: 셀 이미지가 0개면 수 없이, 1개면 단수, 2개 이상이면 수.
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    const band = page.slice(page.indexOf('const progressLabel ='), page.indexOf('// v3 D1 → 1110 확정'))
    expect(band).toContain("makingImages > 1 ? t('Making {count} images', { count: makingImages }) : makingImages === 1 ? t('Making 1 image') : t('Making images')")
    expect(en('Making images')).toBe('Making images')
    expect(ko('Making images')).toBe('이미지 만드는 중')
  })
})
