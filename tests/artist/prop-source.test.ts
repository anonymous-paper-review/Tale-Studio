// 소품을 만드는 출처(지금 Producer 사물 카드 · 오너가 고를 A 샷에서 두 번 이상 · B [브레이크다운하기]로 산문을 확정할 때 AI 가 고름)를 바꿔도 카드 · 그림 · 실사 참고가 props 행만 읽고 똑같이 도는지 검사한다 (D7 결정 1, 리드 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { ArtistSectionHeading } from '@/features/artist/section-heading'
import { ACTIVE_PROP_SOURCE, PROP_EMPTY_LINE, PROP_SOURCE_ORIGIN, propEmptyLine } from '@/lib/artist/prop-source'
import { propAssetsFromRows, propsToAutoDraw, propUsage, type PropRow } from '@/lib/artist/props'
import { planSheetPropRefs, planShotPropRefs } from '@/lib/director/shot-prop-refs'
import { translate } from '@/lib/i18n/translate'
import { useLocaleStore } from '@/stores/locale-store'

const row = (over: Partial<PropRow> = {}): PropRow => ({
  prop_id: 'pocket_watch',
  name: '회중시계',
  appearance: 'an old silver pocket watch',
  appearance_native: '낡은 은빛 회중시계',
  image_url: null,
  source_hash: null,
  origin: 'producer',
  ...over,
})
const rowsFrom = (origin: string | null): PropRow[] => [
  row({ origin }),
  row({ prop_id: 'old_letter', name: '누런 편지', appearance: 'a yellowed folded letter', appearance_native: '누렇게 바랜 편지', image_url: 'https://media.test/letter.png', origin }),
]
const initialLocale = useLocaleStore.getInitialState().locale
afterEach(() => {
  useLocaleStore.setState({ locale: initialLocale })
  Object.assign(useLocaleStore.getInitialState(), { locale: initialLocale })
})

describe('소품 출처 바꾸기', () => {
  // 왜: 오너가 소품 출처를 정하기 전이다(지금 Producer 사물 카드 / A 샷 소품 칸에서 두 샷 이상 / B [브레이크다운하기]로 산문을 확정할 때 AI 가 이야기에서 3~5개 — O1 2026-11-26 로 디자인과 함께 옮겨 감).
  //   어느 출처든 props 행만 넣으면 카드 · 저절로 그리기 · 실사 참고가 지금 그대로 돌아야 출처만 갈아 끼울 수 있다.
  it('소품 행이 어디서 왔든 카드 · 저절로 그리기 · 실사 참고가 똑같이 돈다', () => {
    const scenes = [{ sceneId: 'sc_01', charactersPresent: ['min_ji'] }]
    const shots = [{ shotId: 'sh_01_01', sceneId: 'sc_01', propPlacement: [{ prop: 'old_letter' }, { prop: 'Pocket Watch' }] }]
    const spec = { prop_placement: [{ prop: 'old_letter', position_in_frame: 'left_third' }, { prop: 'the pocket_watch' }] }
    const outcomes = ['producer', 'writer', 'user', 'ai', null].map((origin) => {
      const assets = propAssetsFromRows(rowsFrom(origin), new Set(['min_ji']))
      const drawn = assets.map((asset) => ({ propId: asset.propId, name: asset.name, imageUrl: asset.imageUrl ?? `https://media.test/${asset.propId}.png` }))
      return {
        cards: assets.map(({ origin: _origin, ...card }) => card),
        autoDraw: propsToAutoDraw(assets, { generating: [], failures: {}, tried: new Set() }),
        usage: propUsage(assets, scenes, shots),
        shotRefs: planShotPropRefs(spec, drawn),
        sheetRefs: planSheetPropRefs([spec, { prop_placement: [] }], drawn),
      }
    })
    for (const outcome of outcomes.slice(1)) expect(outcome).toEqual(outcomes[0])
    expect(outcomes[0].cards.map((card) => card.propId)).toEqual(['pocket_watch', 'old_letter'])
    expect(outcomes[0].autoDraw).toEqual(['pocket_watch'])
    expect(outcomes[0].shotRefs.map((ref) => ref.propId)).toEqual(['old_letter', 'pocket_watch'])
  })

  // 왜: 다음 출처가 들어올 때 "Producer 에서 온 것만"처럼 출처 칸으로 거르면 A · B 소품이 조용히 빠진다 —
  //   카드(화면 읽기) · 서버 첫 그림 · 그리기 창구 · 실사 참고가 소품 행을 출처 칸으로 거르지 않게 묶어 둔다.
  it('카드 · 서버 첫 그림 · 실사 참고는 소품 행을 출처로 거르지 않는다', () => {
    const files = ['src/stores/artist-store.ts', 'src/lib/artist/prop-drafts.ts', 'src/lib/artist/prop-jobs.ts', 'src/lib/director/shot-references.ts']
    let queries = 0
    for (const file of files) {
      const chunks = readFileSync(file, 'utf8').split(".from('props')").slice(1).map((rest) => rest.slice(0, 400))
      queries += chunks.length
      for (const chunk of chunks) expect(chunk, file).not.toMatch(/\.(eq|neq|in|not|filter|match)\(\s*'origin'/)
    }
    expect(queries).toBeGreaterThanOrEqual(5)
    for (const file of ['src/lib/artist/props.ts', 'src/lib/director/shot-prop-refs.ts', 'src/lib/artist/prop-drafts.ts']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/origin\s*[!=]==/)
    }
  })

  // 왜: 출처는 한 곳(prop-source.ts)에서 고른다 — 오너 E5(2026-11-22 "추천대로" = B)로 AI 가 이야기에서 고른다(Producer 사물은 늘 함께).
  //   고르는 때는 O1(2026-11-26 "콘티를 Artist 앞에")로 [만들기]가 아니라 [브레이크다운하기]로 산문을 확정할 때다(디자인 단계와 함께 옮겨 감). 출처가 바뀌면 화면 말 중 바뀌는 것은
  //   소품 묶음이 비었을 때 한 줄뿐이라 그 줄도 출처를 따른다(출처를 바꾸면서 그 줄을 안 넣으면 여기서 막힌다).
  //   A · B 는 Writer 가 만든 것이라 DB 출처 칸은 writer — 지금 DB 가 받는 값(producer · writer · user)이라 마이그레이션이 없다.
  it('소품 출처는 한 곳에서 고르고 지금은 [브레이크다운하기]로 산문을 확정할 때 AI 가 이야기에서 고르는 것이며, 소품이 없을 때 안내도 그 출처의 말이다', () => {
    expect(ACTIVE_PROP_SOURCE).toBe('story_pick')
    expect(Object.keys(PROP_SOURCE_ORIGIN).sort()).toEqual(['producer_cards', 'repeated_in_shots', 'story_pick'])
    for (const origin of Object.values(PROP_SOURCE_ORIGIN)) expect(['producer', 'writer', 'user']).toContain(origin)
    const line = PROP_EMPTY_LINE[ACTIVE_PROP_SOURCE]
    expect(line).toBeTruthy()
    expect(propEmptyLine()).toBe(line)
    expect(translate('ko', line as string)).not.toBe(line)
    for (const locale of ['ko', 'en'] as const) {
      useLocaleStore.setState({ locale })
      Object.assign(useLocaleStore.getInitialState(), { locale })
      const html = renderToStaticMarkup(createElement(ArtistSectionHeading, { section: 'props', count: 0 }))
      expect(html).toContain(translate(locale, line as string))
    }
  })
})
