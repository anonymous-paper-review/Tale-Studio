// 프로젝트 제목 고치기 규칙(2026-10-21 오너 "프로젝트 제목을 처음에 설정 불가능") — 시작 화면 머리의 제목 칸이 쓴다.
//   약속: tests/producer/start-title.test.ts
export const UNTITLED = 'Untitled'

export function isUntitled(title: string | null | undefined): boolean {
  const trimmed = (title ?? '').trim()
  return !trimmed || trimmed === UNTITLED
}

/** 고치기 시작할 때 칸에 넣을 글 — 제목 없음이면 빈 칸에서 시작한다. */
export function titleDraftOf(title: string): string {
  return isUntitled(title) ? '' : title
}

/** 고친 제목 — 바꿀 값이면 앞뒤 빈칸을 뺀 제목, 비우거나 그대로면 null(바꾸지 않는다). */
export function nextProjectTitle(draft: string, current: string): string | null {
  const next = draft.trim()
  if (!next || next === current.trim()) return null
  return next
}
