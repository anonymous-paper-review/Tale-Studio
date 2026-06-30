// 공통 인터랙션 스타일 토큰 (June 2026 UI 수정).
// 입력칸·버튼·메뉴 항목에 마우스 호버(롤오버) 시 "클릭한 것처럼" 빨간 테두리를 보여준다.
// D20/D21/P2/P4/P5 에서 공유한다. 평행 구현 금지 — 빨간 테두리 hover 효과는 이 토큰만 사용.
export const HOVER_RED_BORDER =
  'transition-colors hover:border-destructive focus-visible:border-destructive'

// TagInput 처럼 className 을 받지 않는 컴포넌트의 내부 input 에 hover 빨간 테두리를 거는 래퍼용.
export const HOVER_RED_BORDER_CHILD_INPUT =
  '[&_input]:transition-colors [&_input]:hover:border-destructive'
