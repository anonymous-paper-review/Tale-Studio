// Director 캔버스에 무엇을 그리는가 · 툴바 제목 옆 숫자(v3 D1 "The Set 노드 9 · 샷 4", 2026-11-03).
//   약속: tests/director/canvas-meta.test.ts
import type { DirectorNode } from '@/types/director'

/** 캔버스에 그리지 않는 노드 — 씬과 옛 파생 카드. 데이터는 남는다(Writer 동기화 · 스토리보드 보기 · 채팅이 쓴다, #scene-hide 2026-08-31). */
export const HIDDEN_ON_CANVAS: ReadonlySet<string> = new Set(['scene', 'shotImage', 'videoPlaceholder'])

/** "노드 9 · 샷 4" — 캔버스에 보이는 노드와 그중 샷(이미지 노드). 보이는 노드가 없으면 null. */
export function directorCanvasMeta(
  nodes: readonly DirectorNode[],
  t: (text: string, params?: Record<string, string | number>) => string,
): string | null {
  const visible = nodes.filter((n) => !HIDDEN_ON_CANVAS.has(n.data.kind))
  if (visible.length === 0) return null
  const shots = visible.filter((n) => n.data.kind === 'shot').length
  return t('{nodes} nodes · {shots} shots', { nodes: visible.length, shots })
}
