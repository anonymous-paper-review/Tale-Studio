// 시리즈 다음 화의 Artist 화면 — 이어받은 인물 · 배경 카드 표시, 보관 묶음, 그림체가 다를 때의 다시 그리기 알림 (2026-10-26)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { groupSeriesAssets, seriesMakingTitle, splitBreakdownRows } from '@/features/series/artist-series'
import { breakdownRows } from '@/lib/artist/breakdown'
import { appearingIn, buildSeriesView } from '@/lib/series/view'
import { SERIES_VERSION, type SeriesSnapshot } from '@/lib/series/snapshot'
import { translate } from '@/lib/i18n'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
const CHARACTER_PANEL = 'src/features/artist/character-panel.tsx'
const WORLD_PANEL = 'src/features/artist/world-panel.tsx'
const STYLE_DIALOG = 'src/features/artist-room/style-make-dialog.tsx'

/** 앞 화에서 이어받은 것 — 인물 2명(미나 · 준호) · 배경 1곳(카페), 앞 화 그림체는 2D 일본 애니. */
const PREV: SeriesSnapshot = {
  version: SERIES_VERSION,
  prevProjectId: 'prev-1',
  prevTitle: '첫 화',
  copiedAt: '2026-10-26T00:00:00.000Z',
  characters: [
    { characterId: 'mina', name: '미나', role: 'protagonist', appearance: '', personality: [], sheetUrl: 'https://img.test/mina.webp', portraitUrl: null, styleId: 'jp_anime' },
    { characterId: 'junho', name: '준호', role: 'supporting', appearance: '', personality: [], sheetUrl: 'https://img.test/junho.webp', portraitUrl: null, styleId: 'jp_anime' },
  ],
  locations: [{ locationId: 'cafe', name: '카페', description: '', wideShotUrl: 'https://img.test/cafe.webp', styleId: 'jp_anime' }],
  voices: [],
  styleId: 'jp_anime',
  format: null,
  dialogueLanguage: null,
  continuesLastScene: false,
  copyFailures: [],
  designTokens: null,
  world: null,
}

/** 이번 화 산문 — 미나와 카페만 나온다(준호는 안 나온다). null 이면 산문이 아직 없다. */
const thisEpisode = (scenes: Array<{ characters_in_scene: string[]; location: string }> | null) =>
  appearingIn(scenes ? { scenes: { scenes } } : null)

const viewOf = (currentStyleId: string | null, scenes: Array<{ characters_in_scene: string[]; location: string }> | null) =>
  buildSeriesView({ series: PREV, prevProjectId: 'prev-1', prevDeleted: false, currentStyleId, appearance: thisEpisode(scenes) })

const SCENES = [{ characters_in_scene: ['mina'], location: 'cafe' }]
const SCREEN = { characters: ['mina', 'junho', 'sora'], locations: ['cafe', 'rooftop'] }

