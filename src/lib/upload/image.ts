import sharp from 'sharp'
import {
  IMAGE_MAX_BYTES,
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_PIXELS,
  IMAGE_MAX_WIDTH,
  IMAGE_TYPES,
  SLICE_MAX_COUNT,
  SLICE_MAX_EDGE,
  formatBytes,
  isImageMimeType,
} from './limits'

export interface DecodedImage {
  width: number
  height: number
  /** IMAGE_TYPES 기준 확장자 — 신고된 MIME 이 아니라 실제 디코드 결과에서 얻는다. */
  extension: string
}

/**
 * 디코드 결과. 실패는 사유를 들고 온다.
 *
 * 예전에는 null 하나로 6가지 실패를 뭉갰고, 그 결과 멀쩡한 스크롤 웹툰에 대고
 * "손상되었거나 형식이 달라요"라고 말했다(2026-08-13). 사용자가 뭘 고쳐야 하는지
 * 모르는 오류 메시지는 없는 것만 못하다.
 */
export type DecodeResult =
  | { ok: true; image: DecodedImage }
  | { ok: false; reason: string }

function diagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[\r\n\t]/g, ' ').slice(0, 200)
}

/**
 * 신고된 MIME 과 실제 내용이 일치하는지 끝까지 디코드해서 확인한다.
 * 헤더만 보면 확장자를 바꾼 파일이 통과한다 — toBuffer() 까지 돌려야 진짜 검증이다.
 */
export async function decodeImage(data: Buffer, mimeType: string): Promise<DecodeResult> {
  if (!isImageMimeType(mimeType)) {
    return { ok: false, reason: 'JPG · PNG · WebP 만 올릴 수 있어요.' }
  }
  if (data.length === 0) {
    return { ok: false, reason: '파일이 비어 있어요.' }
  }
  if (data.length > IMAGE_MAX_BYTES) {
    return { ok: false, reason: `파일이 너무 커요 (최대 ${formatBytes(IMAGE_MAX_BYTES)}).` }
  }

  const expected = IMAGE_TYPES[mimeType]
  try {
    const image = sharp(data, { failOn: 'error', limitInputPixels: IMAGE_MAX_PIXELS })
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      return { ok: false, reason: '이미지 크기를 읽지 못했어요. 파일이 손상됐을 수 있어요.' }
    }
    if (metadata.format !== expected.format) {
      return {
        ok: false,
        reason: `확장자와 실제 내용이 달라요 (${expected.format} 이라고 했는데 ${metadata.format ?? '알 수 없음'} 이에요).`,
      }
    }
    if (metadata.width > IMAGE_MAX_WIDTH) {
      return { ok: false, reason: `가로가 너무 넓어요 (${metadata.width}px, 최대 ${IMAGE_MAX_WIDTH}px).` }
    }
    if (metadata.height > IMAGE_MAX_HEIGHT) {
      return {
        ok: false,
        reason: `세로가 너무 길어요 (${metadata.height}px, 최대 ${IMAGE_MAX_HEIGHT}px). 화를 나눠서 올려 주세요.`,
      }
    }
    if (metadata.width * metadata.height > IMAGE_MAX_PIXELS) {
      return {
        ok: false,
        reason: `이미지가 너무 커요 (${Math.round((metadata.width * metadata.height) / 1_000_000)}메가픽셀, 최대 ${IMAGE_MAX_PIXELS / 1_000_000}). 화를 나눠서 올려 주세요.`,
      }
    }

    // 본문 무결성은 여기서 따로 보지 않는다 — 바로 뒤 sliceForVision 이 전체를 디코드하므로
    //   깨진 파일은 거기서 걸린다. 여기서 stats()/toBuffer() 를 부르면 대형 웹툰에서
    //   전체 디코드를 두 번 하게 된다.
    return {
      ok: true,
      image: { width: metadata.width, height: metadata.height, extension: expected.extension },
    }
  } catch (error) {
    console.warn('[upload/image] decoder rejected input', diagnostic(error))
    return { ok: false, reason: '이미지를 여는 데 실패했어요. 파일이 손상됐을 수 있어요.' }
  }
}

