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

// #sheet-formats (2026-08-17) — 포맷별 템플릿은 스펙(SHEET_SPECS)에서 그려서 생성한다.
//   이 파일이 그 생성기(env 게이트)이자 드리프트 가드다: 커밋된 PNG 치수가 스펙과 어긋나면
//   좌표·그림의 진실이 갈라진 것 — 레거시 템플릿의 "교체 시 재실측 ⚠️" 함정을 CI 검증으로 대체.
//
//   재생성: GENERATE_ROUGH_TEMPLATES=1 pnpm vitest run tests/rough-template-assets.test.ts

const PUB = path.join(process.cwd(), 'public')
const NEW_FORMATS: Array<Exclude<ProjectFormat, 'horizontal_16:9'>> = [
  'vertical_9:16',
  'square_1:1',
  'cinema_2.39:1',
]
const VARIANTS: RoughGridVariant[] = ['grid4', 'strip1']

const PAPER = '#FAF8F2' // 레거시 템플릿 배경 실측 rgb(250,248,242)
const BORDER = '#5B5A59' // 레거시 격자선 실측 rgb(91,90,89)

function templateSvg(spec: SheetSpec): string {
  const { width, height } = spec.canvas
  const cells: string[] = []
  for (const [x0, x1] of spec.colBoxes) {
    for (const [y0, y1] of spec.rowBoxes) {
      cells.push(
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${PAPER}" stroke="${BORDER}" stroke-width="2"/>`,
      )
    }
  }
  // 외곽 시트 보더 — 레거시와 동일한 "종이 시트" 시그널 (모델이 시트 계약으로 읽는 장치)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="${PAPER}"/>
<rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="${BORDER}" stroke-width="2"/>
${cells.join('\n')}
</svg>`
}

describe('rough template assets — 스펙↔PNG 정합', () => {
  it.runIf(process.env.GENERATE_ROUGH_TEMPLATES === '1')(
    '생성기: 스펙에서 포맷 템플릿 6장을 그려 public/ 에 쓴다',
    async () => {
      for (const format of NEW_FORMATS) {
        for (const variant of VARIANTS) {
          const spec = sheetSpecOf(variant, format)
          if (!spec) throw new Error(`spec missing: ${format}:${variant}`)
          const png = await sharp(Buffer.from(templateSvg(spec))).png().toBuffer()
          await writeFile(path.join(PUB, spec.templatePath.replace(/^\//, '')), png)
        }
      }
    },
  )

  it('신규 포맷 템플릿 6장: 존재 + 치수 = 스펙 캔버스', async () => {
    for (const format of NEW_FORMATS) {
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

  it('레거시 템플릿 2장: 실측 좌표의 기준 치수 그대로 (1672×941 / 488×941)', async () => {
    const grid = await sharp(path.join(PUB, 'rough-storyboard-grid.png')).metadata()
    expect({ w: grid.width, h: grid.height }).toEqual({ w: 1672, h: 941 })
    const strip = await sharp(path.join(PUB, 'rough-storyboard-strip.png')).metadata()
    expect({ w: strip.width, h: strip.height }).toEqual({ w: 488, h: 941 })
  })

  it('셀 비례 좌표: 0~1 범위 + 인접 셀 사이에 거터 존재 (크롭 불변식 "거터=빈 종이")', () => {
    for (const format of [...NEW_FORMATS, null]) {
      for (const variant of VARIANTS) {
        const g = sheetGeometry(variant, format)
        for (const axis of [g.cols, g.rows]) {
          for (let i = 0; i < axis.length; i++) {
            expect(axis[i][0]).toBeGreaterThan(0)
            expect(axis[i][1]).toBeLessThan(1)
            expect(axis[i][1]).toBeGreaterThan(axis[i][0])
            if (i > 0) expect(axis[i][0]).toBeGreaterThan(axis[i - 1][1]) // 거터 간격
          }
        }
      }
    }
  })

  it('세로 스트립만 frameAxis cols — 나머지는 rows', () => {
    expect(sheetGeometry('strip1', 'vertical_9:16').frameAxis).toBe('cols')
    expect(sheetGeometry('strip1', 'vertical_9:16').cols.length).toBe(3)
    expect(sheetGeometry('strip1', 'vertical_9:16').rows.length).toBe(1)
    expect(sheetGeometry('strip1', 'square_1:1').frameAxis).toBe('rows')
    expect(sheetGeometry('strip1', null).frameAxis).toBe('rows')
    expect(sheetGeometry('grid4', 'vertical_9:16').frameAxis).toBe('rows')
  })

  it('셀 종횡비가 포맷을 따른다 (±3%)', () => {
    const cellAr = (variant: RoughGridVariant, format: ProjectFormat) => {
      const spec = sheetSpecOf(variant, format)!
      const [x0, x1] = spec.colBoxes[0]
      const [y0, y1] = spec.rowBoxes[0]
      return (x1 - x0) / (y1 - y0)
    }
    expect(cellAr('grid4', 'vertical_9:16')).toBeCloseTo(9 / 16, 1)
    expect(cellAr('strip1', 'vertical_9:16')).toBeCloseTo(9 / 16, 1)
    expect(cellAr('grid4', 'square_1:1')).toBeCloseTo(1, 1)
    expect(cellAr('strip1', 'square_1:1')).toBeCloseTo(1, 1)
    expect(Math.abs(cellAr('grid4', 'cinema_2.39:1') - 2.39) / 2.39).toBeLessThan(0.03)
    expect(Math.abs(cellAr('strip1', 'cinema_2.39:1') - 2.39) / 2.39).toBeLessThan(0.03)
  })
})
