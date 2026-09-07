import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { trimFlatPaperEdges } from '@/lib/artist/portrait'

// #portrait-paper-trim (2026-08-26) — 포트레이트 고정 크롭이 CONCEPT 박스 보더 + 박스 밖 종이
//   띠를 물고 들어오던 결함(실측: 322×212 우측 11px = 243 균일 종이 8px + 보더 라인 2~3px)의
//   재발 방지 계약. ① 가장자리 종이 띠 + 뒤따르는 보더 라인이 걷힌다 ② 세로로 변화 있는
//   밝은 아트워크 배경은 균일하지 않아 안 걷힌다 ③ 변당 10% 안전 상한.

/** 실측 모사 합성: 세로 그라데이션(226→244) 아트워크 + [어두운 보더 라인 + 243 종이] 띠. */
async function synth(opts: {
  w: number
  h: number
  rightPaper?: number
  rightBorder?: number
  topPaper?: number
}): Promise<Buffer> {
  const { w, h, rightPaper = 0, rightBorder = 0, topPaper = 0 } = opts
  const artW = w - rightPaper - rightBorder
  const artH = h - topPaper
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgb(220,220,220)"/><stop offset="1" stop-color="rgb(236,236,236)"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="rgb(243,243,243)"/>
    <rect x="0" y="${topPaper}" width="${artW}" height="${artH}" fill="url(#g)"/>
    ${rightBorder ? `<rect x="${artW}" y="${topPaper}" width="${rightBorder}" height="${artH}" fill="rgb(91,90,89)"/>` : ''}
    <circle cx="${artW / 2}" cy="${topPaper + artH / 2}" r="${Math.min(artW, artH) / 4}" fill="rgb(90,80,70)"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function dims(buf: Buffer): Promise<{ w: number; h: number }> {
  const m = await sharp(buf).metadata()
  return { w: m.width ?? 0, h: m.height ?? 0 }
}

describe('trimFlatPaperEdges — 종이 띠 + 보더 라인만 걷는다', () => {
  it('우측 [보더 2px + 종이 15px]·상단 종이 6px 가 걷힌다 (실측 모사)', async () => {
    const buf = await synth({ w: 320, h: 210, rightPaper: 15, rightBorder: 2, topPaper: 6 })
    const out = await trimFlatPaperEdges(buf)
    const d = await dims(out)
    expect(d.w).toBeLessThanOrEqual(320 - 16) // 종이+보더 폭만큼(AA 여유 1px) 줄어든다
    expect(d.h).toBeLessThanOrEqual(210 - 5)
    expect(d.w).toBeGreaterThan(320 * 0.85) // 그림 본체는 남는다
  })

  it('띠 없는 그림(세로 그라데이션 배경)은 그대로 — 배경을 종이로 오인하지 않는다', async () => {
    const buf = await synth({ w: 320, h: 210 })
    const out = await trimFlatPaperEdges(buf)
    expect(await dims(out)).toEqual({ w: 320, h: 210 })
  })

  it('전면 종이색(243) 극단 입력도 변당 10% 상한까지만 걷는다', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="rgb(243,243,243)"/></svg>`
    const buf = await sharp(Buffer.from(svg)).png().toBuffer()
    const out = await trimFlatPaperEdges(buf)
    const d = await dims(out)
    expect(d.w).toBeGreaterThanOrEqual(200 - 2 * Math.floor(200 * 0.1))
    expect(d.h).toBeGreaterThanOrEqual(100 - 2 * Math.floor(100 * 0.1))
  })
})
