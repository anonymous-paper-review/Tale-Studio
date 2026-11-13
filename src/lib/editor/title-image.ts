// 타이틀 카드에 올리는 그림 상한 — 서버 라우트(/api/editor/title-image)와 고르는 화면이 같은 값을 쓴다(2026-11-14).
//   서버(Vercel)는 4.5MB 넘는 요청을 함수가 돌기 전에 거절하므로, 화면은 이 상한 안의 큰 그림을 줄여 보낸다(src/lib/upload/downscale.ts).
//   약속: tests/editor/title-image-size.test.ts
export const TITLE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
