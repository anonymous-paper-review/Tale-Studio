/**
 * 프로듀서 파일 업로드 정책 — 상한과 포맷 판별의 단일 출처.
 *
 * 상한의 근거는 "웹 관행"이 아니라 하류 소비자의 실제 제약이다:
 *  - 텍스트: storyText 는 매 턴 LLM 컨텍스트에 재주입된다(api/produce/chat/route.ts).
 *    파일 크기가 아니라 이 재주입 비용이 진짜 상한선이다.
 *  - 이미지: Claude 비전의 장당/치수/장수 한도와 같은 값으로 맞춘다. 업로드는 통과했는데
 *    모델이 거부하는 상태를 만들지 않기 위해서다.
 */

/** 텍스트 상한. 한글 약 3.3만자(원고지 ~170매) — 시나리오 한 편이 넉넉히 들어간다. */
export const TEXT_MAX_BYTES = 100 * 1024

/** docx 원본 상한. 파싱 후 추출된 텍스트에는 TEXT_MAX_BYTES 가 다시 적용된다. */
export const DOCX_MAX_BYTES = 20 * 1024 * 1024

/** 이미지 장당 상한 — Claude API 직접 호출의 장당 한도와 동일. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024

/**
 * 이미지 치수 상한.
 *
 * 주의: Claude 의 장당 8000px 한도를 여기 그대로 쓰면 안 된다(2026-08-13 실사용 실패).
 * 원본은 모델에 가지 않는다 — 우리가 자른 슬라이스만 간다. 스크롤 웹툰 한 화는 세로가
 * 10,000~30,000px 이라 8000 상한을 두면 웹툰을 받으려고 만든 기능이 웹툰을 거부한다.
 * 그래서 세로만 크게 열고, 진짜 제약(디코드 메모리)은 총 픽셀로 건다.
 */
export const IMAGE_MAX_WIDTH = 8000
export const IMAGE_MAX_HEIGHT = 60_000

/**
 * 총 픽셀 상한 — 디코드 폭탄 방어이자 메모리 상한.
 * 슬라이싱이 원본을 raw 로 한 번 펼치므로 대략 이 값 × 3바이트가 순간 메모리다(60M → ~180MB).
 * 통상 웹툰 한 화(800~1000 × 10k~30k = 8~30M)는 넉넉히 들어온다.
 */
export const IMAGE_MAX_PIXELS = 60_000_000

/**
 * 1회 업로드 장수. 21장 이상이면 Claude 가 장당 2000px 추가 제한을 걸고,
 * 요청 전체 크기 한도에도 먼저 닿는다.
 */
export const IMAGE_MAX_COUNT = 20

/**
 * 슬라이스 한 조각의 최대 변(px).
 *
 * 채팅 모델(claude-sonnet-4-6)은 standard 해상도 티어라 긴 변이 1568px 를 넘으면
 * 강제 다운스케일된다. 800x12000 웹툰 스트립을 그대로 넘기면 104x1568 로 뭉개져
 * 말풍선이 사라진다 — 슬라이싱은 선택이 아니라 판독의 전제다.
 */
export const SLICE_MAX_EDGE = 1568

/** 슬라이스 조각 수 상한. 초과분은 잘라내고 호출자가 사용자에게 알린다. */
export const SLICE_MAX_COUNT = 40

export type UploadKind = 'text' | 'docx' | 'image'

/** 확장자 → 종류. 여기 없는 확장자는 거부된다(SVG 포함 — 아래 주석 참고). */
const EXTENSION_KIND: Record<string, UploadKind> = {
  txt: 'text',
  md: 'text',
  markdown: 'text',
  docx: 'docx',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
}

/**
 * SVG 는 의도적으로 뺐다 — Claude 비전이 지원하지 않는 포맷(JPEG/PNG/GIF/WebP만)이고,
 * 브라우저에서 렌더되면 스크립트 실행 벡터가 된다. GIF 는 Claude 는 받지만
 * 애니메이션의 첫 프레임만 쓰이고 슬라이싱 의미가 모호해 제외한다.
 */
