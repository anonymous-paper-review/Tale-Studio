import { describe, it, expect } from 'vitest'
import { _refSheetStoragePath } from '@/lib/fal/finalize'

// #ref-sheet-ttl — 리페인트 레퍼런스 시트만 지우는 경로 판별의 계약.
//   가드가 전부다: 패턴 밖 URL(러프 프레임·실사 프레임·템플릿·유저 업로드)은 절대 null 이어야 한다.

const BASE = 'https://x.supabase.co/storage/v1/object/public/media'

describe('_refSheetStoragePath', () => {
  it('배치 그리드 ref (타임스탬프 네이밍) — 경로 추출', () => {
    expect(
      _refSheetStoragePath(`${BASE}/ws1/proj1/shots/real_grid_ref_1755500000000_sh_01_01.png`),
    ).toBe('ws1/proj1/shots/real_grid_ref_1755500000000_sh_01_01.png')
  })

  it('단건 스트립 ref (고정 네이밍 + ?v= 캐시버스터) — 쿼리 제거 후 추출', () => {
    expect(
      _refSheetStoragePath(`${BASE}/ws1/proj1/shots/sh_02_04_storyboard_ref_strip.png?v=123`),
    ).toBe('ws1/proj1/shots/sh_02_04_storyboard_ref_strip.png')
  })

  it('ref 가 아닌 자산은 전부 null — 러프 프레임·실사 산출·템플릿·업로드', () => {
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
