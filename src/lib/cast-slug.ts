// cast-slug — 캐스트 이름 → character_id slug 생성 (producer 소유, producer-story-gate §3).
//   storage 경로·씬 참조가 전부 slug 기준이므로 ascii-safe 해야 한다 → 비-ascii(한글 등)는 제거.
//   결과가 비면(예: 순수 한글 이름) 'char' 로 폴백하고, 중복은 _2, _3… suffix 로 푼다.
//   slug 는 생성 후 불변(rename 은 표시명 name 만 변경) — OQ3 결정.

export function slugifyName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '') // ascii 영숫자/공백/_/- 만 남김 (한글·기호 제거)
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || 'char'
}

/**
 * 캐스트 배열에 character_id 를 부여. 이미 있으면 유지, 없으면 name 기반 생성 + 중복 suffix.
 * 입력 순서대로 결정적(deterministic)으로 부여한다.
 */
export function assignCastSlugs<T extends { name: string; characterId?: string }>(
  cast: T[],
): (T & { character_id: string })[] {
  const used = new Set<string>()
  return cast.map((m) => {
    const base = m.characterId?.trim() || slugifyName(m.name)
    let slug = base
    let n = 2
    while (used.has(slug)) slug = `${base}_${n++}`
    used.add(slug)
    return { ...m, character_id: slug }
  })
}