export const REJECTED_EXTENSIONS: Record<string, string> = {
  svg: 'SVG 는 읽을 수 없어요. PNG 나 JPG 로 내보내서 올려 주세요.',
  hwp: 'HWP 는 아직 지원하지 않아요. TXT 나 DOCX 로 저장해서 올려 주세요.',
  hwpx: 'HWPX 는 아직 지원하지 않아요. TXT 나 DOCX 로 저장해서 올려 주세요.',
  doc: '옛 DOC 형식은 지원하지 않아요. DOCX 로 저장해서 올려 주세요.',
  pdf: 'PDF 는 아직 지원하지 않아요. TXT 로 저장하거나 페이지를 이미지로 올려 주세요.',
  gif: 'GIF 는 지원하지 않아요. PNG 나 JPG 로 올려 주세요.',
}

/** `<input accept>` 값 — 파일 다이얼로그가 1차 필터를 대신하게 한다. */
export const UPLOAD_ACCEPT = '.txt,.md,.markdown,.docx,.jpg,.jpeg,.png,.webp'

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 0 || dot === filename.length - 1) return ''
  return filename.slice(dot + 1).toLowerCase()
}

export function kindOf(filename: string): UploadKind | null {
  return EXTENSION_KIND[extensionOf(filename)] ?? null
}

/** 이미지 MIME → sharp 포맷명·확장자. MIME 과 실제 내용의 대조에 쓴다. */
export const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', format: 'jpeg' },
  'image/png': { extension: 'png', format: 'png' },
  'image/webp': { extension: 'webp', format: 'webp' },
} as const

export type ImageMimeType = keyof typeof IMAGE_TYPES

export function isImageMimeType(value: string): value is ImageMimeType {
  return value in IMAGE_TYPES
}

/**
 * 한 파일이 정책을 통과하는지. 통과면 null, 아니면 사용자에게 보일 한국어 사유.
 * 확장자와 크기만 본다 — 이미지 내용 검증은 decodeImage(image.ts)가 따로 한다.
 */
export function rejectReason(filename: string, sizeBytes: number): string | null {
  const ext = extensionOf(filename)
  if (REJECTED_EXTENSIONS[ext]) return REJECTED_EXTENSIONS[ext]

  const kind = EXTENSION_KIND[ext]
  if (!kind) return `${filename} 은(는) 지원하지 않는 형식이에요.`
  if (sizeBytes === 0) return `${filename} 이(가) 비어 있어요.`

  const limit =
    kind === 'text' ? TEXT_MAX_BYTES : kind === 'docx' ? DOCX_MAX_BYTES : IMAGE_MAX_BYTES
  if (sizeBytes > limit) {
    return `${filename} 이(가) 너무 커요 (최대 ${formatBytes(limit)}).`
  }
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`
  return `${Math.round(bytes / 1024)}KB`
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * 텍스트를 바이트 상한까지만 남긴다. 잘렸는지도 함께 돌려준다 — 조용히 자르면
 * 사용자는 뒷부분이 반영 안 된 이유를 영영 모른다.
 *
 * 바이트로 자르면 멀티바이트 문자 중간이 끊기므로 문자 단위로 줄여 나간다.
 */
export function clampTextBytes(
  text: string,
  maxBytes: number = TEXT_MAX_BYTES,
): { text: string; truncated: boolean } {
  if (byteLength(text) <= maxBytes) return { text, truncated: false }

  // UTF-8 은 문자당 최대 4바이트 — 이 비율로 1차 추정 후 초과분만 깎는다.
  let end = Math.min(text.length, Math.floor(maxBytes / 2))
  while (end < text.length && byteLength(text.slice(0, end + 1)) <= maxBytes) end++
  while (end > 0 && byteLength(text.slice(0, end)) > maxBytes) end--

  return { text: text.slice(0, end).trimEnd(), truncated: true }
}
