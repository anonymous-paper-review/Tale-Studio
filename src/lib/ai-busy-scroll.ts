// 투명 덮개(AiBusyOverlay scrim="clear")가 받은 휠 · 손가락 끌기를 아래 보기 칸으로 넘긴다 (11/5 시안 WL · AR, 2026-11-09).
//   잠근 칸(inert)은 누르기 · 휠을 받지 못한다(브라우저가 그 칸을 짚지 않는다). 그래서 덮개가 대신 받아
//   포인터 아래의 [data-ai-busy-scroll] 칸을 scrollBy 로 움직인다 — 칸이 겹치면 가장 안쪽(가장 작은) 칸.
//   잠금 자체(inert · 레일 붙잡기)는 그대로고, 보기 · 스크롤만 된다. 약속: tests/project/busy-overlay-clear.test.ts
export const AI_BUSY_SCROLL_ATTR = 'data-ai-busy-scroll'

export interface ScrollPane {
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number }
  scrollBy(x: number, y: number): void
  readonly clientHeight: number
}

interface Point {
  clientX: number
  clientY: number
}

/** 줄 단위로 오는 휠(deltaMode 1)의 한 줄 — 브라우저 기본 줄 높이. 쪽 단위(2)는 그 칸 높이. */
const LINE_PX = 16

function paneAt<T extends ScrollPane>(panes: ArrayLike<T>, x: number, y: number): T | null {
  let best: T | null = null
  let bestArea = Infinity
  for (const pane of Array.from(panes)) {
    const r = pane.getBoundingClientRect()
    if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) continue
    const area = (r.right - r.left) * (r.bottom - r.top)
    if (area < bestArea) {
      best = pane
      bestArea = area
    }
  }
  return best
}

/** 덮개 하나에 하나 — 휠은 그때그때, 손가락 끌기는 처음 닿은 칸을 끝날 때까지 따라간다(두 손가락이면 멈춘다). */
export function createScrollRelay<T extends ScrollPane>(panes: () => ArrayLike<T>) {
  let drag: { pane: T; x: number; y: number } | null = null
  return {
    wheel(e: Point & { deltaX: number; deltaY: number; deltaMode: number; ctrlKey?: boolean }) {
      // 트랙패드 오므리기 · Ctrl+휠은 확대 · 축척(Artist 보드)이다 — 아래 칸을 스크롤하지 않는다(검토 A2 N2).
      if (e.ctrlKey) return
      const pane = paneAt(panes(), e.clientX, e.clientY)
      if (!pane) return
      const k = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? pane.clientHeight : 1
      pane.scrollBy(e.deltaX * k, e.deltaY * k)
    },
    touchStart(e: { touches: ArrayLike<Point> }) {
      const t = e.touches.length === 1 ? e.touches[0] : null
      const pane = t ? paneAt(panes(), t.clientX, t.clientY) : null
      drag = t && pane ? { pane, x: t.clientX, y: t.clientY } : null
    },
    touchMove(e: { touches: ArrayLike<Point> }) {
      if (!drag) return
      if (e.touches.length !== 1) {
        drag = null
        return
      }
      const t = e.touches[0]
      drag.pane.scrollBy(drag.x - t.clientX, drag.y - t.clientY)
      drag.x = t.clientX
      drag.y = t.clientY
    },
    touchEnd() {
      drag = null
    },
  }
}
