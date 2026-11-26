// 콘티에서 고친 화살표를 읽은 줄(shots.rough_storyboard.directionRead — src/lib/writer/direction-read.ts)을 지시문에 싣는 문장 (오너 2026-11-22 R1 · Q4, 리드 2026-11-26 나눔 — m-director).
//   문장은 dev 5bc92642(실사) · e45d538e(영상)와 같다. 줄이 없거나 빈 줄이면 아무것도 싣지 않는다 — 그 샷의 지시문은 한 글자도 바뀌지 않는다(리드 조건).
//   약속: tests/director/real-direction-line.test.ts · tests/director/video-direction-line.test.ts
/** 읽은 줄을 싣는 길이 상한 — 사람이 고친 줄이 지나치게 길면 다른 지시를 밀어낸다(dev e45d538e 와 같은 값). */
export const DIRECTION_LINE_MAX_CHARS = 400

function clean(line: string | null | undefined): string | null {
  const text = typeof line === 'string' ? line.trim() : ''
  return text ? text.slice(0, DIRECTION_LINE_MAX_CHARS) : null
}

/** 실사 한 샷(세 칸 띠): 샷 글 바로 뒤 — 샷 글은 지우지 않고(인물 · 소품 · 분위기), 다를 때 이 줄과 참고 끝 칸을 따르게 한다. */
export function stripMovementLines(directionLine: string | null | undefined): string[] {
  const line = clean(directionLine)
  return line ? [`- Movement (the director edited it after the shot description was written; where the two disagree, follow this movement and reference panel 3): ${line}`] : []
}

/** 실사 네 샷 시트: 줄 있는 칸만 칸 번호와 함께 — 시트에는 샷 글이 없어 다툼이 없다. 그 칸의 3행(끝)과 같은 움직임이라고만 적는다. */
export function gridMovementLines(directionLines?: ReadonlyArray<string | null | undefined>): string[] {
  const entries = (directionLines ?? []).map((line, i) => ({ i, line: clean(line) })).filter((e): e is { i: number; line: string } => e.line !== null)
  if (!entries.length) return []
  return [
    `- Per-column movement (the director's latest movement for these columns; it matches that column's row 3 END panel):`,
    ...entries.map((e) => `    · Column ${e.i + 1}: ${e.line}`),
  ]
}

/** 영상: 지시문 맨 앞 문장 — 움직임은 이 줄이 정한다(옛 움직임 약속은 buildVideoPrompt 가 싣지 않는다). 줄이 없으면 null. */
export function videoMovement(directionLine: string | null | undefined): { line: string; text: string } | null {
  const line = clean(directionLine)
  return line ? { line, text: `Movement (from the edited direction sketch): ${line}` } : null
}
