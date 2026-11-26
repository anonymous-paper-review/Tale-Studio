// 비율로만 그리는 모델(Nano Banana 2 — 리드 Q2 길 a, 2026-11-26)이 돌려준 세 칸 시트를 칸 모양으로 맞춘다(서버 전용 — sharp).
//   Nano Banana 2 는 정확한 크기를 받지 않아 시트를 가장 가까운 비율로 그린다. 실측(개발 DB 2장): 칸은 시트 스펙과 같은 비례 자리에 그려져
//   비례 자르기(cropRoughGridFrames)가 칸을 찾지만, 한 칸의 모양이 시트 비율 차이만큼 어긋난다(16:9 프로젝트 6.3% · 9:16 프로젝트 3.7%).
//   늘리면 얼굴이 그만큼 넓어지거나 좁아져서, 늘리지 않고 가운데를 남겨 칸 모양으로 잘라 맞춘다(버린 안: 시트를 시트 크기로 늘린 뒤 자르기).
//   정한 크기를 그대로 돌려주는 모델(GPT Image 2 · Seedream 4 · H3 Image)은 어긋남이 2% 안이라 손대지 않는다.
//   약속: tests/director/nano-banana-sheet.test.ts
import sharp from 'sharp'

/** 시트가 정한 모양과 이만큼(로그 비 2%) 넘게 다르게 왔을 때만 칸을 맞춘다. */
export const SHEET_FIT_MIN_GAP = 0.02

export interface StripFrames {
  start: Buffer
  direction: Buffer
  end: Buffer
}

/** 그림을 aspect(가로/세로) 모양으로 가운데를 남기고 자른다 — 이미 같으면(0.5% 안) 그대로. */
async function cropToAspect(buf: Buffer, aspect: number): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(buf).metadata()
  if (!width || !height || Math.abs(Math.log(width / height / aspect)) < 0.005) return buf
  const cropWidth = width / height > aspect ? Math.round(height * aspect) : width
  const cropHeight = width / height > aspect ? height : Math.round(width / aspect)
  return sharp(buf)
    .extract({ left: Math.floor((width - cropWidth) / 2), top: Math.floor((height - cropHeight) / 2), width: cropWidth, height: cropHeight })
    .png()
    .toBuffer()
}

/**
 * 받은 시트(sheet)가 정한 시트(expected)와 모양이 다르면 세 칸을 칸 모양(cellAspect = 시트 스펙 한 칸의 가로/세로)으로 맞춘다.
 * 모양이 같으면(2% 안) 받은 칸을 그대로 돌려준다.
 */
export async function fitStripFramesToCells(
  frames: StripFrames,
  sheet: { width: number; height: number },
  expected: { width: number; height: number },
  cellAspect: number,
): Promise<StripFrames> {
  if (!sheet.width || !sheet.height || !expected.width || !expected.height) return frames
  const gap = Math.abs(Math.log((sheet.width / sheet.height) / (expected.width / expected.height)))
  if (gap <= SHEET_FIT_MIN_GAP) return frames
  const [start, direction, end] = await Promise.all([frames.start, frames.direction, frames.end].map((buf) => cropToAspect(buf, cellAspect)))
  return { start, direction, end }
}
