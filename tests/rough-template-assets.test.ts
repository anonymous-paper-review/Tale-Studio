import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  sheetSpecOf,
  sheetGeometry,
  type SheetSpec,
  type RoughGridVariant,
} from '@/lib/writer/rough-storyboard-grid'
import type { ProjectFormat } from '@/types/project'

// #sheet-formats (2026-08-17, 2차: 오너 육안 피드백) — 포맷별 템플릿은 스펙(SHEET_SPECS)에서
//   **레거시 시트의 실제 종이 질감을 추출**해 그려서 생성한다(수제 룩 + 좌표 정확성).
//   이 파일이 그 생성기(env 게이트)이자 드리프트 가드다: 커밋된 PNG 치수가 스펙과 어긋나면
//   좌표·그림의 진실이 갈라진 것 — 레거시의 "교체 시 재실측 ⚠️" 함정을 CI 검증으로 대체.
//
//   재생성: GENERATE_ROUGH_TEMPLATES=1 pnpm vitest run tests/rough-template-assets.test.ts

const PUB = path.join(process.cwd(), 'public')
const ALL_FORMATS: ProjectFormat[] = [
  'horizontal_16:9',
  'vertical_9:16',
  'square_1:1',
  'cinema_2.39:1',
]
const VARIANTS: RoughGridVariant[] = ['grid4', 'strip1']
const FORMAT_AR: Record<ProjectFormat, number> = {
  'horizontal_16:9': 16 / 9,
  'vertical_9:16': 9 / 16,
  'square_1:1': 1,
  'cinema_2.39:1': 2.39,
}

const PAPER = '#FAF8F2' // 레거시 템플릿 배경 실측 rgb(250,248,242)
const BORDER = '#5B5A59' // 레거시 격자선 실측 rgb(91,90,89)

/** 레거시 시트 패널 내부의 종이 질감 → 미러 2×2 블록(이음선 은폐) → 캔버스 전면 타일. */
async function paperBase(width: number, height: number): Promise<Buffer> {
  const legacy = path.join(PUB, 'rough-storyboard-grid.png')
  const patch = await sharp(legacy).extract({ left: 68, top: 80, width: 352, height: 224 }).png().toBuffer()
  const [flipH, flipV, flipHV] = await Promise.all([
    sharp(patch).flop().png().toBuffer(),
    sharp(patch).flip().png().toBuffer(),
    sharp(patch).flop().flip().png().toBuffer(),
  ])
  const block = await sharp({ create: { width: 704, height: 448, channels: 3, background: PAPER } })
    .composite([
      { input: patch, left: 0, top: 0 },
      { input: flipH, left: 352, top: 0 },
      { input: flipV, left: 0, top: 224 },
      { input: flipHV, left: 352, top: 224 },
    ])
    .png()
    .toBuffer()
  const tiles: sharp.OverlayOptions[] = []
  for (let y = 0; y < height + 448; y += 448)
    for (let x = 0; x < width + 704; x += 704) tiles.push({ input: block, left: x, top: y })
  const full = await sharp({
    create: { width: width + 704, height: height + 448, channels: 3, background: PAPER },
  })
    .composite(tiles)
    .png()
    .toBuffer()
  return sharp(full).extract({ left: 0, top: 0, width, height }).png().toBuffer()
}

