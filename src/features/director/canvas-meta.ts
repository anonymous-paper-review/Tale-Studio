// Director 캔버스에 무엇을 그리는가 · 툴바 제목 옆 숫자(v3 D1 "The Set 노드 9 · 샷 4", 2026-11-03).
//   약속: tests/director/canvas-meta.test.ts
import type { DirectorNode } from '@/types/director'

/** 캔버스에 그리지 않는 노드 — 씬과 옛 파생 카드. 데이터는 남는다(Writer 동기화 · 스토리보드 보기 · 채팅이 쓴다, #scene-hide 2026-08-31). */
export const HIDDEN_ON_CANVAS: ReadonlySet<string> = new Set(['scene', 'shotImage', 'videoPlaceholder'])

/** 노드 카드 테두리 — 다시 만들어야 하는 오래된 노드는 빨강이 늘 이긴다(마우스를 올려도 · 골라도, 검토 B B4).
 *  그 밖에는 고른 노드만 지금 단계 색, 나머지는 마우스를 올리면 옅은 테두리(v3 D1). */
export function nodeFrameBorder({ strongStale, selected }: { strongStale?: boolean; selected?: boolean }): string {
  return strongStale ? 'border-destructive' : selected ? 'border-stage' : 'border-transparent hover:border-border'
}

/** "노드 9 · 샷 4" — 캔버스에 보이는 노드와 그중 샷(이미지 노드). 보이는 노드가 없으면 null. */
export function directorCanvasMeta(
  nodes: readonly DirectorNode[],
  t: (text: string, params?: Record<string, string | number>) => string,
): string | null {
  const visible = nodes.filter((n) => !HIDDEN_ON_CANVAS.has(n.data.kind))
  if (visible.length === 0) return null
  const shots = visible.filter((n) => n.data.kind === 'shot').length
  // 영어는 수가 1이면 단수(리드 11/14 답 2) — 한국어는 "노드 9 · 샷 4" 그대로.
  const params = { nodes: visible.length, shots }
  if (visible.length === 1) return shots === 1 ? t('1 node · 1 shot', params) : t('1 node · {shots} shots', params)
  return shots === 1 ? t('{nodes} nodes · 1 shot', params) : t('{nodes} nodes · {shots} shots', params)
}

/** 스토리보드형 "씬 2 · 샷 4 · 12초"(1110 확정 시안 D1 406:3717) — 씬 수 · 샷 수 · 샷 길이 합. 샷이 없으면 null. */
export function storyboardCanvasMeta(
  nodes: readonly DirectorNode[],
  t: (text: string, params?: Record<string, string | number>) => string,
): string | null {
  const shots = nodes.filter((n) => n.data.kind === 'shot')
  if (shots.length === 0) return null
  const scenes = nodes.filter((n) => n.data.kind === 'scene').length
  const seconds = shots.reduce((sum, n) => {
    const value = (n.data as { durationSeconds?: unknown }).durationSeconds
    return sum + (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)
  }, 0)
  const params = { scenes, shots: shots.length, seconds: Math.round(seconds) }
  if (scenes === 1) return shots.length === 1 ? t('1 scene · 1 shot · {seconds}s', params) : t('1 scene · {shots} shots · {seconds}s', params)
  return shots.length === 1 ? t('{scenes} scenes · 1 shot · {seconds}s', params) : t('{scenes} scenes · {shots} shots · {seconds}s', params)
}
