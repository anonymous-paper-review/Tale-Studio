// 시리즈 다음 화의 Artist 화면이 "그릴 그림 수"를 사실대로 보인다 — 새로 그리는 것 · 앞 화 그림을 그대로 쓰는 것 · 이 그림체로 다시 그리는 것 · 보관을 나눠 센다 (2026-10-27)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { seriesMakeCounts } from '@/features/series/artist-series'
import { breakdownRows } from '@/lib/artist/breakdown'
import { appearingIn, buildSeriesView } from '@/lib/series/view'
import { SERIES_VERSION, type SeriesSnapshot } from '@/lib/series/snapshot'
import { translate } from '@/lib/i18n'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
const STYLE_DIALOG = 'src/features/artist-room/style-make-dialog.tsx'
const ARTIST_PAGE = 'src/app/studio/artist/page.tsx'

/** 앞 화에서 이어받은 인물 · 배경을 만든다. 그림이 없는 것은 sheet · wide 를 null 로 준다. 앞 화 그림체는 2D 일본 애니. */
const snapshotOf = (
  people: Array<{ id: string; sheet?: string | null }>,
  places: Array<{ id: string; wide?: string | null }>,
): SeriesSnapshot => ({
  version: SERIES_VERSION,
  prevProjectId: 'prev-1',
  prevTitle: '첫 화',
  copiedAt: '2026-10-27T00:00:00.000Z',
  characters: people.map((person) => ({
    characterId: person.id,
    name: person.id,
    role: 'supporting',
    appearance: '',
    personality: [],
    sheetUrl: person.sheet === undefined ? `https://img.test/${person.id}.webp` : person.sheet,
    portraitUrl: null,
    styleId: 'jp_anime',
  })),
  locations: places.map((place) => ({
    locationId: place.id,
    name: place.id,
    description: '',
    wideShotUrl: place.wide === undefined ? `https://img.test/${place.id}.webp` : place.wide,
    styleId: 'jp_anime',
  })),
  voices: [],
  styleId: 'jp_anime',
  format: null,
  dialogueLanguage: null,
  continuesLastScene: false,
  copyFailures: [],
  designTokens: null,
})

/** 이번 화 산문. null 이면 산문이 아직 없다(누가 나올지 모른다). */
const viewOf = (
  series: SeriesSnapshot,
  currentStyleId: string | null,
  scenes: Array<{ characters_in_scene: string[]; location: string }> | null,
) =>
  buildSeriesView({
    series,
    prevProjectId: 'prev-1',
    prevDeleted: false,
    currentStyleId,
    appearance: appearingIn(scenes ? { scenes: { scenes } } : null),
  })

/** 화면 목록 — 이어받은 인물(미나 · 준호) · 배경(카페), 이번 화에 새로 나온 인물(소라) · 배경(옥상). */
const ROWS = breakdownRows(
  [
    { localId: 'series:mina', characterId: 'mina', name: '미나', entityType: 'person', appearance: '' },
    { localId: 'series:junho', characterId: 'junho', name: '준호', entityType: 'person', appearance: '' },
    { localId: 'sora-local', name: '소라', entityType: 'person', appearance: '' },
  ],
  [
    { localId: 'series:cafe', locationId: 'cafe', name: '카페', visualDescription: '' },
    { localId: 'roof-local', name: '옥상', visualDescription: '' },
  ],
)

const PREV = snapshotOf([{ id: 'mina' }, { id: 'junho' }], [{ id: 'cafe' }])
/** 미나와 카페만 이번 화에 나온다(준호는 안 나온다). */
const SCENES = [{ characters_in_scene: ['mina'], location: 'cafe' }]
/** 이어받은 셋이 모두 이번 화에 나온다. */
const ALL_SCENES = [{ characters_in_scene: ['mina', 'junho'], location: 'cafe' }]

