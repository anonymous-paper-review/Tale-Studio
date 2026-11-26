// Director 에서 고친 샷 글(shots.director_prompt, 마이그레이션 20261126220000) — 서버가 화면이 보낸 글보다 먼저 쓴다(리드 2026-11-26).
//   Storyboard 다시 그리기 · 다른 기기 · 묶음 이어가기는 Writer 글을 보내므로, 서버가 이 칸을 먼저 읽어야 어디서 만들어도 같은 글이다.
//   null · 빈 글 = 고친 적 없음(Writer 글 그대로). Writer 가 샷 글을 다시 쓰면 DB 방아쇠가 비운다.
//   약속: tests/director/image-fix.test.ts · tests/director/video-fix.test.ts("Director 에서 고친 글 … 먼저 쓴다")
export function directorPromptOf(row: { director_prompt?: unknown } | null | undefined): string | null {
  const text = row?.director_prompt
  return typeof text === 'string' && text.trim() ? text : null
}
