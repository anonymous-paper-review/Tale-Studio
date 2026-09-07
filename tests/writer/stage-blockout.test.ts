// 배치도(#blockout 2026-09-03): 무대 배치 → SVG 시트(열 = 샷, 위 START / 아래 END) → PNG.
import { describe, it, expect } from 'vitest'
import { buildBlockoutSheetSvg, columnFromLayout, numberPaths, renderBlockoutPng } from '@/lib/writer/pipeline/stage/blockout'
import { buildBlockoutClause } from '@/lib/writer/rough-storyboard-grid'
import type { ScreenPlacement, ShotScreenLayout } from '@/lib/writer/types/pipeline'

const place = (over: Partial<ScreenPlacement>): ScreenPlacement => ({
  in_frame: true, screen_x: 0, screen_y: -0.6, distance_m: 5, apparent_height: 0.5, position_in_frame: 'center_third', depth_band: 'midground', facing: 'front', ...over,
})
const LAYOUT: ShotScreenLayout = {
  beat: 0,
  camera: { x: 0, y: -3, z: 1.5, look_at: { x: 0, y: 5, z: 1 }, lens_mm: 35, hfov_deg: 54 },
  characters: [
    { character_id: 'char_3', start: place({ apparent_height: 0.3, distance_m: 8, posture: 'lying' }), end: place({ apparent_height: 0.9, distance_m: 3 }) },
    { character_id: 'char', start: place({ screen_x: 0.8, position_in_frame: 'frame_edge_right', depth_band: 'foreground', apparent_height: 1.4, facing: 'back', distance_m: 2 }) },
    { character_id: 'char_9', start: place({ screen_x: 2.5, in_frame: false, position_in_frame: 'off_right' }) },
  ],
  issues: [],
}

describe('배치도 SVG', () => {
  it('열마다 START/END 패널, blocking 번호로 라벨, 프레임 밖 인물은 안 그린다', () => {
    const col = columnFromLayout(LAYOUT, ['char_3', 'char', 'char_9'])
    expect(col.start!.figures.map((f) => f.n)).toEqual([1, 2, 3])
    expect(col.end!.figures.find((f) => f.n === 1)!.placement.apparent_height).toBe(0.9) // END 배치
    expect(col.end!.figures.find((f) => f.n === 2)!.placement).toBe(LAYOUT.characters[1].start) // END 없음 → START
    const { svg, width, height } = buildBlockoutSheetSvg([col, { start: null, end: null }], { aspect: 16 / 9 })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(width).toBe(16 + 2 * (400 + 16))
    expect(height).toBe(16 + 2 * (225 + 16))
    // START 패널: 프레임 안 2명(누운 수인 = 가로 캡슐, 용족 = 세로 캡슐), char_9(u=2.5) 는 제외
    const figRects = svg.match(/class="fig"/g) ?? []
    expect(figRects.length).toBe(4) // START 2 + END 2
    expect(svg).toContain('stroke-dasharray') // 빈 열
    expect(svg).toContain('clip_0_0')
  })

  it('숫자는 7-세그먼트 선으로 그린다(폰트 불요)', () => {
    const one = numberPaths(1, 100, 100, 20)
    expect((one.match(/<line/g) ?? []).length).toBe(2)
    const eight = numberPaths(8, 100, 100, 20)
    expect((eight.match(/<line/g) ?? []).length).toBe(7)
    expect(numberPaths(12, 100, 100, 20)).toContain('<line')
  })

  it('PNG 로 래스터화된다(sharp)', async () => {
    const col = columnFromLayout(LAYOUT, ['char_3', 'char'])
    const { svg } = buildBlockoutSheetSvg([col], { aspect: 16 / 9, cellW: 200 })
    const png = await renderBlockoutPng(svg)
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(png.length).toBeGreaterThan(1000)
  })

  it('프롬프트 절은 열 수와 START/END 규약을 말한다', () => {
    expect(buildBlockoutClause(4)).toContain('4 columns')
    expect(buildBlockoutClause(1)).toContain('a single column')
    expect(buildBlockoutClause(3)).toContain('TOP panel of each column is that shot\'s START')
    expect(buildBlockoutClause(3)).toContain('Never draw the grid')
  })
})
