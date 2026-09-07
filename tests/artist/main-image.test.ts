// 기본 모습의 그림표를 우선 대표 이미지로 쓰고, 없으면 다른 그림표와 예전 이미지를 차례로 확인한다 (#artist-main-authority 2026-09-03)
// 캐릭터 대표 이미지의 진실(#artist-main-authority 2026-09-03) — 기본 모습 시트 > 시트 있는 첫 모습 > 구 view_main.
import { describe, it, expect } from 'vitest'
import { mainImageFromAppearances } from '@/lib/artist/main-image'

describe('mainImageFromAppearances', () => {
  it('기본 모습의 그림표를 대표 이미지로 사용한다 (대표 이미지가 비어 있어도)', () => {
    expect(mainImageFromAppearances(null, [
      { isDefault: false, sheetUrl: 'https://x/young.png' },
      { isDefault: true, sheetUrl: 'https://x/current.png' },
    ])).toBe('https://x/current.png')
  })

  it('기본 모습에 그림표가 없으면 그림표가 있는 첫 모습을 사용한다', () => {
    expect(mainImageFromAppearances(null, [
      { isDefault: true, sheetUrl: null },
      { isDefault: false, sheetUrl: 'https://x/old.png' },
    ])).toBe('https://x/old.png')
  })

  it('모습 그림표가 하나도 없으면 예전 대표 이미지를 쓰고, 그것도 없으면 비워 둔다', () => {
    expect(mainImageFromAppearances('https://x/legacy.png', [{ isDefault: true, sheetUrl: null }])).toBe('https://x/legacy.png')
    expect(mainImageFromAppearances(null, [])).toBeNull()
    expect(mainImageFromAppearances(undefined, undefined)).toBeNull()
  })

  it('겨울_5 실측: 대표 이미지가 없어도 기본 모습 그림표가 있으면 다시 만들지 않는다', () => {
    expect(mainImageFromAppearances(null, [{ isDefault: true, sheetUrl: 'https://x/char_sheet.png' }])).not.toBeNull()
  })
})
