// 더한 샷 채운 칸의 표시(오너 2026-11-27 N2) — 계산(added_shot.ts) 없이 표시만 읽는 곳(실사 지시문의 멈춘 러프 판정 등)이 가볍게 쓴다.
//   채운 칸 = 같은 씬 앞뒤 샷 · 씬 무대로 채운 자리 · 자세 · 빛이다. 움직임 설계가 아니다 — 러프는 지금처럼 멈춘 한 순간으로 그려진다.
export const ADDED_FILL_VERSION = 1

/** 앞뒤 샷으로 채운 설계 칸인가(static_spec.added_fill). */
export function isAddedFillSpec(spec: unknown): boolean {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return false
  const mark = (spec as { added_fill?: unknown }).added_fill
  return !!mark && typeof mark === 'object' && !Array.isArray(mark)
}
