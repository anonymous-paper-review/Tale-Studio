/**
 * 첨부 이미지 URL 검증.
 *
 * 이 URL 들은 우리 서버가 아니라 Anthropic 이 가져간다. 검증 없이 통과시키면
 * 사용자가 임의 주소를 넣어 모델에게 대신 가져오게 시킬 수 있다(내부망 주소 포함).
 * 그래서 "우리 스토리지의 public media 경로"만 허용한다 — 화이트리스트가 유일한 방어다.
 */

/** 한 번의 채팅 호출에 실을 수 있는 이미지 수. 초과분은 잘라내고 사용자에게 알린다. */
export const MAX_ATTACHMENT_IMAGES = 40

function publicMediaPrefix(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/media/`
}

export function isOwnMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  const prefix = publicMediaPrefix()
  if (!prefix) return false
  if (!value.startsWith(prefix)) return false
  // 경로 조작으로 prefix 를 빠져나가는 형태 차단
  return !value.includes('..')
}

/** 신뢰할 수 있는 URL만 남기고 개수를 제한한다. 잘렸는지도 알려준다. */
export function sanitizeAttachmentUrls(raw: unknown): {
  urls: string[]
  rejected: number
  truncated: boolean
} {
  if (!Array.isArray(raw)) return { urls: [], rejected: 0, truncated: false }

  const valid = raw.filter(isOwnMediaUrl)
  const rejected = raw.length - valid.length
  const truncated = valid.length > MAX_ATTACHMENT_IMAGES

  return {
    urls: valid.slice(0, MAX_ATTACHMENT_IMAGES),
    rejected,
    truncated,
  }
}
