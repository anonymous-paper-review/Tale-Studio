// Camera 위쪽 만들기 줄이 세는 범위(오너 2026-11-22 D2~D5) — 한 곳에서 자른다.
//   씬 단추로 "그 씬만" 셀지는 오너 답 뒤(리드 11/22, Director b1 과 한 질문) — 그때 범위(샷 노드 id 목록)만 넘기면 된다. null = 모든 씬.
//   약속: tests/camera/work-bar.test.ts
import type { DirectorShotState } from '@/lib/director/shot-state'

export function scopeShotStates(states: ReadonlyMap<string, DirectorShotState>, scope: readonly string[] | null): Map<string, DirectorShotState> {
  if (!scope) return new Map(states)
  const keep = new Set(scope)
  return new Map([...states].filter(([id]) => keep.has(id)))
}
