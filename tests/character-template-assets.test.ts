import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  CHARACTER_SHEET_SPEC,
  PALETTE_SWATCHES,
  portraitRegionOfSpec,
  turnaroundSlots,
  type SheetBox,
} from '@/lib/artist/sheet-template'
import { TURNAROUND_PORTRAIT_REGION } from '@/lib/artist/portrait'

// 캐릭터 시트 템플릿 v3 (#f8 2026-08-27) — 스펙(sheet-template.ts)에서 그리는 생성기(env 게이트)
//   + 커밋된 PNG 가 스펙과 어긋나면 잡는 드리프트 가드. rough-template-assets 와 같은 관행.
//
//   재생성: GENERATE_CHARACTER_TEMPLATE=1 pnpm vitest run tests/character-template-assets.test.ts

const PUB = path.join(process.cwd(), 'public')
const TEMPLATE_PATH = path.join(PUB, 'character-template.png')
const PAPER = '#FAF8F2'
const BORDER = '#5B5A59'
const LABEL = '#6A6965'

/** 러프 템플릿과 같은 종이 질감 — 레거시 시트 패치를 미러 타일링(이음선 은폐). */
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

function boxSvg(b: SheetBox): string {
  const parts = [
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="none" stroke="${BORDER}" stroke-width="2"/>`,
  ]
  if (b.label) {
    parts.push(
      `<text x="${b.x + 12}" y="${b.y + 20}" font-family="Arial, sans-serif" font-size="12" font-weight="600" letter-spacing="2.5" fill="${LABEL}">${b.label}</text>`,
    )
  }
  return parts.join('\n')
}

async function renderTemplate(): Promise<Buffer> {
  const { canvas, portrait, expressions, palette, turnaround, poses, details } =
    CHARACTER_SHEET_SPEC
  const svgParts: string[] = []
  for (const b of [portrait, ...expressions, palette, turnaround, ...poses, ...details]) {
    svgParts.push(boxSvg(b))
  }
  // 팔레트 스와치 5칸 — 스트립 내부 균등 배치.
  {
    const inner = 12
    const availW = palette.w - inner * 2
    const gap = 10
    const sw = (availW - gap * (PALETTE_SWATCHES - 1)) / PALETTE_SWATCHES
    const sh = palette.h - 30
    for (let i = 0; i < PALETTE_SWATCHES; i++) {
      svgParts.push(
        `<rect x="${palette.x + inner + i * (sw + gap)}" y="${palette.y + 24}" width="${sw}" height="${sh}" rx="6" fill="none" stroke="${BORDER}" stroke-width="1.5"/>`,
      )
    }
  }
  // 턴어라운드 뷰 슬롯 — 구분선 + 하단 뷰 라벨(내용 앵커).
  for (const [i, slot] of turnaroundSlots().entries()) {
    if (i > 0) {
      svgParts.push(
        `<line x1="${slot.x - 8}" y1="${slot.y + 8}" x2="${slot.x - 8}" y2="${slot.y + slot.h - 8}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3 5"/>`,
      )
    }
    svgParts.push(
      `<text x="${slot.x + slot.w / 2}" y="${turnaround.y + turnaround.h - 14}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="600" letter-spacing="2" fill="${LABEL}">${slot.label}</text>`,
    )
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">${svgParts.join('\n')}</svg>`
  const base = await paperBase(canvas.width, canvas.height)
  return sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer()
}

describe('character template v3 — 스펙↔PNG 정합 (#f8)', () => {
  it.runIf(process.env.GENERATE_CHARACTER_TEMPLATE === '1')(
    '생성기: 스펙에서 v3 템플릿을 그려 public/ 에 쓴다',
    async () => {
      await writeFile(TEMPLATE_PATH, await renderTemplate())
    },
    60_000,
  )

  it('커밋된 템플릿 존재 + 치수 = 스펙 캔버스', async () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true)
    const meta = await sharp(await readFile(TEMPLATE_PATH)).metadata()
    expect({ w: meta.width, h: meta.height }).toEqual({
      w: CHARACTER_SHEET_SPEC.canvas.width,
      h: CHARACTER_SHEET_SPEC.canvas.height,
    })
  })

  it('타일이 캔버스 안에 있고 서로 겹치지 않는다 (정형 타일 불변식)', () => {
    const { canvas, portrait, expressions, palette, turnaround, poses, details } =
      CHARACTER_SHEET_SPEC
    const boxes: SheetBox[] = [portrait, ...expressions, palette, turnaround, ...poses, ...details]
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w).toBeLessThanOrEqual(canvas.width)
      expect(b.y + b.h).toBeLessThanOrEqual(canvas.height)
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap, `${a.label} ↔ ${b.label} 겹침`).toBe(false)
      }
    }
  })

  it('포트레이트 크롭 좌표가 스펙 파생값과 일치한다 (v3 — v2 시트에 쓰지 말 것)', () => {
    expect(TURNAROUND_PORTRAIT_REGION).toEqual(portraitRegionOfSpec())
  })
})