export interface ImageSlice {
  buffer: Buffer
  width: number
  height: number
  /** 원본에서 이 조각이 몇 번째 토막인지(위→아래). */
  index: number
}

/**
 * 세로로 긴 이미지를 판독 가능한 조각으로 자른다.
 *
 * 채팅 모델은 긴 변이 SLICE_MAX_EDGE 를 넘으면 비율을 유지한 채 강제 다운스케일한다.
 * 웹툰 스트립(예: 800x30000)이 그대로 가면 41x1568 이 되어 대사가 소멸하므로, 폭을 먼저
 * 한도에 맞춘 뒤 세로를 SLICE_MAX_EDGE 단위로 끊는다.
 *
 * 픽셀을 raw 로 **한 번만** 펼치고 그 위에서 자른다. 조각마다 sharp().extract() 를 부르면
 * 20토막짜리 웹툰에서 원본 JPEG 를 20번 다시 디코드해 서버리스 실행 한도를 넘긴다.
 */
export async function sliceForVision(
  data: Buffer,
  decoded: DecodedImage,
): Promise<{ slices: ImageSlice[]; truncated: boolean }> {
  // 1. 폭이 한도를 넘으면 먼저 줄인다. 어차피 모델이 줄일 것을 우리가 통제해서 줄이는 것이고,
  //    가로로 큰 이미지는 여기서 픽셀 수가 급감해 이후 raw 전개가 싸진다.
  const needsResize = decoded.width > SLICE_MAX_EDGE
  const pipeline = sharp(data, { limitInputPixels: IMAGE_MAX_PIXELS })
    // 알파는 흰색으로 깔고, CMYK·그레이스케일은 sRGB 로 모은다. 이걸 안 하면 raw 채널 수가
    //   입력마다 3/4 로 갈리고, 4채널 raw 를 JPEG 로 인코딩하려다 터진다.
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toColourspace('srgb')

  const { data: raw, info } = await (needsResize
    ? pipeline.resize({ width: SLICE_MAX_EDGE })
    : pipeline
  )
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  if (channels !== 3) {
    throw new Error(`unexpected raw channel count: ${channels}`)
  }
  const stride = width * channels

  // 2. 한도 안이면 자를 필요가 없다.
  if (height <= SLICE_MAX_EDGE) {
    const buffer = await sharp(raw, { raw: { width, height, channels } })
      .jpeg({ quality: 85 })
      .toBuffer()
    return { slices: [{ buffer, width, height, index: 0 }], truncated: false }
  }

  // 3. 세로 분할. 마지막 얇은 조각은 위로 당겨 붙인다(겹침 허용 — 경계에 걸친 컷이
  //    두 조각 중 하나에서는 온전히 보인다).
  const MIN_TAIL = Math.floor(SLICE_MAX_EDGE * 0.25)
  const tops: number[] = []
  for (let top = 0; top < height; top += SLICE_MAX_EDGE) {
    const remaining = height - top
    if (remaining < MIN_TAIL && tops.length > 0) {
      tops.push(Math.max(0, height - SLICE_MAX_EDGE))
      break
    }
    tops.push(top)
  }

  const truncated = tops.length > SLICE_MAX_COUNT
  const kept = truncated ? tops.slice(0, SLICE_MAX_COUNT) : tops

  const slices: ImageSlice[] = []
  for (let i = 0; i < kept.length; i++) {
    const top = kept[i]
    const sliceHeight = Math.min(SLICE_MAX_EDGE, height - top)
    // subarray 는 복사가 아니다 — raw 버퍼 위의 창(window)일 뿐.
    const region = raw.subarray(top * stride, (top + sliceHeight) * stride)
    const buffer = await sharp(region, { raw: { width, height: sliceHeight, channels } })
      .jpeg({ quality: 85 })
      .toBuffer()
    slices.push({ buffer, width, height: sliceHeight, index: i })
  }

  return { slices, truncated }
}