describe('시리즈 다음 화의 Artist 인물 · 배경 카드', () => {
  it('이번 화 산문에 안 나오는 이어받은 인물 · 배경은 보관 묶음으로 따로 보여 준다', () => {
    // 왜: 1화에만 나온 인물을 2화 목록에 그대로 두면 이번 화에 쓰지도 않을 그림을 다시 그리게 된다.
    const groups = groupSeriesAssets(viewOf('jp_anime', SCENES), SCREEN)
    expect(groups.characters.mina).toMatchObject({ inherited: true, kept: false })
    expect(groups.characters.junho).toMatchObject({ inherited: true, kept: true })
    expect(groups.characters.sora).toMatchObject({ inherited: false, kept: false })
    expect(groups.keptCharacters).toEqual(['junho'])
    // 이번 화 산문에 안 나오는 배경도 같다.
    const noCafe = groupSeriesAssets(viewOf('jp_anime', [{ characters_in_scene: ['mina'], location: 'rooftop' }]), SCREEN)
    expect(noCafe.locations.cafe).toMatchObject({ inherited: true, kept: true })
    expect(noCafe.keptLocations).toEqual(['cafe'])

    // 카드 목록은 보관 카드를 맨 아래 따로 모아 보이고, 카드 자체는 지금 카드 그대로 쓴다(지우지 않는다).
    for (const file of [CHARACTER_PANEL, WORLD_PANEL]) {
      const panel = read(file)
      expect(panel, file).toMatch(/groupSeriesAssets\(/)
      expect(panel, file).toMatch(/data-testid="artist-series-kept"/)
      expect(panel, file).toMatch(/t\('Kept'\)/)
      expect(panel, file).toMatch(/t\('Not in this episode\. The picture stays as it is and carries over to the next episode\.'\)/)
      // 보관 묶음도 살아 있는 목록과 같은 카드 함수로 그린다.
      expect(panel, file).toMatch(/liveCards\.map\(card\)/)
      expect(panel, file).toMatch(/keptCards\.map\(card\)/)
    }
    expect(translate('ko', 'Kept')).toBe('보관')
    expect(translate('ko', 'Not in this episode. The picture stays as it is and carries over to the next episode.')).toBe('이번 화에 안 나와요. 그림은 그대로 두고 다음 화로 넘겨요.')
  })

  it('그림체가 달라 다시 그리는 이어받은 카드에는 앞 화 그림을 참고해 다시 그린다고 알린다', () => {
    // 왜: 그림체를 바꾼 2화에서 이어받은 그림이 그대로 보이면 바뀌지 않았다고 오해한다.
    const same = groupSeriesAssets(viewOf('jp_anime', SCENES), SCREEN)
    expect(same.characters.mina.use).toBe('reuse')
    const changed = groupSeriesAssets(viewOf('watercolor', SCENES), SCREEN)
    expect(changed.characters.mina.use).toBe('redraw')
    expect(changed.locations.cafe.use).toBe('redraw')
    // 이번 화에 안 나오는 이어받은 카드는 그림체가 달라도 다시 그리지 않는다.
    expect(changed.characters.junho.use).toBe('reuse')

    for (const file of [CHARACTER_PANEL, WORLD_PANEL]) {
      const panel = read(file)
      expect(panel, file).toMatch(/use === 'redraw'/)
      expect(panel, file).toMatch(/t\('We redraw it in this episode style using the previous picture as the guide'\)/)
      expect(panel, file).toMatch(/t\('Carried over from the previous episode'\)/)
    }
    // 그림체 팝업: 앞 화 그림체로 시작하고(복사된 style_anchor_key), 그 자리에 표시와 안내가 붙는다.
    const dialog = read(STYLE_DIALOG)
    expect(dialog).toMatch(/useState<string \| null>\(savedKey\)/)
    expect(dialog).toMatch(/if \(open\) setPicked\(savedKey\)/)
    expect(dialog).toMatch(/t\('Previous episode style'\)/)
    expect(dialog).toMatch(/t\('If the style stays the same, the carried-over pictures are used as they are\. If you change it, the carried-over characters and backgrounds in this episode are redrawn in this style\.'\)/)
    // 올린 그림체가 잠긴 프로젝트에서는 지금처럼 못 바꾼다.
    expect(dialog).toMatch(/disabled=\{locked \|\| !!custom\}/)

    expect(translate('ko', 'Carried over from the previous episode')).toBe('앞 화에서 이어받음')
    expect(translate('ko', 'We redraw it in this episode style using the previous picture as the guide')).toBe('앞 화 그림을 참고해 이 화 그림체로 다시 그려요')
    expect(translate('ko', 'Previous episode style')).toBe('앞 화 그림체')
    expect(translate('ko', 'If the style stays the same, the carried-over pictures are used as they are. If you change it, the carried-over characters and backgrounds in this episode are redrawn in this style.')).toBe(
      '같은 그림체면 이어받은 그림을 그대로 써요. 바꾸면 이번 화에 나오는 이어받은 인물·배경을 이 그림체로 다시 그려요.',
    )
  })

  it('산문이 아직 없으면 이어받은 카드를 보관으로 묶지 않는다', () => {
    // 왜: 산문을 쓰기 전에는 누가 나올지 알 수 없다 — 그때 보관으로 내리면 이번 화 인물이 아래로 숨는다.
    const groups = groupSeriesAssets(viewOf('jp_anime', null), SCREEN)
    expect(groups.characters.junho).toMatchObject({ inherited: true, kept: false, use: null })
    expect(groups.locations.cafe).toMatchObject({ inherited: true, kept: false, use: null })
    expect(groups.keptCharacters).toEqual([])
    expect(groups.keptLocations).toEqual([])
  })

  it('시리즈가 아닌 프로젝트의 Artist 화면은 그대로다', () => {
    // 왜: 첫 화 프로젝트에 이어받음 표시나 보관 묶음이 뜨면 없는 앞 화를 가리키게 된다.
    const groups = groupSeriesAssets(null, SCREEN)
    expect(groups.series).toBe(false)
    for (const id of SCREEN.characters) expect(groups.characters[id]).toMatchObject({ inherited: false, kept: false, use: null })
    for (const id of SCREEN.locations) expect(groups.locations[id]).toMatchObject({ inherited: false, kept: false, use: null })
    expect(groups.keptCharacters).toEqual([])
    expect(groups.keptLocations).toEqual([])
    // 표시 · 묶음 · 안내는 모두 이어받은 카드와 보관 카드가 있을 때만 그린다.
    for (const file of [CHARACTER_PANEL, WORLD_PANEL]) {
      const panel = read(file)
      expect(panel, file).toMatch(/mark\.inherited \?/)
      expect(panel, file).toMatch(/keptCards\.length > 0 \?/)
    }
    expect(read(STYLE_DIALOG)).toMatch(/prevStyleId \? /)
  })
})

describe('시리즈 다음 화의 브레이크다운 목록', () => {
  // 이번 화 목록: 이어받은 미나 · 준호 · 카페, 새로 나온 소라 · 옥상.
  const rows = breakdownRows(
    [
      { localId: 'series:mina', characterId: 'mina', name: '미나', entityType: 'person', appearance: '' },
      { localId: 'series:junho', characterId: 'junho', name: '준호', entityType: 'person', appearance: '' },
      { localId: 'sora-local', characterId: 'sora', name: '소라', entityType: 'person', appearance: '' },
    ],
    [
      { localId: 'series:cafe', locationId: 'cafe', name: '카페', visualDescription: '' },
      { localId: 'roof-local', name: '옥상', visualDescription: '' },
    ],
  )

  it('다음 화의 브레이크다운이면 이어받은 인물 · 배경 줄에 표시가 붙고 이번 산문에 안 나오는 것은 보관 묶음으로 내린다', () => {
    // 왜: 목록을 확인하는 화면에서 앞 화 인물과 새 인물을 구별해야 한다. 이번 화에 안 나오는 것은 그리지 않고 다음 화로 넘긴다(프로토타입 A1s).
    const split = splitBreakdownRows(rows, viewOf('jp_anime', SCENES))
    expect(split.shown.map((row) => [row.name, row.inherited])).toEqual([
      ['미나', true],
      ['소라', false],
      ['카페', true],
      ['옥상', false],
    ])
    expect(split.kept.map((row) => [row.name, row.inherited])).toEqual([['준호', true]])
  })

  it('시리즈가 아니면 브레이크다운 목록은 지금과 같다', () => {
    // 왜: 첫 화 프로젝트에 이어받음 표시나 보관 묶음이 뜨면 없는 앞 화를 가리키게 된다.
    const split = splitBreakdownRows(rows, null)
    expect(split.shown.map((row) => [row.name, row.inherited])).toEqual([
      ['미나', false],
      ['준호', false],
      ['소라', false],
      ['카페', false],
      ['옥상', false],
    ])
    expect(split.kept).toEqual([])
  })

  it('다음 화에서 그림을 만드는 동안 새로 나온 것만 그리는지 앞 화 그림을 참고해 다시 그리는지 알려 준다', () => {
    // 왜: 다음 화는 이어받은 그림을 그대로 쓰는 일이 많다. 무엇을 그리는지 안 보이면 이어받은 그림까지 다시 그린다고 오해한다(프로토타입 A4s · A4r).
    // 같은 그림체면 이어받은 그림을 그대로 쓰고 새로 나온 것만 그린다.
    expect(seriesMakingTitle(viewOf('jp_anime', SCENES), 'jp_anime')).toBe('Drawing only the new ones')
    // 그림체를 바꾸면 이번 화에 나오는 이어받은 인물 · 배경을 다시 그린다. 화면에서 방금 고른 그림체로 판단한다.
    expect(seriesMakingTitle(viewOf('jp_anime', SCENES), 'watercolor')).toBe('Redrawing from the previous episode images')
    // 그림체가 달라도 이번 화에 나오는 이어받은 것이 없으면(모두 보관) 다시 그릴 것이 없다.
    expect(seriesMakingTitle(viewOf('jp_anime', [{ characters_in_scene: ['sora'], location: 'rooftop' }]), 'watercolor')).toBe('Drawing only the new ones')
    // 시리즈가 아니면 지금 제목 그대로다.
    expect(seriesMakingTitle(null, 'jp_anime')).toBeNull()

    expect(translate('ko', 'Drawing only the new ones')).toBe('새로 나온 것만 그리고 있어요')
    expect(translate('ko', 'Redrawing from the previous episode images')).toBe('앞 화 그림을 참고해 다시 그리고 있어요')
    expect(read('src/app/studio/artist/page.tsx')).toContain('seriesMakingTitle(')
  })
})
