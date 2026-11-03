// Artist 걸러 보기(v3 A5, 오너 2026-11-03) — 모두 · 인물 · 배경. 인물 칸은 예전 등장인물 탭과 같은 카드(사람 · 예전 흐름의 사물),
//   배경 칸은 예전 배경 탭과 같은 카드다. 칸의 숫자는 그 칸을 골랐을 때 보이는 카드 수(보관 카드 포함).
//   고른 칸은 artist-store 의 uiTab 이 기억한다(약속 D15). 약속: tests/artist/card-filter.test.ts
export const ARTIST_FILTERS = ['all', 'characters', 'world'] as const
export type ArtistFilter = (typeof ARTIST_FILTERS)[number]

/** 그 칸을 고르면 어느 카드 묶음을 보이나. */
export function artistFilterShows(filter: ArtistFilter): { characters: boolean; world: boolean } {
  return { characters: filter !== 'world', world: filter !== 'characters' }
}

/** 칸마다 보이는 카드 수 — 인물 카드 수 · 배경 카드 수에서. */
export function artistFilterCounts(input: { characters: number; worlds: number }): Record<ArtistFilter, number> {
  return { all: input.characters + input.worlds, characters: input.characters, world: input.worlds }
}
