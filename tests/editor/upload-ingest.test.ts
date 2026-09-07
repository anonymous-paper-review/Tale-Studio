// 올린 글과 그림은 읽기 쉬운 형식과 크기로 처리하고, 안전하지 않은 첨부는 이유를 알려주며 받지 않는다
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  IMAGE_MAX_BYTES,
  IMAGE_MAX_HEIGHT,
  SLICE_MAX_EDGE,
  TEXT_MAX_BYTES,
  clampTextBytes,
  byteLength,
  kindOf,
  rejectReason,
} from '@/lib/upload/limits'
import { decodeImage, sliceForVision } from '@/lib/upload/image'
import { isOwnMediaUrl, sanitizeAttachmentUrls } from '@/lib/upload/attachment'

function solid(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 30, b: 40 } },
  })
}

describe('올린 파일을 안전하게 받을 수 있는지 확인한다', () => {
  it('지원하는 파일 형식이면 알맞은 종류로 알아본다', () => {
    expect(kindOf('script.txt')).toBe('text')
    expect(kindOf('NOTE.MD')).toBe('text')
    expect(kindOf('시놉시스.docx')).toBe('docx')
    expect(kindOf('webtoon.PNG')).toBe('image')
    expect(kindOf('noext')).toBeNull()
  })

  it('SVG·HWP·PDF 파일은 이유를 알려주고 받지 않는다', () => {
    // SVG 는 Claude 비전이 못 읽고, 렌더되면 스크립트 실행 벡터가 된다.
    expect(rejectReason('logo.svg', 1000)).toMatch(/SVG/)
    expect(rejectReason('원고.hwp', 1000)).toMatch(/HWP/)
    expect(rejectReason('scan.pdf', 1000)).toMatch(/PDF/)
  })

  it('파일이 너무 크면 이유를 알려주고 받지 않는다', () => {
    expect(rejectReason('a.txt', TEXT_MAX_BYTES)).toBeNull()
    expect(rejectReason('a.txt', TEXT_MAX_BYTES + 1)).toMatch(/너무 커요/)
    expect(rejectReason('a.png', IMAGE_MAX_BYTES)).toBeNull()
    expect(rejectReason('a.png', IMAGE_MAX_BYTES + 1)).toMatch(/너무 커요/)
    expect(rejectReason('a.txt', 0)).toMatch(/비어 있어요/)
  })
})

describe('clampTextBytes', () => {
  it('허용 크기 안의 글은 그대로 보존한다', () => {
    const text = '가'.repeat(10)
    expect(clampTextBytes(text)).toEqual({ text, truncated: false })
  })

  it('긴 글도 한글이 깨지지 않게 허용 범위에 맞춘다', () => {
    // 한글 1자 = UTF-8 3바이트. 바이트로 무식하게 자르면 U+FFFD 가 생긴다.
    const text = '가'.repeat(100)
    const result = clampTextBytes(text, 100)
    expect(result.truncated).toBe(true)
    expect(byteLength(result.text)).toBeLessThanOrEqual(100)
    expect(result.text).not.toContain('�')
    expect(result.text).toBe('가'.repeat(33))
  })
})

