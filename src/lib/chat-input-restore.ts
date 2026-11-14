// 채팅 입력칸에 글을 되돌려 넣는 규칙(리드 2026-11-14 C) — 보낸 말이 튕겼을 때 쓴 글을 입력칸으로 돌려준다.
//   입력칸이 비어 있으면 되돌린 글만, 그새 새 글을 쓰기 시작했으면 되돌린 글 뒤에 이어 붙인다(어느 쪽도 사라지지 않게).
//   약속: tests/chat/writer-input-restore.test.ts

export function restoreIntoInput(current: string, restored: string): string {
  return current.trim() ? `${restored}\n${current}` : restored
}

/**
 * 되돌리기 요청이 이 입력칸의 것인가(리드 2026-11-14 검토 높음 2) — 말을 보낸 프로젝트와 지금 프로젝트가 같을 때만 그 글을 돌려준다.
 *   프로젝트를 옮긴 뒤 열린 입력칸에 앞 프로젝트에서 쓰던 글이 들어오지 않게 한다. 요청이 없거나 프로젝트를 모르면 null.
 */
export function restoreTextFor(request: { text: string; projectId: string | null } | null, projectId: string | null): string | null {
  if (!request || !projectId || request.projectId !== projectId) return null
  return request.text
}
