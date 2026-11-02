// 채팅 제안 카드의 Enter(#keyboard-only 2026-08-11) — 채팅은 카드가 떠 있으면 창 전체의 Enter 를 빌려 카드를 누른다.
//   카드를 누르는 Enter 는 채팅 입력칸(비었을 때)이나 아무것도 고르지 않은 곳(body)의 것뿐이다. 포커스된 요소가 있으면 Enter 는
//   그 요소의 것이다 — 대사 줄 · 보드 카드(2026-11-01 리뷰 M2), 채팅 안의 [나중에] · [다시 열기] · [취소](리뷰 M2b),
//   "보류한 작업" 펼치기 · 채팅 기록 아래 줄 · 내보내기 메뉴 항목(리뷰 3차 M2)의 Enter 가 돈 드는 [러프 다시 그리기]를 눌렀다.
//   누를 수 있는 요소 목록으로 고르면 목록에 없는 요소가 새어 나가 거꾸로 정한다. 약속: tests/chat/enter-outside-chat.test.ts

/** 이 Enter 가 채팅 카드를 누르는가 — 채팅 입력칸이거나 고른 요소가 없을 때(body · html)만. */
export function enterAcceptsCard(target: { tagName?: string } | null | undefined, chatInput: unknown): boolean {
  if (!target || target === chatInput) return true
  const tag = target.tagName?.toUpperCase()
  return tag === 'BODY' || tag === 'HTML'
}
