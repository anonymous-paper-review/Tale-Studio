// 요금표(/pricing) 진입점 공개 여부 — 2026-11-04 오너: "disabled가 아니라 그냥 진입점을 일단 없애줘 나중에 다시 원복할거임".
//   false 이면 홈·공개 페이지 머리글/바닥글·로그인 후 메뉴·계정·정책·새 프로젝트·내보내기·다음 화 창에서 요금표로 가는
//   링크를 감춘다. 요금표 화면과 /pricing 주소는 그대로 살아 있다 — true 로 바꾸면 링크가 전부 돌아온다.
//   약속: tests/billing/pricing-hidden.test.ts · tests/ui-text/pricing-navigation.test.ts · tests/editor/export-dialog.test.ts
export const PRICING_PAGE_VISIBLE = false
