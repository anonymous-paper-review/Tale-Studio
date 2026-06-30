// 공통 인터랙션 스타일 토큰 (June 2026 UI 통일).
// 마우스 호버(또는 포커스) 시 빨간 빛이 테두리를 따라 도는 "border beam" 효과를 준다.
//   - 정의: src/app/globals.css `.hover-red-beam` (conic ring + beam-spin, destructive 색).
//   - <button>/<div> 등 ::before 지원 요소에는 이 클래스를 직접 적용한다(SelectTrigger·+추가·토글·액션 버튼).
//   - <input>/<textarea>는 ::before 미지원 → HoverBeam(src/features/producer/hover-beam.tsx) 래퍼로 감싼다.
// D20/D21/P2/P4/P5 공통 — 빨간 hover 효과는 이 토큰/래퍼만 사용(평행 구현 금지).
export const HOVER_RED_BORDER = 'hover-red-beam'
