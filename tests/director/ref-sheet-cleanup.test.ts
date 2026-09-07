// 기준 시트만 지우고 다른 그림과 사용자 업로드는 안전하게 보존한다 (#ref-sheet-ttl)
import { describe, it, expect } from 'vitest'
import { _refSheetStoragePath } from '@/lib/fal/finalize'

// #ref-sheet-ttl — 리페인트 레퍼런스 시트만 지우는 경로 판별의 계약.
//   가드가 전부다: 패턴 밖 URL(러프 프레임·실사 프레임·템플릿·유저 업로드)은 절대 null 이어야 한다.

const BASE = 'https://x.supabase.co/storage/v1/object/public/media'

describe('_refSheetStoragePath', () => {
  it('여러 장 그림의 기준 시트를 올바른 위치에서 찾는다', () => {
    expect(
      _refSheetStoragePath(`${BASE}/ws1/proj1/shots/real_grid_ref_1755500000000_sh_01_01.png`),
    ).toBe('ws1/proj1/shots/real_grid_ref_1755500000000_sh_01_01.png')
  })

  it('한 장 그림의 기준 시트도 주소 뒤 추가 정보와 상관없이 찾는다', () => {
    expect(
      _refSheetStoragePath(`${BASE}/ws1/proj1/shots/sh_02_04_storyboard_ref_strip.png?v=123`),
    ).toBe('ws1/proj1/shots/sh_02_04_storyboard_ref_strip.png')
  })

  it('기준 시트가 아닌 다른 그림과 사용자 업로드는 지우지 않는다', () => {
    for (const url of [
      `${BASE}/ws1/proj1/shots/sh_01_01_rough_storyboard.png`,
      `${BASE}/ws1/proj1/shots/real_grid_abc123.png`,
      `${BASE}/templates/rough-storyboard-grid-cinema-aaaaaaaaaaaa.png`,
      `${BASE}/ws1/proj1/uploads/v1-hash/original.jpg`,
      'https://other-host.com/storage/v1/object/public/media/ws1/p/shots/real_grid_ref_1_s.png'.replace('/storage/v1/object/public/media/', '/other/'),
      null,
      42,
    ]) {
      expect(_refSheetStoragePath(url)).toBeNull()
    }
  })
})
