// 러프 가운데 장 글씨 칸(KEY · 렌즈 · FOCUS · 색온도)이 나르던 뜻을 글로 — 실사 지시문의 시네 줄(D5 · 2026-11-22 피드백 3).
//   흑백 러프에서 색온도는 그 글씨 칸이 유일한 운반 통로였다(#previz-enrich 8/7). 실사 지시문이 러프 손글씨를 옮기지 않게 되면서
//   같은 값을 샷 설계(static_spec)에서 글로 넘긴다 — 만드는 법은 #viz-gap 의 renderRepaintCineLine(빛 · 초점 · 렌즈 · 색만, 구도 · 자세는 안 건드림).
//   storyboard-strip 과 따로 둔 까닭: 실사 라우트 시험들이 storyboard-strip 을 통째로 가짜로 바꾼다 — 거기 두면 그 시험들에서 이 함수가 없다.
//   약속: tests/director/real-handwriting.test.ts
import { renderRepaintCineLine, type FacetRenderSpec } from '@/lib/writer/facet-render'

/** 샷 설계 → 실사 시네 줄. 설계가 없으면 null(빈 설계로 "unspecified" 같은 잡음을 싣지 않는다). */
export function realCineLine(staticSpec: unknown): string | null {
  if (!staticSpec || typeof staticSpec !== 'object' || Array.isArray(staticSpec) || Object.keys(staticSpec).length === 0) return null
  const line = renderRepaintCineLine(staticSpec as FacetRenderSpec).trim()
  return line || null
}
