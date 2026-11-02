// 채팅 제안 카드의 Enter(#keyboard-only 2026-08-11) — 채팅은 카드가 떠 있으면 창 전체의 Enter 를 빌려 카드를 누른다.
//   채팅 밖의 누를 수 있는 요소(단추 · 누를 수 있는 줄 · 링크 · 입력칸 · 고르는 칸 · 글 고치는 칸)에서 친 Enter 는 그 요소의 것이다 —
//   대사 줄 · 보드 카드에서 친 Enter 가 돈 드는 [러프 다시 그리기]나 단계 넘김을 눌렀다(2026-11-01 리뷰 M2).
//   약속: tests/chat/enter-outside-chat.test.ts
export const PAGE_INTERACTIVE_SELECTOR = 'button, [role="button"], a[href], input, textarea, select, [contenteditable="true"], [contenteditable=""]'

/** 이 Enter 가 채팅이 아니라 화면 요소의 것인가 — 채팅 패널 밖의 누를 수 있는 요소면 그렇다. */
export function enterBelongsToPage(target: { closest: (selector: string) => unknown } | null | undefined): boolean {
  if (!target) return false
  if (target.closest('[data-chat-panel]')) return false
  return !!target.closest(PAGE_INTERACTIVE_SELECTOR)
}
