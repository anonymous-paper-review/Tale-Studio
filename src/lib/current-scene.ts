// 씬 단추를 쓰는 화면(Director 노드 보기 · Camera)이 들어올 때 여는 씬을 고른다(오너 D8 2026-11-22).
//   기억은 stores/current-scene-store.ts(프로젝트마다 하나, 이 브라우저에만). 약속: tests/director/current-scene.test.ts

/**
 * 열 씬. 기억한 씬(다시 들어옴) > 먼저 보여 줄 씬(처음 여는 프로젝트에서 화면이 정한 것) > 첫 씬.
 * 목록(keys, 씬 순서)에 없는 값은 건너뛴다 — Writer 에서 지운 씬을 기억하고 있어도 빈 판이 되지 않는다. 씬이 없으면 null.
 */
export function resolveCurrentScene(
  keys: readonly string[],
  remembered: string | null | undefined,
  preferred?: string | null,
): string | null {
  if (keys.length === 0) return null
  if (remembered && keys.includes(remembered)) return remembered
  if (preferred && keys.includes(preferred)) return preferred
  return keys[0] ?? null
}
