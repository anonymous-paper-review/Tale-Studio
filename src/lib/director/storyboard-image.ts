// shots.storyboard_image(JSONB) 판정 — 순수 함수(서버 라우트·클라 대기 판정이 공유).
//
// 저장 형태(finalize.ts): { url, frames?: {start,direction,end}, status:'completed', ... }.
//   실측 2026-09-02: 전 프로젝트 693행 전부 객체(516 frames 있음 / 177 url 만) — 문자열 행은 없다.
//   #ref-gate 첫 판(b35b1b88)이 문자열만 인정해 실사가 있어도 영상이 전부 409 로 막혔던 결함의 수리.

interface StoryboardImageLike {
  status?: unknown
  url?: unknown
  frames?: { start?: unknown } | null
}

/**
 * 영상 시작 프레임으로 쓸 수 있는 실사 URL — 없으면 null.
 *   frames.start 우선, 없으면 대표 url(단일 이미지 구버전). status 가 있고 completed 가 아니면(생성 중·실패) null.
 *   문자열은 하위호환(테스트·구 클라)으로 그대로 인정.
 */
export function storyboardImageStartFrame(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() || null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const img = raw as StoryboardImageLike
  if (typeof img.status === 'string' && img.status !== 'completed') return null
  const start = typeof img.frames?.start === 'string' ? img.frames.start.trim() : ''
  if (start) return start
  const url = typeof img.url === 'string' ? img.url.trim() : ''
  return url || null
}

/** 실사 스토리보드가 "있다"(영상 선행조건 충족)로 치는가. */
export function hasStoryboardImage(raw: unknown): boolean {
  return storyboardImageStartFrame(raw) !== null
}