async function renderTemplate(spec: SheetSpec): Promise<Buffer> {
  const { width, height } = spec.canvas
  const base = await paperBase(width, height)
  const cells: string[] = []
  for (const [x0, x1] of spec.colBoxes) {
    for (const [y0, y1] of spec.rowBoxes) {
      cells.push(
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${BORDER}" stroke-width="2"/>`,
      )
    }
  }
  const inset = Math.min(14, Math.round(Math.min(width, height) * 0.016))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" fill="none" stroke="${BORDER}" stroke-width="2"/>
${cells.join('\n')}
</svg>`
  return sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer()
}

describe('rough template assets — 스펙↔PNG 정합', () => {
  it.runIf(process.env.GENERATE_ROUGH_TEMPLATES === '1')(
    '생성기: 스펙에서 포맷 템플릿 8장을 그려 public/ 에 쓴다 (레거시 질감 승계)',
    async () => {
      for (const format of ALL_FORMATS) {
        for (const variant of VARIANTS) {
          const spec = sheetSpecOf(variant, format)
          if (!spec) throw new Error(`spec missing: ${format}:${variant}`)
          const png = await renderTemplate(spec)
          await writeFile(path.join(PUB, spec.templatePath.replace(/^\//, '')), png)
        }
      }
    },
    120_000,
  )

  it('포맷 템플릿 8장: 존재 + 치수 = 스펙 캔버스', async () => {
    for (const format of ALL_FORMATS) {
      for (const variant of VARIANTS) {
        const spec = sheetSpecOf(variant, format)
        expect(spec, `${format}:${variant} spec`).toBeTruthy()
        const file = path.join(PUB, spec!.templatePath.replace(/^\//, ''))
        expect(existsSync(file), `${spec!.templatePath} 존재`).toBe(true)
        const meta = await sharp(await readFile(file)).metadata()
        expect({ w: meta.width, h: meta.height }, spec!.templatePath).toEqual({
          w: spec!.canvas.width,
          h: spec!.canvas.height,
        })
      }
    }
  })

  it('스키마 준수: 캔버스 16배수 · 최대 변 3840 · AR ≤3:1 · 총 0.66~8.29MP', () => {
    for (const format of ALL_FORMATS) {
      for (const variant of VARIANTS) {
        const { width: w, height: h } = sheetSpecOf(variant, format)!.canvas
        expect(w % 16, `${format}:${variant} w`).toBe(0)
        expect(h % 16, `${format}:${variant} h`).toBe(0)
        expect(Math.max(w, h)).toBeLessThanOrEqual(3840)
        expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(3)
        expect(w * h).toBeGreaterThanOrEqual(655_360)
        expect(w * h).toBeLessThanOrEqual(8_294_400)
      }
    }
  })

  it('레거시 템플릿 2장: 실측 좌표의 기준 치수 그대로 (1672×941 / 488×941 — null 포맷 전용)', async () => {
    const grid = await sharp(path.join(PUB, 'rough-storyboard-grid.png')).metadata()
    expect({ w: grid.width, h: grid.height }).toEqual({ w: 1672, h: 941 })
    const strip = await sharp(path.join(PUB, 'rough-storyboard-strip.png')).metadata()
    expect({ w: strip.width, h: strip.height }).toEqual({ w: 488, h: 941 })
  })

  it('셀 비례 좌표: 0~1 범위 + 인접 셀 사이 거터 (크롭 불변식 "거터=빈 종이")', () => {
    for (const format of [...ALL_FORMATS, null]) {
      for (const variant of VARIANTS) {
        const g = sheetGeometry(variant, format)
        for (const axis of [g.cols, g.rows]) {
          for (let i = 0; i < axis.length; i++) {
            expect(axis[i][0]).toBeGreaterThan(0)
            expect(axis[i][1]).toBeLessThan(1)
            expect(axis[i][1]).toBeGreaterThan(axis[i][0])
            if (i > 0) expect(axis[i][0]).toBeGreaterThan(axis[i - 1][1])
          }
        }
      }
    }
  })

  it('세로 스트립만 frameAxis cols — 나머지는 rows', () => {
    expect(sheetGeometry('strip1', 'vertical_9:16').frameAxis).toBe('cols')
    expect(sheetGeometry('strip1', 'vertical_9:16').cols.length).toBe(3)
    expect(sheetGeometry('strip1', 'vertical_9:16').rows.length).toBe(1)
    expect(sheetGeometry('strip1', 'horizontal_16:9').frameAxis).toBe('rows')
    expect(sheetGeometry('strip1', 'square_1:1').frameAxis).toBe('rows')
    expect(sheetGeometry('strip1', null).frameAxis).toBe('rows')
    expect(sheetGeometry('grid4', 'vertical_9:16').frameAxis).toBe('rows')
  })

  it('셀 종횡비 = 포맷 정확값 (±1% — 레거시 16:9 셀의 -13.2% 오차를 반복하지 않는다)', () => {
    for (const format of ALL_FORMATS) {
      for (const variant of VARIANTS) {
        const spec = sheetSpecOf(variant, format)!
        const [x0, x1] = spec.colBoxes[0]
        const [y0, y1] = spec.rowBoxes[0]
        const ar = (x1 - x0) / (y1 - y0)
        expect(Math.abs(ar - FORMAT_AR[format]) / FORMAT_AR[format], `${format}:${variant}`).toBeLessThan(0.01)
      }
    }
  })
})
