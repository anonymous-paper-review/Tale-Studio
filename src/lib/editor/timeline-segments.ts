// 영상 줄을 클립과 빈 곳으로 나누는 셈 — 미리 보기 · 재생 · 내보내기가 빈 곳을 그 길이만큼 검은 화면으로 지나가게 한다(자유 배치,
//   오너 답 1, 2026-11-14). 순수 함수만 둔다(내보내기 모듈이 Editor 상점을 끌어오지 않게). 약속: tests/editor/free-placement.test.ts

const round3 = (sec: number) => Math.round(sec * 1000) / 1000

/** 영상 줄이 끝나는 초 — 빈 곳이 있어도 마지막 클립의 끝이다. */
export function timelineEnd(layout: ReadonlyArray<{ startSec: number; durationSec: number }>): number {
  return layout.reduce((end, item) => Math.max(end, item.startSec + item.durationSec), 0)
}

/**
 * 앞 · 다음 편집점 — 0초와 클립마다 시작 · 끝(빈 곳의 양 끝 포함) · 마커 가운데 지금 시각 바로 앞 · 뒤. 다음이 없으면 마지막 편집점, 앞이 없으면 0초.
 *   Ctrl+← · Ctrl+→ 와 모니터의 앞 · 다음 편집점 단추가 같이 쓴다(2단계 ① 새 배치, 시안 E1 409:4729 · 409:4737). 마커에도 멈춘다(2단계 ③).
 *   약속: tests/editor/panels.test.ts · tests/editor/split-snap-markers.test.ts
 */
export function editPointTarget(
  layout: ReadonlyArray<{ startSec: number; durationSec: number }>,
  currentSec: number,
  dir: 1 | -1,
  markers: readonly number[] = [],
): number {
  const bounds = [...new Set([0, ...layout.flatMap((l) => [l.startSec, l.startSec + l.durationSec]), ...markers])].sort((a, b) => a - b)
  if (dir > 0) return bounds.find((b) => b > currentSec + 1e-3) ?? bounds[bounds.length - 1] ?? currentSec
  const before = bounds.filter((b) => b < currentSec - 1e-3)
  return before.length ? before[before.length - 1] : 0
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

