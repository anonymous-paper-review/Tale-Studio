// 채팅 입력칸에 글을 되돌려 넣는 규칙(리드 2026-11-14 C) — 보낸 말이 튕겼을 때 쓴 글을 입력칸으로 돌려준다.
//   입력칸이 비어 있으면 되돌린 글만, 그새 새 글을 쓰기 시작했으면 되돌린 글 뒤에 이어 붙인다(어느 쪽도 사라지지 않게).
//   약속: tests/chat/writer-input-restore.test.ts

export function restoreIntoInput(current: string, restored: string): string {
  return current.trim() ? `${restored}\n${current}` : restored
}
