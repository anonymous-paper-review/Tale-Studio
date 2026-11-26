// 그림 고치기의 바탕(지금 실사 세 칸)은 칸 가장자리를 자르지 않고, 마무리 자르기가 잘라 낼 칸 안쪽 자리에 그대로 앉혀 — 고친 그림의 시야가 바탕과 같고 고칠수록 당겨지지 않는다 (검토 rev-director 1번 · 리드 2026-11-26)
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composeRealFixStrip, composeRoughReferenceStrip } from '@/lib/director/storyboard-strip'
import { cropRoughGridFrames } from '@/lib/writer/rough-grid-crop'

// 이 시험을 위해 만든 "지금 실사 한 칸" — 가장자리 6px 빨간 테두리, 안은 회색(16:9).
const FRAME_W = 640
const FRAME_H = 360
const BORDER = 6
let frame: Buffer

async function makeFrame(): Promise<Buffer> {
  const inner = await sharp({ create: { width: FRAME_W - BORDER * 2, height: FRAME_H - BORDER * 2, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer()
  return sharp({ create: { width: FRAME_W, height: FRAME_H, channels: 3, background: { r: 220, g: 20, b: 20 } } })
    .composite([{ input: inner, left: BORDER, top: BORDER }])
    .png()
    .toBuffer()
}

/** 모델이 받은 시트를 그대로 다시 그렸다고 치고(요청 캔버스 크기로) 마무리 자르기를 돌린다 — 끝난 시작 칸을 돌려준다. */
async function roundTrip(compose: typeof composeRealFixStrip): Promise<Buffer> {
  const sheet = await compose({ start: 'https://m/start.png', direction: 'https://m/dir.png', end: 'https://m/end.png' }, 'horizontal_16:9')
  const [w, h] = sheet.geometry.repaintCanvas.split('x').map(Number)
  const output = await sharp(sheet.buffer).resize(w, h, { fit: 'fill' }).png().toBuffer()
  const [frames] = await cropRoughGridFrames(output, 'strip1', 1, sheet.sheetFormat, 'repaint')
  return frames!.start
}

/** 가운데 가로줄에서 빨간 픽셀이 차지하는 비율. 원래 칸은 2 × 6 / 640 ≈ 1.9%. */
async function redShareOnMiddleRow(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const y = Math.floor(info.height / 2)
  let red = 0
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels
    if (data[i]! > 170 && data[i + 1]! < 90 && data[i + 2]! < 90) red += 1
  }
  return red / info.width
}

beforeEach(async () => {
  frame = await makeFrame()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(frame), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

describe('고치기 바탕의 시야', () => {
  it('고치기 바탕은 칸 가장자리를 자르지 않는다 — 모델이 그대로 다시 그리면 마무리 자르기 뒤 칸이 바탕과 같은 시야다(테두리까지 남는다)', async () => {
    // 왜(검토 rev-director 1번): 러프용 합성기는 칸마다 가장자리 3%를 잘라 늘리고 마무리 자르기가 또 3%를 잘라, 고칠 때마다 시야가 약 88%로 좁아졌다(세 번이면 약 69%).
    const share = await redShareOnMiddleRow(await roundTrip(composeRealFixStrip))
    expect(share).toBeGreaterThan(0.012)
    expect(share).toBeLessThan(0.03)
  })

  it('두 번 고쳐도 시야가 더 좁아지지 않는다', async () => {
    // 왜: 고친 그림이 다음 고치기의 바탕이 된다 — 한 번의 차이가 쌓이면 안 된다.
    frame = await roundTrip(composeRealFixStrip)
    const share = await redShareOnMiddleRow(await roundTrip(composeRealFixStrip))
    expect(share).toBeGreaterThan(0.012)
  })

  it('러프 합성기(처음 그리기)는 지금처럼 칸 가장자리 3%를 걷는다', async () => {
    // 왜: 정상 경로 고정 — 러프 칸의 연필 괄호 · 테두리 잔재를 걷는 규칙(#ref-inset)은 그대로다. 그래서 이 테두리는 남지 않는다.
    expect(await redShareOnMiddleRow(await roundTrip(composeRoughReferenceStrip))).toBeLessThan(0.005)
  })
})