describe('시리즈 다음 화의 Artist 화면이 보여 주는 그릴 그림 수', () => {
  it('시리즈가 아니면 모든 줄을 새로 그리는 것으로 센다', () => {
    // 왜: 첫 화 프로젝트는 이어받은 그림이 없다. 여기서 수가 줄면 만들기 창이 실제보다 적게 그린다고 알린다.
    expect(seriesMakeCounts(ROWS, null, 'jp_anime')).toEqual({ newPersons: 3, newPlaces: 2, reuse: 0, redraw: 0, kept: 0 })
  })

  it('이어받은 인물 · 배경이 같은 그림체면 앞 화 그림을 그대로 쓰는 것으로 센다', () => {
    // 왜: 2화에서 그림체를 안 바꾸면 이어받은 그림을 다시 그리지 않는다. 그런데도 만들기 창이 인물 3 · 배경 2로 보여 실제 그리는 수를 모른다.
    expect(seriesMakeCounts(ROWS, viewOf(PREV, 'jp_anime', ALL_SCENES), 'jp_anime')).toEqual({
      newPersons: 1,
      newPlaces: 1,
      reuse: 3,
      redraw: 0,
      kept: 0,
    })
  })

  it('이번 화에 안 나오는 이어받은 인물 · 배경이면 보관으로 센다', () => {
    // 왜: 1화에만 나온 인물은 이번 화에 그리지도 보여 주지도 않는다. 그릴 것으로 세면 머리 줄 수가 카드 수와 어긋난다.
    expect(seriesMakeCounts(ROWS, viewOf(PREV, 'jp_anime', SCENES), 'jp_anime')).toEqual({
      newPersons: 1,
      newPlaces: 1,
      reuse: 2,
      redraw: 0,
      kept: 1,
    })
  })

  it('그림체를 바꾸면 이번 화에 나오는 이어받은 것을 다시 그리는 것으로 센다', () => {
    // 왜: 그림체를 바꾼 화는 이어받은 그림까지 다시 그려 시간과 양이 달라진다. 보관은 그림체가 달라도 그대로 보관이다.
    expect(seriesMakeCounts(ROWS, viewOf(PREV, 'watercolor', SCENES), 'watercolor')).toEqual({
      newPersons: 1,
      newPlaces: 1,
      reuse: 0,
      redraw: 2,
      kept: 1,
    })
  })

  it('이어받았지만 앞 화 그림이 없으면 새로 그리는 것으로 센다', () => {
    // 왜: 앞 화 그림 복사에 실패한 인물 · 배경은 이번 화에서 처음부터 그린다. 그대로 쓴다고 세면 안 그려질 그림을 기다린다.
    const noImages = snapshotOf([{ id: 'mina', sheet: null }, { id: 'junho' }], [{ id: 'cafe', wide: null }])
    expect(seriesMakeCounts(ROWS, viewOf(noImages, 'jp_anime', ALL_SCENES), 'jp_anime')).toEqual({
      newPersons: 2,
      newPlaces: 2,
      reuse: 1,
      redraw: 0,
      kept: 0,
    })
  })

  it('산문이 아직 없어 나오는지 모르는 이어받은 것이면 보관으로 세지 않는다', () => {
    // 왜: 산문을 쓰기 전에는 누가 나올지 알 수 없다. 그때 보관으로 세면 이어받은 인물이 이번 화에서 사라진 것처럼 보인다.
    expect(seriesMakeCounts(ROWS, viewOf(PREV, 'jp_anime', null), 'jp_anime')).toEqual({
      newPersons: 1,
      newPlaces: 1,
      reuse: 3,
      redraw: 0,
      kept: 0,
    })
  })

  it('이어받은 인물 4 · 배경 4 중 인물 1 · 배경 3이 이번 화에 안 나오고 새 인물 1 · 새 배경 2가 있으면 새로 그리는 것은 인물 1 · 배경 2다', () => {
    // 왜: 오너가 2026-10-27에 본 실제 화면이다. 만들기 창은 인물 시트 5 · 배경 6으로 보였지만 실제로 새로 그린 것은 인물 1 · 배경 2뿐이었다.
    const prev = snapshotOf(
      [{ id: 'mina' }, { id: 'junho' }, { id: 'sora' }, { id: 'taeho' }],
      [{ id: 'cafe' }, { id: 'rooftop' }, { id: 'school' }, { id: 'park' }],
    )
    const rows = breakdownRows(
      [
        { localId: 'series:mina', characterId: 'mina', name: '미나', entityType: 'person', appearance: '' },
        { localId: 'series:junho', characterId: 'junho', name: '준호', entityType: 'person', appearance: '' },
        { localId: 'series:sora', characterId: 'sora', name: '소라', entityType: 'person', appearance: '' },
        { localId: 'series:taeho', characterId: 'taeho', name: '태호', entityType: 'person', appearance: '' },
        { localId: 'new-person', name: '새 인물', entityType: 'person', appearance: '' },
      ],
      [
        { localId: 'series:cafe', locationId: 'cafe', name: '카페', visualDescription: '' },
        { localId: 'series:rooftop', locationId: 'rooftop', name: '옥상', visualDescription: '' },
        { localId: 'series:school', locationId: 'school', name: '학교', visualDescription: '' },
        { localId: 'series:park', locationId: 'park', name: '공원', visualDescription: '' },
        { localId: 'new-place-1', name: '지하철', visualDescription: '' },
        { localId: 'new-place-2', name: '병원', visualDescription: '' },
      ],
    )
    // 이번 화 산문: 태호는 안 나오고 배경은 카페만 나온다.
    const scenes = [{ characters_in_scene: ['mina', 'junho', 'sora'], location: 'cafe' }]
    expect(seriesMakeCounts(rows, viewOf(prev, 'jp_anime', scenes), 'jp_anime')).toEqual({
      newPersons: 1,
      newPlaces: 2,
      reuse: 4,
      redraw: 0,
      kept: 4,
    })
  })

  it('만들기 창과 Artist 머리 줄을 보면 새로 그리는 수와 앞 화 그림 수를 따로 읽는다', () => {
    // 왜: 오너가 승인한 표시다. 만들기 창은 "새로 그리는 인물 시트 N · 배경 M" 과 "앞 화 그림" 칸을 따로 두고, 머리 줄은 이번 화 카드만 세고 보관 수를 뒤에 붙인다.
    const dialog = read(STYLE_DIALOG)
    expect(dialog).toMatch(/seriesMakeCounts\(/)
    expect(dialog).toMatch(/data-testid="artist-make-new"/)
    expect(dialog).toMatch(/data-testid="artist-make-prev"/)
    expect(dialog).toMatch(/t\('New character sheets \{persons\} · backgrounds \{places\}'/)
    expect(dialog).toMatch(/t\('Previous episode images'\)/)
    expect(dialog).toMatch(/t\('Used as is \{count\}'/)
    expect(dialog).toMatch(/t\('Redrawn in this style \{count\}'/)
    expect(dialog).toMatch(/t\('Kept \{count\}'/)
    // 시리즈가 아니면 지금 문구 그대로다.
    expect(dialog).toMatch(/t\('Character sheets \{persons\} · backgrounds \{places\}'/)

    const page = read(ARTIST_PAGE)
    expect(page).toMatch(/groupSeriesAssets\(/)
    expect(page).toMatch(/data-testid="artist-header-counts"/)
    expect(page).toMatch(/t\('Kept \{count\}'/)

    expect(translate('ko', 'New character sheets {persons} · backgrounds {places}', { persons: 1, places: 2 })).toBe('새로 그리는 인물 시트 1 · 배경 2')
    expect(translate('ko', 'Previous episode images')).toBe('앞 화 그림')
    expect(translate('ko', 'Used as is {count}', { count: 4 })).toBe('그대로 써요 4')
    expect(translate('ko', 'Redrawn in this style {count}', { count: 2 })).toBe('이 그림체로 다시 그려요 2')
    expect(translate('ko', 'Kept {count}', { count: 4 })).toBe('보관 4')
  })
})
