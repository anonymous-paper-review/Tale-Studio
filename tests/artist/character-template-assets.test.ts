// 캐릭터 양식 그림이 정해진 칸과 크기를 지켜 안정적으로 쓰인다
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
// 바탕은 흰색(2026-10-08 오너) — 그림 종이 같은 크림색 질감이 인물을 그림체 쪽으로 끄는 것 같다.
//   종전에는 러프 템플릿과 같은 종이 질감(레거시 시트 패치 미러 타일링, #FAF8F2)을 깔았다.
const BACKGROUND = '#FFFFFF'
const BORDER = '#5B5A59'
const LABEL = '#6A6965'

async function whiteBase(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: BACKGROUND } }).png().toBuffer()
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
  const base = await whiteBase(canvas.width, canvas.height)
  return sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer()
}

describe('캐릭터 양식 v3 그림이 정해진 모습과 맞는다 (#f8)', () => {
  it.runIf(process.env.GENERATE_CHARACTER_TEMPLATE === '1')(
    '필요한 설정을 켜면 v3 캐릭터 양식을 만들어 보관한다',
    async () => {
      await writeFile(TEMPLATE_PATH, await renderTemplate())
    },
    60_000,
  )

  it('캐릭터 양식 그림의 바탕은 흰색이다', async () => {
    // 왜: 그림 종이 같은 크림색 바탕이 인물을 그림체 쪽으로 끄는 것 같다(2026-10-08 오너).
    const { data, info } = await sharp(await readFile(TEMPLATE_PATH)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const at = (x: number, y: number) => {
      const i = (Math.round(y) * info.width + Math.round(x)) * info.channels
      return [data[i], data[i + 1], data[i + 2]]
    }
    const { portrait, turnaround, poses } = CHARACTER_SHEET_SPEC
    const samples: Array<[number, number]> = [
      [4, 4],
      [info.width - 5, info.height - 5],
      [portrait.x + portrait.w / 2, portrait.y + portrait.h / 2],
      [turnaround.x + 60, turnaround.y + 200],
      [poses[0].x + poses[0].w / 2, poses[0].y + poses[0].h / 2],
    ]
    for (const [x, y] of samples) expect(at(x, y), `${x},${y}`).toEqual([255, 255, 255])
  })

  it('캐릭터 양식 그림이 있고 정해진 크기와 일치한다', async () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true)
    const meta = await sharp(await readFile(TEMPLATE_PATH)).metadata()
    expect({ w: meta.width, h: meta.height }).toEqual({
      w: CHARACTER_SHEET_SPEC.canvas.width,
      h: CHARACTER_SHEET_SPEC.canvas.height,
    })
  })

  it('모든 칸이 전체 그림 안에 들어오고 서로 겹치지 않는다', () => {
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

  it('대표 얼굴 영역이 정해진 위치와 맞는다 (v3, v2 양식에는 쓰지 말 것)', () => {
    expect(TURNAROUND_PORTRAIT_REGION).toEqual(portraitRegionOfSpec())
  })
})
