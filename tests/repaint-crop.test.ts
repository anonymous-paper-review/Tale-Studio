import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { cropRoughGridFrames } from '@/lib/writer/rough-grid-crop'
import { sheetSpecOf } from '@/lib/writer/rough-storyboard-grid'

// #repaint-crop (2026-08-25, 오너 ③C) — 실사 리페인트 시트의 크롭 계약.
//
// 배경 실측(9d562ada 14샷 전수 감사): 연필 휴리스틱(잉크 래치·실측 하단·X_BLEED)이 사진
//   패널에서 오판하고, 모델이 다시 그린 격자선이 스펙 좌표에서 수 px 어긋나 14/14 프레임에
//   템플릿 띠·보더 라인·코너 브래킷이 침입했다.
// 계약: repaint 표면은 ① 스펙 셀 고정 + 축 비례 인셋 크롭 — 보더가 소폭(±6px) 드리프트해도
//   프레임 안에 보더·거터(종이) 픽셀이 없다 ② 세 프레임 모두 같은 크기(셀 표준) ③ 연필
//   경로는 이 옵션과 무관하게 종전 그대로다(기본값 'pencil').

const FMT = 'horizontal_16:9'
const PAPER = { r: 250, g: 248, b: 242 }
const BORDER = { r: 91, g: 90, b: 89 }
// 셀별 고유 채움색 — 크롭이 이웃 셀·거터를 물면 픽셀 검사에서 즉시 걸린다.
const CELL_FILL = [
  ['#c03030', '#30c030', '#3030c0'],
  ['#c0c030', '#30c0c0', '#c030c0'],
  ['#804020', '#208040', '#402080'],
  ['#e08080', '#80e080', '#8080e0'],
]

/** 스펙 시트 모사: 종이 바탕 + 셀 고유색 채움 + 드리프트(shift px)된 2px 보더 라인. */
async function synthSheet(shiftPx: number): Promise<Buffer> {
  const spec = sheetSpecOf('grid4', FMT)!
  const { width, height } = spec.canvas
  const rects: string[] = []
  for (let c = 0; c < spec.colBoxes.length; c++) {
    for (let r = 0; r < spec.rowBoxes.length; r++) {
      const [x0, x1] = spec.colBoxes[c]
      const [y0, y1] = spec.rowBoxes[r]
      rects.push(
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${CELL_FILL[c][r]}"/>`,
        // 보더를 스펙 자리에서 shiftPx 만큼 밀어 그린다 — 리페인트 드리프트 모사.
        `<rect x="${x0 + shiftPx}" y="${y0 + shiftPx}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="rgb(${BORDER.r},${BORDER.g},${BORDER.b})" stroke-width="2"/>`,
      )
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="rgb(${PAPER.r},${PAPER.g},${PAPER.b})"/>${rects.join('')}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** 프레임의 픽셀이 전부 기대 색(±tol)인지 — 아니면 침입 픽셀 좌표를 보고한다. */
async function assertSolid(frame: Buffer, hex: string): Promise<void> {
  const want = {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
  const { data, info } = await sharp(frame).raw().toBuffer({ resolveWithObject: true })
  let bad = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (
      Math.abs(data[i] - want.r) > 12 ||
      Math.abs(data[i + 1] - want.g) > 12 ||
      Math.abs(data[i + 2] - want.b) > 12
    )
      bad++
  }
  expect(bad, `${hex} 프레임의 침입 픽셀 수 (${info.width}x${info.height})`).toBe(0)
}

describe('repaint 표면 크롭 — 스펙 셀 고정 + 인셋 (#repaint-crop)', () => {
  it('보더가 스펙 자리 그대로여도, +6px 드리프트해도 프레임에 보더·종이 픽셀이 없다', async () => {
    for (const shift of [0, 6]) {
      const sheet = await synthSheet(shift)
      const perShot = await cropRoughGridFrames(sheet, 'grid4', 4, FMT, 'repaint')
      expect(perShot).toHaveLength(4)
      for (let s = 0; s < 4; s++) {
        await assertSolid(perShot[s].start, CELL_FILL[s][0])
        await assertSolid(perShot[s].direction, CELL_FILL[s][1])
        await assertSolid(perShot[s].end, CELL_FILL[s][2])
      }
    }
  })

  it('세 프레임 크기가 전부 동일하다 (셀 표준 — 영상 레퍼런스 전제)', async () => {
    const sheet = await synthSheet(0)
    const [{ start, direction, end }] = await cropRoughGridFrames(sheet, 'grid4', 1, FMT, 'repaint')
    const dims = await Promise.all(
      [start, direction, end].map(async (b) => {
        const m = await sharp(b).metadata()
        return `${m.width}x${m.height}`
      }),
    )
    expect(dims[1]).toBe(dims[0])
    expect(dims[2]).toBe(dims[0])
  })
})
