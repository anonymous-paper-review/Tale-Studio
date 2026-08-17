import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { sheetSpecOf, sheetGeometry } from '@/lib/writer/rough-storyboard-grid'
import { cropRoughGridFrames } from '@/lib/writer/rough-grid-crop'

// #label-invasion → #fixed-crop (2026-08-17, 오너 결정) — 계약의 진화:
//   적응형(거터 스캔) 크롭은 모델의 그리기 드리프트·라벨 밴드를 쫓다가 프레임 크기가
//   샷·프레임마다 달라졌다(실측 451/469/447). UI 순환 상자(첫 프레임 비율 고정 + cover)와
//   영상 레퍼런스는 균일 크기를 전제하므로, 포맷 스펙 시트는 **스펙 고정 좌표**로 자른다:
//   시트가 어떻게 그려졌든 프레임 = 셀 내부 크기로 상시 균일. 드리프트는 가장자리 보더
//   실로 남는다(코스메틱). 레거시(null 포맷)만 종전 적응형 유지.

async function syntheticSheet(withTextBands: boolean): Promise<Buffer> {
  const spec = sheetSpecOf('grid4', 'vertical_9:16')!
  const { width, height } = spec.canvas
  const cells: string[] = []
  for (const [x0, x1] of spec.colBoxes) {
    for (let r = 0; r < spec.rowBoxes.length; r++) {
      const [y0, y1] = spec.rowBoxes[r]
      // 드리프트 모사: 행마다 ±6px 어긋나게 그린다 (모델이 템플릿을 정확히 못 지키는 상황)
      const shift = [-6, 4, 6][r]
      cells.push(
        `<rect x="${x0}" y="${y0 + shift}" width="${x1 - x0}" height="${y1 - y0}" fill="#777"/>`,
      )
    }
  }
  // 라벨 밴드 모사: 행2 아래 거터를 텍스트 줄들이 침범
  const bandTop = spec.rowBoxes[1][1] + 2
  const bars = withTextBands
    ? [0, 1, 2]
        .map(
          (i) =>
            `<rect x="${spec.colBoxes[0][0]}" y="${bandTop + i * 13}" width="${spec.colBoxes[3][1] - spec.colBoxes[0][0]}" height="8" fill="#333"/>`,
        )
        .join('')
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#FAF8F2"/>${cells.join('')}${bars}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

describe('cropRoughGridFrames — 포맷 시트 고정 좌표 (#fixed-crop)', () => {
  it('드리프트·라벨 밴드가 있어도 프레임은 스펙 셀 내부 크기로 상시 균일', async () => {
    const g = sheetGeometry('grid4', 'vertical_9:16')
    const spec = sheetSpecOf('grid4', 'vertical_9:16')!
    const wantW = Math.round(g.cols[0][1] * spec.canvas.width) - Math.round(g.cols[0][0] * spec.canvas.width)
    const wantH = Math.round(g.rows[0][1] * spec.canvas.height) - Math.round(g.rows[0][0] * spec.canvas.height)
    for (const bands of [false, true]) {
      const frames = await cropRoughGridFrames(await syntheticSheet(bands), 'grid4', 4, 'vertical_9:16')
      expect(frames).toHaveLength(4)
      for (const f of frames) {
        for (const key of ['start', 'direction', 'end'] as const) {
          const m = await sharp(f[key]).metadata()
          expect(m.width, `bands=${bands} ${key} w`).toBe(wantW)
          expect(m.height, `bands=${bands} ${key} h`).toBe(wantH)
        }
      }
    }
  })

  it('캔버스가 요청과 다른 크기로 와도(리샘플) 비례 좌표가 절대 좌표를 유지한다', async () => {
    // fal 실측상 요청 치수 그대로 반환되지만, 방어적으로 0.5배 리샘플에도 비례가 성립해야 한다.
    const sheet = await syntheticSheet(false)
    const half = await sharp(sheet).resize({ width: 576 }).png().toBuffer()
    const frames = await cropRoughGridFrames(half, 'grid4', 4, 'vertical_9:16')
    const m0 = await sharp(frames[0].start).metadata()
    for (const f of frames) {
      for (const key of ['start', 'direction', 'end'] as const) {
        const m = await sharp(f[key]).metadata()
        expect(m.width).toBe(m0.width)
        expect(m.height).toBe(m0.height)
      }
    }
  })

  it('레거시(null 포맷)는 종전 적응형 경로 유지 — 레거시 비례 시트 파스', async () => {
    // 레거시 템플릿 비례(1672×941)로 깨끗한 시트를 합성 — v4/v5 경로 스모크.
    const g = sheetGeometry('grid4', null)
    const W = 1672
    const H = 941
    const cells: string[] = []
    for (const [c0, c1] of g.cols) {
      for (const [r0, r1] of g.rows) {
        cells.push(
          `<rect x="${Math.round(c0 * W)}" y="${Math.round(r0 * H)}" width="${Math.round((c1 - c0) * W)}" height="${Math.round((r1 - r0) * H)}" fill="#777"/>`,
        )
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#FAF8F2"/>${cells.join('')}</svg>`
    const sheet = await sharp(Buffer.from(svg)).png().toBuffer()
    const frames = await cropRoughGridFrames(sheet, 'grid4', 4, null)
    expect(frames).toHaveLength(4)
    const m = await sharp(frames[0].start).metadata()
    expect((m.width ?? 0) > 300 && (m.height ?? 0) > 200).toBe(true)
  })
})
