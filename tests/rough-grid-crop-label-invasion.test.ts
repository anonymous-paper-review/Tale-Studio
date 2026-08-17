import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { sheetSpecOf } from '@/lib/writer/rough-storyboard-grid'
import { cropRoughGridFrames } from '@/lib/writer/rough-grid-crop'

// #label-invasion (2026-08-17, 실측 a219b9f3) — DIRECTION 라벨 텍스트가 행 거터를 4~11px
//   밝은 조각으로 파편화하면: v5 는 셀이 조각나 균일성 기각, v4 는 텍스트 줄 사이 틈을
//   거터로 오인해 행 경계가 밴드 안에 앉았다(프레임 505/450/505 제각각 + 텍스트 침입).
//   수리 계약: 진짜 거터 두께(≥12px 연속 밝음)만 분할 자격 — 얇은 틈은 기각하고 스펙
//   좌표로 폴백한다. 픽스처는 실측 시트의 파편 구조를 재현한 합성 시트.

async function syntheticSheet(textBars: boolean): Promise<Buffer> {
  const spec = sheetSpecOf('grid4', 'vertical_9:16')!
  const { width, height } = spec.canvas
  const cells: string[] = []
  for (const [x0, x1] of spec.colBoxes) {
    for (const [y0, y1] of spec.rowBoxes) {
      cells.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#777"/>`)
    }
  }
  // 실측 파편 재현: 행2/행3 사이 거터(20px)와 행3 상단을 가로지르는 텍스트 줄들 —
  //   6~9px 어두운 줄 + 4~8px 밝은 틈이 번갈아 나타나 거터가 얇은 조각으로 쪼개진다.
  const gutterTop = spec.rowBoxes[1][1]
  const bars = textBars
    ? [0, 1, 2, 3]
        .map((i) => {
          const y = gutterTop - 4 + i * 14
          return `<rect x="${spec.colBoxes[0][0]}" y="${y}" width="${spec.colBoxes[3][1] - spec.colBoxes[0][0]}" height="7" fill="#333"/>`
        })
        .join('')
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#FAF8F2"/>${cells.join('')}${bars}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

describe('cropRoughGridFrames — 라벨 파편 거터 내성', () => {
  it('깨끗한 시트: 스펙 셀 그대로 (기준선)', async () => {
    const sheet = await syntheticSheet(false)
    const frames = await cropRoughGridFrames(sheet, 'grid4', 4, 'vertical_9:16')
    expect(frames).toHaveLength(4)
    const spec = sheetSpecOf('grid4', 'vertical_9:16')!
    const want = spec.rowBoxes[0][1] - spec.rowBoxes[0][0]
    for (const f of frames) {
      const m = await sharp(f.start).metadata()
      expect(Math.abs((m.height ?? 0) - want)).toBeLessThanOrEqual(10)
    }
  })

  it('행2 하단 라벨 밴드는 잘라내지 않는다 — v3 내용 인지 트림 (실측 sh_03: "KEY:" 첫 줄만 남던 절단)', async () => {
    // 실측 구조 재현: 스펙 거터 자리에 라벨 밴드(어두운 텍스트 줄들) + 그 아래 진짜 거터 +
    //   행3 은 40px 하향. 경계 검출은 진짜 거터를 찾아 행2가 밴드를 포함하게 되고(486px),
    //   과대 트림은 초과분에 내용이 있으므로 보존해야 한다.
    const spec = sheetSpecOf('grid4', 'vertical_9:16')!
    const { width, height } = spec.canvas
    const cells: string[] = []
    for (const [x0, x1] of spec.colBoxes) {
      for (let r = 0; r < spec.rowBoxes.length; r++) {
        const [y0, y1] = spec.rowBoxes[r]
        const shift = r === 2 ? 40 : 0
        const shrink = r === 2 ? 40 : 0
        cells.push(
          `<rect x="${x0}" y="${y0 + shift}" width="${x1 - x0}" height="${y1 - y0 - shrink}" fill="#777"/>`,
        )
      }
    }
    const bandTop = spec.rowBoxes[1][1] + 2
    const bars = [0, 1, 2]
      .map(
        (i) =>
          `<rect x="${spec.colBoxes[0][0]}" y="${bandTop + i * 13}" width="${spec.colBoxes[3][1] - spec.colBoxes[0][0]}" height="8" fill="#333"/>`,
      )
      .join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#FAF8F2"/>${cells.join('')}${bars}</svg>`
    const sheet = await sharp(Buffer.from(svg)).png().toBuffer()
    const frames = await cropRoughGridFrames(sheet, 'grid4', 4, 'vertical_9:16')
    const want = spec.rowBoxes[0][1] - spec.rowBoxes[0][0]
    const md = await sharp(frames[0].direction).metadata()
    expect(md.height ?? 0, `direction ${md.height} — 라벨 밴드 보존`).toBeGreaterThanOrEqual(want + 20)
    const ms = await sharp(frames[0].start).metadata()
    expect(Math.abs((ms.height ?? 0) - want), `start ${ms.height}`).toBeLessThanOrEqual(14)
  })

  it('텍스트 조각 거터: 얇은 틈을 거터로 삼지 않고 세 행이 균일하게 잘린다', async () => {
    const sheet = await syntheticSheet(true)
    const frames = await cropRoughGridFrames(sheet, 'grid4', 4, 'vertical_9:16')
    expect(frames).toHaveLength(4)
    const spec = sheetSpecOf('grid4', 'vertical_9:16')!
    const want = spec.rowBoxes[0][1] - spec.rowBoxes[0][0]
    for (const f of frames) {
      for (const key of ['start', 'direction', 'end'] as const) {
        const m = await sharp(f[key]).metadata()
        // 수리 전 실측 증상: 행마다 505/450/505 로 제각각 + 텍스트 밴드 침입(want=453 대비 +52).
        expect(Math.abs((m.height ?? 0) - want), `${key} height ${m.height}`).toBeLessThanOrEqual(14)
      }
    }
  })
})
