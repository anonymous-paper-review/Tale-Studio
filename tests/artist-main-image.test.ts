// 캐릭터 대표 이미지의 진실(#artist-main-authority 2026-09-03) — 기본 모습 시트 > 시트 있는 첫 모습 > 구 view_main.
import { describe, it, expect } from 'vitest'
import { mainImageFromAppearances } from '@/lib/artist/main-image'

describe('mainImageFromAppearances', () => {
  it('기본 모습의 시트가 대표 이미지다 (view_main 이 비어 있어도)', () => {
    expect(mainImageFromAppearances(null, [
      { isDefault: false, sheetUrl: 'https://x/young.png' },
      { isDefault: true, sheetUrl: 'https://x/current.png' },
    ])).toBe('https://x/current.png')
  })

  it('기본 모습에 시트가 없으면 시트가 있는 첫 모습', () => {
    expect(mainImageFromAppearances(null, [
      { isDefault: true, sheetUrl: null },
      { isDefault: false, sheetUrl: 'https://x/old.png' },
    ])).toBe('https://x/old.png')
  })

  it('모습 시트가 하나도 없으면 구 컬럼(view_main) 폴백, 그것도 없으면 null', () => {
    expect(mainImageFromAppearances('https://x/legacy.png', [{ isDefault: true, sheetUrl: null }])).toBe('https://x/legacy.png')
    expect(mainImageFromAppearances(null, [])).toBeNull()
    expect(mainImageFromAppearances(undefined, undefined)).toBeNull()
  })

  it('겨울_5 실측: view_main 없음 + 기본 모습 시트 있음 → 있음(재생성 대상 아님)', () => {
    expect(mainImageFromAppearances(null, [{ isDefault: true, sheetUrl: 'https://x/char_sheet.png' }])).not.toBeNull()
  })
})
