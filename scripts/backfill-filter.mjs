// backfill-filter.mjs — 화면에 뜨지 않는 파일은 소급 썸네일을 만들지 않는다.
//
// **제외 목록**이다(포함 목록 아님) — 새 종류의 화면 이미지가 생기면 자동으로 백필 대상에
// 포함되어야 한다. 포함 목록으로 만들면 새 화면이 생길 때마다 지금과 같은 구멍이 다시 난다.
//
// 생성용 임시 재료 패턴은 src/lib/storage/migration-plan.ts 의 TEMP_PATTERNS 와 겹치지만
// **같지 않다.** 그쪽은 "새 보관함으로 옮길 것인가", 여기는 "축소본을 만들 것인가"를 정한다.
// 격자 원본이 그 차이다 — 화면에 안 뜨니 축소본은 필요 없지만, shots.rough_storyboard.gridUrl
// 이 가리키고 있으므로 안 옮기면 참조가 끊긴다. 두 판단을 한 규칙으로 묶으면 안 된다.
export const EXCLUDE_PATTERNS = [
  // 배치 스토리보드 생성용 참조 시트 (<ws>/<proj>/shots/real_grid_ref_<seg>.png)
  /(^|\/)real_grid_ref_[^/]*$/i,
  // 여러 샷을 한 장에 그린 격자 원본 (real_grid_<jobId>.png · rough_grid_<jobId>.png).
  //   생성 모델이 돌려준 원본이고, 잘라낸 프레임이 따로 저장된다. 화면은 프레임만 읽는다 —
  //   rough_storyboard 에서 UI 가 꺼내 쓰는 필드는 frames·status·url 뿐이고 gridUrl·stripUrl 을
  //   렌더하는 곳이 없다("완료 시 result_url 은 그리드 원본(4샷 공용)이라 카드에 쓰면" —
  //   rough-storyboard-view.tsx). 안 뜨는 그림의 축소본은 아무도 안 읽는다.
  //   2026-08-23 확인: 이 규칙이 없어 격자 272장에 축소본이 이미 만들어져 있었다.
  /(^|\/)real_grid_[^/]*$/i,
  /(^|\/)rough_grid_[^/]*$/i,
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
