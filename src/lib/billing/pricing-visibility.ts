// 요금표(/pricing) 진입점 공개 여부 — 2026-11-04 오너: "disabled가 아니라 그냥 진입점을 일단 없애줘 나중에 다시 원복할거임".
//   2026-11-22 오너: "결제탭도 다시 살려놔줘" — 다시 연다. 구매는 아직 닫혀 있어 구매 버튼은 준비 중 안내만 띄운다.
//   false 이면 홈·공개 페이지 머리글/바닥글·로그인 후 메뉴·계정·정책·새 프로젝트·내보내기·다음 화 창에서 요금표로 가는
//   링크를 감춘다. 요금표 화면과 /pricing 주소는 어느 쪽이든 살아 있다.
//   약속: tests/billing/pricing-hidden.test.ts · tests/ui-text/pricing-navigation.test.ts · tests/editor/export-dialog.test.ts
export const PRICING_PAGE_VISIBLE = true
