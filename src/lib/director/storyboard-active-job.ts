// DB가 막은 중복 이미지 예약을 기존 작업으로 연결한다. 다른 오류는 원래 처리 경로에 남긴다.
export function existingStoryboardJobId(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const { code, message, details } = error as Record<string, unknown>
  return code === 'P0001' && message === 'storyboard_already_generating'
    && typeof details === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(details)
    ? details : null
}