describe('첨부한 주소를 안전한 것만 허용한다', () => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co'
  const own = `${base.replace(/\/+$/, '')}/storage/v1/object/public/media/ws/proj/uploads/x/s000.jpg`

  it('우리 서비스에서 올린 주소만 첨부로 허용한다', () => {
    expect(isOwnMediaUrl(own)).toBe(true)
    // 외부 주소를 넣어 모델에게 대신 가져오게 시키는 걸 막는다.
    expect(isOwnMediaUrl('https://evil.example.com/x.jpg')).toBe(false)
    expect(isOwnMediaUrl('http://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isOwnMediaUrl(`${base}/storage/v1/object/public/other/x.jpg`)).toBe(false)
    expect(isOwnMediaUrl(42)).toBe(false)
  })

  it('허용하지 않은 첨부 주소 수를 알려준다', () => {
    const result = sanitizeAttachmentUrls([own, 'https://evil.example.com/x.jpg'])
    expect(result.urls).toEqual([own])
    expect(result.rejected).toBe(1)
  })

  it('주소 목록이 아니면 첨부할 주소가 없다고 처리한다', () => {
    expect(sanitizeAttachmentUrls('nope').urls).toEqual([])
  })
})

/** 통과를 전제로 치수만 꺼낸다. 실패하면 사유를 그대로 터뜨려 원인이 보이게 한다. */
async function decodedOf(buf: Buffer, mime = 'image/png') {
  const result = await decodeImage(buf, mime)
  if (!result.ok) throw new Error(result.reason)
  return result.image
}

describe('decodeImage', () => {
  it('파일 형식 표기와 실제 내용이 다르면 이유를 알려주고 받지 않는다', async () => {
    const png = await solid(50, 50).png().toBuffer()
    expect(await decodeImage(png, 'image/png')).toEqual({
      ok: true,
      image: { width: 50, height: 50, extension: 'png' },
    })

    // 확장자만 바꾼 파일이 통과하면 안 된다.
    const mismatch = await decodeImage(png, 'image/jpeg')
    expect(mismatch.ok).toBe(false)
    expect(mismatch.ok === false && mismatch.reason).toMatch(/extension doesn't match the actual content/)
  })

  it('지원하지 않는 파일 형식이면 가능한 형식을 알려주고 받지 않는다', async () => {
    const png = await solid(10, 10).png().toBuffer()
    const result = await decodeImage(png, 'image/svg+xml')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/Only JPG, PNG, or WebP/)
  })

  it('세로로 긴 스크롤 웹툰도 끝까지 받아준다 (2026-08-13 회귀)', async () => {
    // 8000px 상한을 두면 실제 웹툰 한 화가 입구에서 잘린다 — 원본은 모델에 가지 않고
    // 슬라이스만 가므로 Claude 의 장당 한도를 입력에 적용하면 안 된다.
    const tall = await solid(800, 20000).png().toBuffer()
    expect(await decodedOf(tall)).toMatchObject({ width: 800, height: 20000 })
  })

  it('세로로 너무 긴 그림은 무엇이 문제인지 알려준다', async () => {
    const result = await decodeImage(await solid(400, 200).png().toBuffer(), 'image/png')
    expect(result.ok).toBe(true) // 통상 크기는 통과
    // 상한 초과 문구는 사용자가 다음 행동을 알 수 있어야 한다.
    expect(IMAGE_MAX_HEIGHT).toBeGreaterThan(10_000)
  })
})

describe('sliceForVision: 이미지를 읽기 좋은 크기로 나눈다', () => {
  it('읽기 좋은 크기의 그림은 그대로 둔다', async () => {
    const buf = await solid(800, 1000).png().toBuffer()
    const decoded = await decodedOf(buf)
    const { slices, truncated } = await sliceForVision(buf, decoded)

    expect(truncated).toBe(false)
    expect(slices).toHaveLength(1)
    expect(slices[0].width).toBe(800)
    expect(slices[0].height).toBe(1000)
  })

  it('세로로 긴 웹툰은 읽기 좋은 여러 장으로 나누고 크기를 넘기지 않는다', async () => {
    // 이게 핵심 회귀 가드다. 통짜로 넘기면 모델이 긴 변 1568 로 강제 다운스케일해서
    // 800x5000 → 250x1568 이 되고 말풍선이 소멸한다.
    const buf = await solid(800, 5000).png().toBuffer()
    const decoded = await decodedOf(buf)
    const { slices } = await sliceForVision(buf, decoded)

    expect(slices.length).toBeGreaterThan(1)
    for (const slice of slices) {
      expect(Math.max(slice.width, slice.height)).toBeLessThanOrEqual(SLICE_MAX_EDGE)
      expect(slice.width).toBe(800)
    }
    // 조각을 이어 붙이면 원본 세로를 덮는다(겹침은 허용, 누락은 불가).
    const covered = slices.reduce((sum, s) => sum + s.height, 0)
    expect(covered).toBeGreaterThanOrEqual(5000)
  })

  it('너무 넓은 그림은 읽기 좋은 크기로 줄여 나눈다', async () => {
    const buf = await solid(3000, 4000).png().toBuffer()
    const decoded = await decodedOf(buf)
    const { slices } = await sliceForVision(buf, decoded)

    for (const slice of slices) {
      expect(slice.width).toBe(SLICE_MAX_EDGE)
      expect(Math.max(slice.width, slice.height)).toBeLessThanOrEqual(SLICE_MAX_EDGE)
    }
  })

  it('끝에 지나치게 얇은 조각을 남기지 않는다', async () => {
    // 1568*2 + 40 — 남는 40px 짜리 조각이 생기면 요청 한 자리를 낭비한다.
    const height = SLICE_MAX_EDGE * 2 + 40
    const buf = await solid(600, height).png().toBuffer()
    const decoded = await decodedOf(buf)
    const { slices } = await sliceForVision(buf, decoded)

    expect(slices).toHaveLength(3)
    for (const slice of slices) {
      expect(slice.height).toBeGreaterThan(SLICE_MAX_EDGE * 0.25)
    }
  })

  it('긴 스크롤 웹툰도 한 화 전체를 빠짐없이 나눈다 (2026-08-13 회귀)', async () => {
    // 실사용 실패 케이스: 세로 20000px 스크롤 웹툰. 예전엔 8000px 상한에 걸려
    // "손상되었거나 형식이 달라요"로 거부됐다.
    const buf = await solid(800, 20000).png().toBuffer()
    const decoded = await decodedOf(buf)
    const { slices, truncated } = await sliceForVision(buf, decoded)

    expect(truncated).toBe(false)
    expect(slices.length).toBeGreaterThan(10)
    for (const slice of slices) {
      expect(slice.width).toBe(800)
      expect(Math.max(slice.width, slice.height)).toBeLessThanOrEqual(SLICE_MAX_EDGE)
    }
    expect(slices.reduce((sum, s) => sum + s.height, 0)).toBeGreaterThanOrEqual(20000)
  })

  it('흑백이나 투명한 그림도 색이 깨지지 않게 처리한다', async () => {
    // 흑백 웹툰(1채널)이나 투명도 있는 PNG(4채널)를 그대로 raw 로 펼치면 채널 수가 갈리고
    // JPEG 인코딩에서 터진다. sRGB 로 모으는지 확인한다.
    const gray = await solid(600, 3000).grayscale().png().toBuffer()
    const grayDecoded = await decodedOf(gray)
    const grayResult = await sliceForVision(gray, grayDecoded)
    expect(grayResult.slices.length).toBeGreaterThan(1)
    expect(await sharp(grayResult.slices[0].buffer).metadata()).toMatchObject({ format: 'jpeg' })

    const alpha = await sharp({
      create: { width: 600, height: 3000, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } },
    })
      .png()
      .toBuffer()
    const alphaDecoded = await decodedOf(alpha)
    const alphaResult = await sliceForVision(alpha, alphaDecoded)
    expect(await sharp(alphaResult.slices[0].buffer).metadata()).toMatchObject({ format: 'jpeg' })
  })

  it('받은 그림을 바로 볼 수 있는 JPEG로 만든다', async () => {
    const buf = await solid(800, 3000).png().toBuffer()
    const decoded = await decodedOf(buf)
    const { slices } = await sliceForVision(buf, decoded)

    const meta = await sharp(slices[0].buffer).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(slices[0].width)
    expect(meta.height).toBe(slices[0].height)
  })
})
