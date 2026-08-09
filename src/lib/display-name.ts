// 슬러그 → 표시 이름 폴백 (#opencast-name 2026-08-06).
//   오픈캐스트(writer가 전개상 추가한 인물/배경)는 id(slug)만 확실하고 표시 이름이 비거나
//   slug 그대로인 행이 생긴다("char_1"·"location_1"이 UI에 노출되던 버그). 데이터 생성부가
//   1차로 막고, 이미 저장된 레거시 행은 표시 시점에 이 폴백으로 사람이 읽는 이름을 만든다.
//   한국어 등 비슬러그 문자열은 그대로 통과한다(변형 없음).

/** "abandoned_subway" → "Abandoned Subway", "location_1" → "Location 1". 한글 등은 무변형. */
export function humanizeSlug(slug: string): string {
  return slug
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** 표시 이름 선택: 실제 이름이 있으면 그대로, 비었거나 id(slug) 반복이면 humanize(id). */
export function displayNameOf(name: string | null | undefined, id: string): string {
  const n = (name ?? '').trim()
  if (n && n.toLowerCase() !== id.toLowerCase().trim()) return n
  return humanizeSlug(n || id)
}
