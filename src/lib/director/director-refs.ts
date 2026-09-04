// 약속 F·G(2026-09-04): Director 참조 override(shots.director_refs)의 순수 함수 — 클라(스토어)와 서버(참조 계획)가 같이 쓴다.
//   server-only 의존성 금지: 이 파일은 supabase admin 을 import 하지 않는다(shot-references.ts 는 서버 전용이라 스토어가 못 쓴다).
export interface DirectorRefs {
  characters: string[]
  locations: string[]
}

/** shots.director_refs 파싱 — 모양이 아니면 null(= override 없음). */
export function parseDirectorRefs(raw: unknown): DirectorRefs | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [])
  if (!Array.isArray(rec.characters) && !Array.isArray(rec.locations)) return null
  return { characters: list(rec.characters), locations: list(rec.locations) }
}

/**
 * 약속 F3: 지운 참조는 다음 실사 생성에 쓰이지 않는다 — 인물 목록 = shots.characters ∩ override.characters.
 *   Writer 가 나중에 인물을 더해도 사람이 뺀 목록이 우선이고, Writer 가 뺀 인물은 override 에 있어도 붙지 않는다.
 */
export function applyDirectorRefs(characters: readonly string[], refs: DirectorRefs | null): string[] {
  if (!refs) return [...characters]
  const keep = new Set(refs.characters)
  return characters.filter((id) => keep.has(id))
}

/** 배경 참조도 같은 규칙 — override 가 있고 locations 가 비었으면 배경을 붙이지 않는다. */
export function directorRefsExcludeWorld(refs: DirectorRefs | null): boolean {
  return refs !== null && refs.locations.length === 0
}
