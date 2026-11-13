/**
 * 올리기 전에 큰 그림을 줄인다 — **브라우저 전용**(canvas). 크기 판단(needsDownscale · fitWithin)만 순수 함수라 어디서나 쓴다.
 *
 * 왜: Vercel 은 4.5MB 넘는 요청 본문을 함수가 돌기 전에 거절한다(413, 우리 라우트의 사유 없이). 휴대폰 사진은 흔히 그보다 크다.
 *   서버 상한(IMAGE_MAX_BYTES 10MB)은 로컬 · 서버 방어선으로 그대로 두고, 화면이 미리 줄여 보낸다(2026-10-27 브레이크다운 레퍼런스).
 * JPEG 로 줄인다: 브라우저마다 WebP 인코딩 지원이 달라 PNG 로 떨어지면 다시 커진다. JPEG 는 투명을 못 담아 흰 바탕에 얹는다
 *   (Artist 시트 양식도 흰 바탕이다).
 */

/** 이만큼까지는 그대로 보낸다 — Vercel 4.5MB 상한에 여유(폼 경계 · 다른 칸)를 둔 값. */
export const UPLOAD_SAFE_BYTES = 4 * 1024 * 1024
/** 줄일 때 긴 변. 그림 모델 참고 그림으로 충분하고 카드 확대 보기에서도 흐리지 않다. */
export const DOWNSCALE_MAX_EDGE = 2048
const DOWNSCALE_QUALITY = 0.9

export function needsDownscale(bytes: number): boolean {
  return bytes > UPLOAD_SAFE_BYTES
}

/** 비율을 지킨 채 긴 변이 maxEdge 를 넘지 않는 크기. 작은 그림은 키우지 않는다. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function renamed(name: string, ext: string): string {
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`
}

/** 투명한 곳(알파 255 미만)이 있는 그림인가 — RGBA 픽셀 배열을 본다. */
export function hasTransparency(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true
  return false
}

/**
 * 줄일 때 쓸 형식 — 투명을 지켜야 하는 곳(타이틀 카드 그림, 2026-11-14 검토 c)에서 투명한 곳이 있으면 PNG, 아니면 JPEG.
 *   JPEG 는 투명을 못 담아 바탕을 깐다 — 투명 로고가 네모가 되어 글자를 가렸다.
 */
export function downscaleType(input: { keepTransparency: boolean; transparent: boolean }): 'image/png' | 'image/jpeg' {
  return input.keepTransparency && input.transparent ? 'image/png' : 'image/jpeg'
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * 상한을 넘는 그림만 긴 변 DOWNSCALE_MAX_EDGE 로 줄인다. 열지 못하면 원본을 돌려준다 — 서버가 사유를 말한다.
 *   기본은 JPEG(background 로 투명한 곳을 채운다 — 시트 양식은 흰 바탕, 타이틀 카드는 카드 바탕과 같은 검정).
 *   keepTransparency 면 투명한 곳이 있는 그림은 PNG 로 줄이고, 그래도 크면 WebP(투명을 지킨다, 브라우저가 못 만들면 PNG 그대로).
 */
export async function downscaleForUpload(file: File, options: { background?: string; keepTransparency?: boolean } = {}): Promise<File> {
  if (!needsDownscale(file.size)) return file
  let bitmap: ImageBitmap
  try {
    // createImageBitmap 은 사진의 회전 정보대로 세워 연다(브라우저 기본값).
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, DOWNSCALE_MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    const transparent = !!options.keepTransparency && hasTransparency(context.getImageData(0, 0, width, height).data)
    if (downscaleType({ keepTransparency: !!options.keepTransparency, transparent }) === 'image/png') {
      const png = await toBlob(canvas, 'image/png')
      const webp = png && png.size > UPLOAD_SAFE_BYTES ? await toBlob(canvas, 'image/webp', DOWNSCALE_QUALITY) : null
      const best = webp && webp.type === 'image/webp' && webp.size < (png?.size ?? Infinity) ? webp : png
      return best ? new File([best], renamed(file.name, best.type === 'image/webp' ? 'webp' : 'png'), { type: best.type }) : file
    }
    // 바탕을 그림 뒤에 깐다(투명한 곳만 채워진다).
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = options.background ?? 'white'
    context.fillRect(0, 0, width, height)
    const blob = await toBlob(canvas, 'image/jpeg', DOWNSCALE_QUALITY)
    return blob ? new File([blob], renamed(file.name, 'jpg'), { type: 'image/jpeg' }) : file
  } finally {
    bitmap.close()
  }
}
