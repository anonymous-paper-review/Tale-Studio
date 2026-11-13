// Director 실사 이미지 일괄의 시작 전 예상 시간(디자이너 1110 확정 D0 · D1 "이미지 N장 · 약 M분", 8/26 "시작 전 예상만").
//   일괄은 한 번 부를 때 4샷 시트를 두 장씩 함께 그린다(generate-storyboard-batch MAX_GRID_JOBS_PER_CALL = 2).
//   시트 하나는 약 92초(개발 DB 2026-09-15~11-14 storyboard_real_grid p50) — 8샷마다 약 1.5분, 분으로 올린다.
//   Storyboard → Director 넘기기 창과 Director 툴바가 같은 셈을 쓴다. 약속: tests/writer/director-handover-images.test.ts
export const REAL_GRID_SHOTS_PER_SHEET = 4
export const REAL_GRID_SHEETS_PER_ROUND = 2
export const REAL_GRID_SHEET_SECONDS = 92

export function realImageBatchMinutes(count: number): number {
  if (count <= 0) return 0
  const rounds = Math.ceil(count / (REAL_GRID_SHOTS_PER_SHEET * REAL_GRID_SHEETS_PER_ROUND))
  return Math.max(1, Math.ceil((rounds * REAL_GRID_SHEET_SECONDS) / 60))
}
