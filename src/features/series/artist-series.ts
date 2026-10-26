// 시리즈 다음 화의 Artist 카드 묶기(2026-10-26) — 인물 · 배경 카드마다 앞 화에서 이어받았나 · 이번 화에 안 나와 보관인가 ·
//   이어받은 그림을 어떻게 쓰나를 정하고, 목록 맨 아래 "보관" 묶음에 내릴 카드를 모은다. 순수 함수 — 화면이 읽기만 한다.
//   그림 카드(character-panel · world-panel)와 그 앞의 브레이크다운 글 목록(프로토타입 A1s)이 같은 규칙을 쓴다.
//   약속: tests/artist/series-artist-view.test.ts
import { seriesImageUse, type SeriesImageUse } from '@/lib/series/snapshot'
import type { SeriesView, SeriesViewItem } from '@/lib/series/view'

export interface SeriesAssetMark {
  /** 앞 화에서 이어받은 카드다. */
  inherited: boolean
  /** 이번 화 산문에 안 나와 보관한다 — 그림은 그대로 두고 다음 화로 넘긴다. */
  kept: boolean
  /** 이어받은 그림을 이 화에서 어떻게 쓰나(reuse · redraw · none). 이어받지 않았거나 산문이 아직 없으면 null. */
  use: SeriesImageUse | null
}

export interface SeriesAssetGroups {
  /** 앞 화에서 이어받은 다음 화인가. false 면 화면은 지금 그대로다. */
  series: boolean
  characters: Record<string, SeriesAssetMark>
  locations: Record<string, SeriesAssetMark>
  /** 목록 맨 아래 "보관" 묶음에 내릴 카드 번호 — 화면 목록 순서 그대로. */
  keptCharacters: string[]
  keptLocations: string[]
}

const NOT_INHERITED: SeriesAssetMark = { inherited: false, kept: false, use: null }

function markOne(item: SeriesViewItem | undefined): SeriesAssetMark {
  if (!item) return NOT_INHERITED
  // 산문이 아직 없으면 appearing 이 null 이다 — 안 나온다고 단정할 근거가 없어 보관으로 묶지 않는다.
  return { inherited: true, kept: item.appearing === false, use: item.use }
}

function markAll(items: SeriesViewItem[], ids: string[]): { marks: Record<string, SeriesAssetMark>; kept: string[] } {
  const byId = new Map(items.map((item) => [item.id, item]))
  const marks: Record<string, SeriesAssetMark> = {}
  const kept: string[] = []
  for (const id of ids) {
    const mark = markOne(byId.get(id))
    marks[id] = mark
    if (mark.kept) kept.push(id)
  }
  return { marks, kept }
}

/** 화면에 있는 인물 · 배경 카드 번호를 시리즈 정보와 맞춘다. 시리즈가 아니면(view null) 모두 이어받지 않은 카드다. */
export function groupSeriesAssets(
  view: SeriesView | null,
  ids: { characters: string[]; locations: string[] },
): SeriesAssetGroups {
  const characters = markAll(view?.characters ?? [], ids.characters)
  const locations = markAll(view?.locations ?? [], ids.locations)
  return {
    series: !!view,
    characters: characters.marks,
    locations: locations.marks,
    keptCharacters: characters.kept,
    keptLocations: locations.kept,
  }
}

type BreakdownLike = { kind: 'person' | 'background'; refId: string | null }

/** 브레이크다운 글 목록을 이번 화 목록(shown)과 "보관" 묶음(kept)으로 나눈다. 줄마다 앞 화에서 이어받았나를 붙인다. 순서는 그대로. */
export function splitBreakdownRows<T extends BreakdownLike>(
  rows: readonly T[],
  view: SeriesView | null,
): { shown: Array<T & { inherited: boolean }>; kept: Array<T & { inherited: boolean }> } {
  const ids = (kind: BreakdownLike['kind']) => rows.flatMap((row) => (row.kind === kind && row.refId ? [row.refId] : []))
  const groups = groupSeriesAssets(view, { characters: ids('person'), locations: ids('background') })
  const shown: Array<T & { inherited: boolean }> = []
  const kept: Array<T & { inherited: boolean }> = []
  for (const row of rows) {
    const mark = row.refId ? (row.kind === 'person' ? groups.characters : groups.locations)[row.refId] : undefined
    const marked = { ...row, inherited: mark?.inherited ?? false }
    if (mark?.kept) kept.push(marked)
    else shown.push(marked)
  }
  return { shown, kept }
}

export type SeriesMakingTitle = 'Drawing only the new ones' | 'Redrawing from the previous episode images'

/** Artist [만들기] 진행 상자 제목(프로토타입 A4s · A4r). 시리즈가 아니면 null(지금 제목 그대로).
 *  그림체는 화면에서 방금 고른 값으로 본다 — 시리즈 정보는 화면을 열 때 한 번 읽어서 그 뒤 바꾼 그림체를 모른다. */
export function seriesMakingTitle(view: SeriesView | null, currentStyleId: string | null): SeriesMakingTitle | null {
  if (!view) return null
  const redraw = [...view.characters, ...view.locations].some(
    (item) => item.appearing === true && seriesImageUse({ styleId: item.styleId, image: item.imageUrl }, { currentStyleId, appears: true }) === 'redraw',
  )
  return redraw ? 'Redrawing from the previous episode images' : 'Drawing only the new ones'
}
