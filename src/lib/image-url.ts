// Supabase Storage 원본 URL → 온더플라이 리사이즈 썸네일 URL.
//
// 왜: Artist/Director/Editor 는 완성 프로젝트 진입 시 원본 풀해상도 PNG(장당 1~3MB)를
//   수십~수백 장 동시에 끌어와 초기 렌더가 느리다. Supabase 는 저장된 원본을 read 시점에
//   리사이즈해주는 이미지 변환 엔드포인트(/render/image/public/)를 제공하므로, 그리드/노드
//   썸네일은 작은 변환 URL 로 서빙하고 상세/재생만 원본을 쓴다.
//
// 안전장치: 이미지 변환은 Supabase 유료 애드온이다. 미활성 프로젝트에서 변환 URL 을 쓰면
//   이미지가 깨지므로, NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=1 일 때만 재작성한다. 플래그가
//   꺼져 있거나 대상이 아닌 URL(외부 fal/blob 등)이면 원본을 그대로 반환한다(무해).

const PUBLIC_MARKER = '/storage/v1/object/public/'
const RENDER_PREFIX = '/storage/v1/render/image/public/'

/**
 * Supabase public URL 을 변환(render) URL 로 재작성한다. 대상이 아니면 원본 반환.
 * 기존 쿼리(?v= 캐시버전 등)는 보존한다. 플래그와 무관하게 항상 재작성 — 내부/테스트용.
 */
export function buildRenderUrl(
  url: string,
  width: number,
  quality = 70,
): string {
  const [base, query] = url.split('?')
  const idx = base.indexOf(PUBLIC_MARKER)
  if (idx === -1) return url
  const rendered =
    base.slice(0, idx) + RENDER_PREFIX + base.slice(idx + PUBLIC_MARKER.length)
  const params = new URLSearchParams(query)
  params.set('width', String(width))
  params.set('quality', String(quality))
  params.set('resize', 'contain')
  return `${rendered}?${params.toString()}`
}

export const imageTransformEnabled =
  process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM === '1'

/**
 * 그리드/노드 썸네일용 src. 플래그 ON + Supabase public URL 이면 변환 URL,
 * 그 외에는 원본을 그대로 반환한다. null/undefined 는 undefined 로 정규화(<img src>/poster 호환).
 */
export function thumbUrl(
  url: string | null | undefined,
  width = 512,
  quality = 70,
): string | undefined {
  if (!url) return undefined
  if (!imageTransformEnabled) return url
  return buildRenderUrl(url, width, quality)
}
