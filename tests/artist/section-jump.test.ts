// Artist 한 페이지의 단추 줄 — 지금 보는 묶음의 단추가 켜지고, Alt+←/→ 는 앞 · 뒤 묶음으로 가며, 축척은 세 묶음을 함께 바꾸고, 카드 없는 묶음도 안내 한 줄을 보인다 (D13 혼자 정한 것, 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { activeArtistSection, keyScrollsArtistBoard, shownArtistSection, type ArtistSection } from '@/lib/artist/card-filter'
import { ArtistSectionHeading } from '@/features/artist/section-heading'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

const page = () => readFileSync('src/app/studio/artist/page.tsx', 'utf8')
const tops: Array<{ section: ArtistSection; top: number }> = [
  { section: 'characters', top: 100 },
  { section: 'world', top: 900 },
  { section: 'props', top: 1500 },
]
const view = (scrollTop: number, scrollHeight = 2600) => ({ scrollTop, clientHeight: 700, scrollHeight, offset: 60 })

/** 정적 그리기는 스토어의 처음 값을 읽는다 — 화면 말을 처음 값에도 맞춘다(다른 화면 테스트와 같은 방법). */
const setLocale = (locale: 'ko' | 'en') => {
  useLocaleStore.setState({ locale })
  Object.assign(useLocaleStore.getInitialState(), { locale })
}
afterEach(() => setLocale('en'))

describe('지금 보는 묶음', () => {
  // 왜: 단추 줄이 위에 붙어 있어도 지금 어느 묶음을 보는지 알게 — 단추 줄 바로 아래(화면 위쪽)에 걸친 묶음이 지금 묶음이다.
  it('화면 위쪽에 걸친 묶음의 단추가 켜진다', () => {
    expect(activeArtistSection(tops, view(0))).toBe('characters')
    expect(activeArtistSection(tops, view(839))).toBe('characters')
    expect(activeArtistSection(tops, view(840))).toBe('world')
    expect(activeArtistSection(tops, view(1440))).toBe('props')
  })

  // 왜: 마지막 묶음이 짧으면 그 머리가 화면 위쪽까지 올라오지 못한다 — 맨 아래까지 내렸으면 마지막 묶음을 켠다.
  it('맨 아래까지 내리면 마지막 묶음 단추가 켜진다', () => {
    const shortLast = [...tops.slice(0, 2), { section: 'props' as const, top: 2350 }]
    expect(activeArtistSection(shortLast, view(1890, 2600))).toBe('world')
    expect(activeArtistSection(shortLast, view(1900, 2600))).toBe('props')
  })

  // 왜: 정상 경로 고정 — 묶음 자리를 아직 못 쟀으면(그려지기 전) 첫 묶음이다.
  it('묶음 자리를 모르면 첫 묶음 단추가 켜진다', () => {
    expect(activeArtistSection([], view(500))).toBe('characters')
  })

  // 왜: 카드가 적어 페이지가 짧으면 [배경]을 눌러도 맨 아래에 닿아 "맨 아래 = 마지막 묶음" 규칙이 [소품]을 켰다(2026-11-22 화면 확인).
  //   누른 단추는 사람이 휠 · 손가락 · 스크롤 키로 직접 움직이기 전까지 켜 둔다. 좌우 화살표(Alt+←/→ 묶음 이동)는 스크롤이 아니다.
  it('누른 묶음 단추는 사람이 직접 스크롤하기 전까지 켜져 있다', () => {
    expect(shownArtistSection('world', 'props')).toBe('world')
    expect(shownArtistSection(null, 'props')).toBe('props')
    for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']) expect(keyScrollsArtistBoard(key)).toBe(true)
    for (const key of ['ArrowLeft', 'ArrowRight', 'Enter', 'a']) expect(keyScrollsArtistBoard(key)).toBe(false)
    const src = page()
    for (const event of ['wheel', 'touchstart', 'pointerdown']) expect(src).toContain(`scroller.addEventListener('${event}', unpin`)
  })
})

describe('단추 줄', () => {
  // 왜: 예전 칸 순환(Alt+←/→, #keyboard-only 2026-08-11)의 한 페이지판 — 키보드만으로 묶음을 오간다.
  it('Alt+←/→ 를 누르면 앞 · 뒤 묶음으로 간다', () => {
    expect(page()).toMatch(/useAltArrowCycle\(ARTIST_SECTIONS, active, jumpTo\)/)
  })

  // 왜: 예전 "모두" 칸에서 축척을 움직이면 인물 · 배경이 함께 바뀌었다 — 한 페이지에서도 슬라이더 하나가 세 묶음을 함께 바꾼다.
  it('축척 슬라이더 하나가 세 묶음의 칸 수를 함께 바꾼다', () => {
    const src = page()
    expect(src.match(/columns=\{boardColumns\}/g)?.length).toBe(3)
    expect(src).toMatch(/const boardColumns = 4 - zoom/)
  })

  // 왜: 단추가 빈 곳으로 가지 않게, 소품이 왜 없는지 알게 — 소품은 이야기에서 고른 물건과 Producer 사물에서 생긴다(오너 E5 2026-11-22).
  //   고르는 때는 O1(콘티를 Artist 앞에)로 [만들기]가 아니라 [브레이크다운하기]로 산문을 확정할 때다(리드 2026-11-26 — 디자인 단계와 함께 옮겨 감).
  it('카드가 없는 묶음도 머리와 안내 한 줄이 보인다', () => {
    setLocale('ko')
    const empty = renderToStaticMarkup(createElement(ArtistSectionHeading, { section: 'props', count: 0 }))
    expect(empty).toContain('소품 0')
    expect(empty).toContain('소품이 없어요. [브레이크다운하기]로 산문을 확정할 때 이야기에서 고른 중요한 물건과 Producer 에서 사물로 정한 것이 소품이 돼요.')
    const filled = renderToStaticMarkup(createElement(ArtistSectionHeading, { section: 'characters', count: 3 }))
    expect(filled).toContain('인물 3')
    expect(filled).not.toContain('아직')
    setLocale('en')
    expect(renderToStaticMarkup(createElement(ArtistSectionHeading, { section: 'world', count: 0 }))).toContain('No backgrounds yet. Backgrounds come from the confirmed prose.')
  })

  // 왜: 머리 줄 숫자가 단추 숫자와 맞게 — 소품 수도 함께 센다.
  it('머리 줄은 인물 · 배경 · 소품 수를 함께 센다', () => {
    expect(translate('ko', 'Characters {persons} · backgrounds {places} · props {props}', { persons: 2, places: 1, props: 3 })).toBe('인물 2 · 배경 1 · 소품 3')
    expect(translate('ko', 'Characters · backgrounds · props')).toBe('인물 · 배경 · 소품')
    expect(page()).toMatch(/t\('Characters \{persons\} · backgrounds \{places\} · props \{props\}'/)
  })
})
