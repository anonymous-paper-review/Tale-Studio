// backfill-filter.mjs — 화면에 뜨지 않는 파일은 소급 썸네일을 만들지 않는다.
//
// **제외 목록**이다(포함 목록 아님) — 새 종류의 화면 이미지가 생기면 자동으로 백필 대상에
// 포함되어야 한다. 포함 목록으로 만들면 새 화면이 생길 때마다 지금과 같은 구멍이 다시 난다.
//
// 생성용 임시 재료 패턴은 src/lib/storage/migration-plan.ts 의 TEMP_PATTERNS 와 같은 판단
// (외부 생성 서버에 넘기는 주문서 첨부물 — 화면 어디에도 안 뜬다).
export const EXCLUDE_PATTERNS = [
  // 배치 스토리보드 생성용 참조 시트 (<ws>/<proj>/shots/real_grid_ref_<seg>.png)
  /(^|\/)real_grid_ref_[^/]*$/i,
  // 단건 스토리보드 생성용 참조 띠 (<seg>_storyboard_ref_strip.png)
  /_storyboard_ref_strip\.[^/.]+$/i,
  // 생성 모델용 고정 템플릿 — 화면에 안 뜬다
  /^templates\//i,
  // 원본 업로드 — 화면 어디에 뜨는지 확인 전까지 보류 (2026-08-19)
  /(^|\/)uploads\//i,
]

/** 이 객체 경로에 썸네일을 만들어야 하는가. */
export function shouldBackfill(objectPath) {
  return !EXCLUDE_PATTERNS.some((re) => re.test(objectPath))
}

/** 썸네일 경로 → 원본 추정 경로. 확장자는 판정에만 쓰므로 .png 로 가정해도 무방하다
 *  (제외 패턴은 접두/경로/이름 기반이라 확장자에 의존하지 않는다). */
export function originalOfThumb(thumbPath) {
  return `${thumbPath.slice(0, -'_thumb.webp'.length)}.png`
}

/** 이 _thumb.webp 가 잘못 만들어진 것(화면에 안 뜨는 원본의 썸네일)인가 —
 *  scripts/cleanup-excluded-thumbs.mjs 의 삭제 판정. 백필 제외 규칙과 항상 같이 움직인다. */
export function shouldDeleteThumb(thumbPath) {
  if (!/_thumb\.webp$/i.test(thumbPath)) return false
  return !shouldBackfill(originalOfThumb(thumbPath))
}
