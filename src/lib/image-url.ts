// 원본 Supabase Storage public URL → 사전 생성 썸네일(_thumb.webp) URL (방법 B).
//
// 썸네일 파일은 업로드 시 src/lib/storage-thumb.ts 가 원본 옆(<path>_thumb.webp)에 만들어 둔다.
// 기존 프로젝트는 scripts/backfill-thumbnails.mjs 로 일괄 생성한다.
//
// 안전장치: 플래그 OFF(기본)면 원본을 그대로 반환한다. 플래그 ON 이어도 썸네일이 아직 없으면
//   <img> 가 404 → ThumbImage 의 onError 가 원본으로 폴백한다. 즉 백필 전에도 화면이 안 깨진다.

const PUBLIC_MARKER = '/storage/v1/object/public/'

/** 원본 public URL 의 확장자를 _thumb.webp 로 치환. Supabase public URL 이 아니면 원본 그대로. */
export function toThumbUrl(url: string): string {
  const [base, query] = url.split('?')
  if (!base.includes(PUBLIC_MARKER)) return url
  const slash = base.lastIndexOf('/')
  const dot = base.lastIndexOf('.')
  if (dot <= slash) return url // 파일명에 확장자 없음 → 그대로
  const thumb = `${base.slice(0, dot)}_thumb.webp`
  return query ? `${thumb}?${query}` : thumb
}

export const imageThumbsEnabled = process.env.NEXT_PUBLIC_IMAGE_THUMBS === '1'

/**
 * 그리드/노드 썸네일용 src. 플래그 ON + Supabase public URL 이면 _thumb.webp URL,
 * 그 외에는 원본을 그대로 반환한다. null/undefined/'' → undefined (poster/src 호환).
 */
export function thumbUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (!imageThumbsEnabled) return url
  return toThumbUrl(url)
}
