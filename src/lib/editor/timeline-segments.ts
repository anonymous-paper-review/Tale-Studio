// 영상 줄을 클립과 빈 곳으로 나누는 셈 — 미리 보기 · 재생 · 내보내기가 빈 곳을 그 길이만큼 검은 화면으로 지나가게 한다(자유 배치,
//   오너 답 1, 2026-11-14). 순수 함수만 둔다(내보내기 모듈이 Editor 상점을 끌어오지 않게). 약속: tests/editor/free-placement.test.ts

const round3 = (sec: number) => Math.round(sec * 1000) / 1000

/** 영상 줄이 끝나는 초 — 빈 곳이 있어도 마지막 클립의 끝이다. */
export function timelineEnd(layout: ReadonlyArray<{ startSec: number; durationSec: number }>): number {
  return layout.reduce((end, item) => Math.max(end, item.startSec + item.durationSec), 0)
}

export type TimelineSegment =
  | { kind: 'clip'; shotId: string; startSec: number; endSec: number }
  | { kind: 'gap'; startSec: number; endSec: number }

/**
 * 영상 줄을 처음부터 끝까지 클립과 빈 곳으로 나눈다 — 미리 보기 · 내보내기가 빈 곳을 그 길이만큼 검은 화면으로 지나가게(자유 배치,
 *   2026-11-14). 약속: tests/editor/free-placement.test.ts
 */
export function timelineSegments(layout: ReadonlyArray<{ shotId: string; startSec: number; durationSec: number }>): TimelineSegment[] {
  const out: TimelineSegment[] = []
  let cursor = 0
  for (const item of layout) {
    if (item.startSec - cursor > 0.0005) out.push({ kind: 'gap', startSec: round3(cursor), endSec: round3(item.startSec) })
    out.push({ kind: 'clip', shotId: item.shotId, startSec: round3(item.startSec), endSec: round3(item.startSec + item.durationSec) })
    cursor = item.startSec + item.durationSec
  }
  return out
}

