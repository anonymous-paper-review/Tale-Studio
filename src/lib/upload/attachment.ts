/**
 * 첨부 이미지 URL 검증.
 *
 * 이 URL 들은 우리 서버가 아니라 Anthropic 이 가져간다. 검증 없이 통과시키면
 * 사용자가 임의 주소를 넣어 모델에게 대신 가져오게 시킬 수 있다(내부망 주소 포함).
 * 그래서 "우리 스토리지의 public media 경로"만 허용한다 — 화이트리스트가 유일한 방어다.
 */

// 화이트리스트 판정 자체는 `storage/media-url` 이 소유한다 — 보관함을 옮기면 허용 접두사가
// 바뀌는데, 그 지식이 여기 복사돼 있으면 이전 후 전부 거부되거나(기능 정지) 누군가 급히
// 넓혀서 방어가 뚫린다. 접두사를 아는 곳은 한 군데여야 한다.
import { isOwnMediaUrl } from '@/lib/storage/media-url'

export { isOwnMediaUrl }

/** 한 번의 채팅 호출에 실을 수 있는 이미지 수. 초과분은 잘라내고 사용자에게 알린다. */
export const MAX_ATTACHMENT_IMAGES = 40

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
