// Artist 걸러 보기(v3 A5, 오너 2026-11-03) — 모두 · 인물 · 배경. 인물 칸은 예전 등장인물 탭과 같은 카드(사람 · 예전 흐름의 사물),
//   배경 칸은 예전 배경 탭과 같은 카드다. 칸의 숫자는 그 칸을 골랐을 때 보이는 카드 수(보관 카드 포함).
//   고른 칸은 artist-store 의 uiTab 이 기억한다(약속 D15). 약속: tests/artist/card-filter.test.ts
//   칸을 바꿔도 계속 보이는 묶음은 새로 그리지 않는다(검토 A M1) — 묶음마다 이름이 고정이라 그 카드의 채팅 대상 · 고른 모습이 남는다.
export const ARTIST_FILTERS = ['all', 'characters', 'world'] as const
export type ArtistFilter = (typeof ARTIST_FILTERS)[number]

/** 그 칸을 고르면 어느 카드 묶음을 보이나. */
export function artistFilterShows(filter: ArtistFilter): { characters: boolean; world: boolean } {
  return { characters: filter !== 'world', world: filter !== 'characters' }
}

/** 칸을 prev 에서 next 로 바꿀 때 보이는 묶음(인물 · 배경 순서). key 는 묶음 이름이라 계속 보이는 묶음은 그대로 남는다.
 *  entering = 앞 칸에서는 안 보이다 이번에 보이게 된 묶음 — 미끄러짐 효과는 이 묶음에만 준다. */
export function artistFilterPanels(prev: ArtistFilter, next: ArtistFilter): { key: 'characters' | 'world'; entering: boolean }[] {
  const before = artistFilterShows(prev)
  const after = artistFilterShows(next)
  return (['characters', 'world'] as const).filter((key) => after[key]).map((key) => ({ key, entering: !before[key] }))
}

/** 칸마다 보이는 카드 수 — 인물 카드 수 · 배경 카드 수에서. */
export function artistFilterCounts(input: { characters: number; worlds: number }): Record<ArtistFilter, number> {
  return { all: input.characters + input.worlds, characters: input.characters, world: input.worlds }
}
