// 소품 양식 그림(흰 바탕 16:9, 큰 칸 MAIN + FRONT · SIDE · BACK · TOP · DETAIL)이 정해진 칸과 크기를 지켜 안정적으로 쓰인다 (m1126 A2, 오너 2026-11-26)
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { PROP_SHEET_FILE, PROP_SHEET_SPEC, propSheetBoxes } from '@/lib/artist/prop-sheet-template'
import type { SheetBox } from '@/lib/artist/sheet-template'

// 인물 양식(character-template-assets)과 같은 그리기 — 흰 바탕 · 둥근 칸 테두리 · 칸 왼쪽 위 작은 이름.
//   재생성: GENERATE_PROP_TEMPLATE=1 pnpm exec vitest run tests/artist/prop-template-assets.test.ts
const TEMPLATE_PATH = path.join(process.cwd(), 'public', PROP_SHEET_FILE)
const BACKGROUND = '#FFFFFF'
const BORDER = '#5B5A59'
const LABEL = '#6A6965'

function boxSvg(b: SheetBox): string {
  return [
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="none" stroke="${BORDER}" stroke-width="2"/>`,
    `<text x="${b.x + 12}" y="${b.y + 20}" font-family="Arial, sans-serif" font-size="12" font-weight="600" letter-spacing="2.5" fill="${LABEL}">${b.label}</text>`,
  ].join('\n')
}

async function renderTemplate(): Promise<Buffer> {
  const { width, height } = PROP_SHEET_SPEC.canvas
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${propSheetBoxes().map(boxSvg).join('\n')}</svg>`
  const base = await sharp({ create: { width, height, channels: 3, background: BACKGROUND } }).png().toBuffer()
  return sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer()
}

describe('소품 양식 그림', () => {
  it.runIf(process.env.GENERATE_PROP_TEMPLATE === '1')(
    '필요한 설정을 켜면 소품 양식을 만들어 보관한다',
    async () => {
      await writeFile(TEMPLATE_PATH, await renderTemplate())
    },
    60_000,
  )

  // 왜: 인물 · 배경처럼 16:9 한 장으로 나와야 한다(A2) — 양식 그림이 16:9 가 아니면 편집 모델이 그 비율을 따라 다른 모양으로 그린다.
  it('소품 양식 그림이 있고 정해진 크기(16:9)와 일치한다', async () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true)
    const meta = await sharp(await readFile(TEMPLATE_PATH)).metadata()
    expect({ w: meta.width, h: meta.height }).toEqual({ w: PROP_SHEET_SPEC.canvas.width, h: PROP_SHEET_SPEC.canvas.height })
    expect(PROP_SHEET_SPEC.canvas.width / PROP_SHEET_SPEC.canvas.height).toBeCloseTo(16 / 9, 2)
  })

  // 왜: 인물 양식과 같은 까닭 — 종이 같은 바탕색은 그림을 그림체 쪽으로 끈다(2026-10-08 오너 "흰 바탕"). 칸 안도 흰색이라야 물건만 또렷하다.
  it('소품 양식 그림의 바탕은 흰색이다', async () => {
    const { data, info } = await sharp(await readFile(TEMPLATE_PATH)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const at = (x: number, y: number) => {
      const i = (Math.round(y) * info.width + Math.round(x)) * info.channels
      return [data[i], data[i + 1], data[i + 2]]
    }
    const samples: Array<[number, number]> = [[4, 4], [info.width - 5, info.height - 5], ...propSheetBoxes().map((b): [number, number] => [b.x + b.w / 2, b.y + b.h / 2])]
    for (const [x, y] of samples) expect(at(x, y), `${x},${y}`).toEqual([255, 255, 255])
  })

  // 왜: 칸이 겹치거나 그림 밖으로 나가면 모델이 칸 경계를 지키지 못한다 — 좌표를 바꿀 때 여기서 막는다.
  it('소품 양식의 모든 칸이 전체 그림 안에 들어오고 서로 겹치지 않는다', () => {
    const { width, height } = PROP_SHEET_SPEC.canvas
    const boxes = propSheetBoxes()
    expect(boxes.map((b) => b.label)).toEqual(['MAIN', 'FRONT', 'SIDE', 'BACK', 'TOP', 'DETAIL'])
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w).toBeLessThanOrEqual(width)
      expect(b.y + b.h).toBeLessThanOrEqual(height)
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]]
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.label} ↔ ${b.label} 겹침`).toBe(false)
      }
    }
  })
})
