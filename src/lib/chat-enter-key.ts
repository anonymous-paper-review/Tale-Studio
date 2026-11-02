// 채팅 제안 카드의 Enter(#keyboard-only 2026-08-11) — 채팅은 카드가 떠 있으면 창 전체의 Enter 를 빌려 카드를 누른다.
//   포커스된 누를 수 있는 요소(단추 · 누를 수 있는 줄 · 링크 · 입력칸 · 고르는 칸 · 글 고치는 칸)에서 친 Enter 는 그 요소의 것이다 —
//   대사 줄 · 보드 카드에서 친 Enter 가 돈 드는 [러프 다시 그리기]나 단계 넘김을 눌렀다(2026-11-01 리뷰 M2).
//   채팅 안의 단추도 같다 — Tab 으로 간 [나중에] · [다시 열기] · [취소]의 Enter 가 카드를 눌렀다(2026-11-02 리뷰 M2b).
//   카드를 누르는 Enter 는 채팅 입력칸(비었을 때)이나 아무것도 고르지 않은 곳의 것뿐이다. 약속: tests/chat/enter-outside-chat.test.ts
export const PAGE_INTERACTIVE_SELECTOR = 'button, [role="button"], a[href], input, textarea, select, [contenteditable="true"], [contenteditable=""]'

type Focusable = { closest: (selector: string) => unknown }

/** 이 Enter 가 포커스된 요소의 것인가 — 채팅 입력칸이 아닌 누를 수 있는 요소면 그렇다. */
export function enterBelongsToElement(target: Focusable | null | undefined, chatInput: unknown): boolean {
  if (!target || target === chatInput) return false
  return !!target.closest(PAGE_INTERACTIVE_SELECTOR)
}
