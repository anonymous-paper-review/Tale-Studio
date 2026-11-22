// Artist 묶음 바로가기 — 인물 · 배경 · 소품 묶음은 한 페이지에 늘 함께 보이고, 위의 단추를 누르면 그 묶음으로 바로 가며, 마지막에 간 묶음은 떠났다 돌아와도 그대로다 (D13, 오너 2026-11-22 — 예전 걸러 보기 v3 A5 를 바꿨다)
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { ARTIST_SECTIONS, artistJumpBehavior, artistSectionCounts, artistSectionId, jumpToArtistSection } from '@/lib/artist/card-filter'
import { useArtistStore } from '@/stores/artist-store'

const page = () => readFileSync('src/app/studio/artist/page.tsx', 'utf8')

describe('묶음 바로가기', () => {
  // 왜: D13 — 오너 "인물, 배경, 소품을 한 페이지에 다 담아주고". 예전에는 고른 칸(모두 · 인물 · 배경)의 묶음만 보였고 처음 열면 인물만 보여 탭처럼 나뉘어 보였다.
  it('인물 · 배경 · 소품 묶음은 고르기 없이 한 페이지에 늘 함께 보인다', () => {
    expect(ARTIST_SECTIONS).toEqual(['characters', 'world', 'props'])
    const src = page()
    expect(src).not.toMatch(/artistFilterPanels|ARTIST_FILTERS/)
    expect(src).toMatch(/ARTIST_SECTIONS\.map\(\(section\) => \(\s*<section\s+key=\{section\}\s+id=\{artistSectionId\(section\)\}/)
  })

  // 왜: D13 — "버튼을 누르면 그 섹션으로 바로 이동". 인물 단추는 인물 묶음 머리로 간다.
  it('인물 단추를 누르면 인물 묶음으로 바로 간다', () => {
    const scrollIntoView = vi.fn()
    const getElement = vi.fn(() => ({ scrollIntoView }))
    expect(jumpToArtistSection('characters', { getElement, reducedMotion: false })).toBe(true)
    expect(getElement).toHaveBeenCalledWith(artistSectionId('characters'))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  // 왜: D13 — 배경 · 소품도 같은 단추 줄에서 바로 간다. 묶음 자리를 아직 못 찾으면(그려지기 전) 아무 데도 가지 않는다.
  it('배경 단추를 누르면 배경 묶음으로, 소품 단추를 누르면 소품 묶음으로 바로 간다', () => {
    for (const section of ['world', 'props'] as const) {
      const scrollIntoView = vi.fn()
      const getElement = vi.fn(() => ({ scrollIntoView }))
      expect(jumpToArtistSection(section, { getElement, reducedMotion: false })).toBe(true)
      expect(getElement).toHaveBeenCalledWith(artistSectionId(section))
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    }
    expect(jumpToArtistSection('props', { getElement: () => null, reducedMotion: false })).toBe(false)
    expect(page()).toMatch(/onClick=\{\(\) => jumpTo\(section\)\}/)
  })

  // 왜: 예전 칸의 숫자처럼 단추를 누르기 전에 그 묶음에 카드가 몇 장인지 안다. 보관 카드도 그 묶음에 보이므로 센다.
  it('묶음 단추의 숫자는 그 묶음의 카드 수다', () => {
    expect(artistSectionCounts({ characters: 3, worlds: 1, props: 2 })).toEqual({ characters: 3, world: 1, props: 2 })
    expect(artistSectionCounts({ characters: 0, worlds: 0, props: 0 })).toEqual({ characters: 0, world: 0, props: 0 })
  })

  // 왜: 검토 A M1(2026-11-03) — 묶음을 새로 그리면 카드에서 고른 채팅 대상과 카드 안에서 고른 모습이 지워졌다. 이제 묶음은 늘 그려져 있고 단추는 스크롤만 한다.
  it('묶음 단추로 옮겨 다녀도 카드의 채팅 대상과 고른 모습은 그대로다', () => {
    const src = page()
    expect(src).not.toMatch(/key=\{tab\}/)
    expect(src).not.toMatch(/tabSlide|slideFrom/)
    // 묶음마다 이름(key)이 고정 — 단추를 눌러도 묶음을 새로 만들지 않는다.
    expect(src).toMatch(/<section\s+key=\{section\}/)
  })

  // 왜: 혼자 정한 것 — 바로 가더라도 어디로 갔는지 보이게 부드럽게 스크롤한다. 움직임 줄이기 설정을 켠 사람에게는 미끄러지지 않고 바로 간다(예전 칸 미끄러짐의 motion-reduce 와 같은 배려).
  it('묶음으로 갈 때는 부드럽게 스크롤하고, 움직임 줄이기 설정이면 바로 간다', () => {
    expect(artistJumpBehavior(false)).toBe('smooth')
    expect(artistJumpBehavior(true)).toBe('auto')
    const scrollIntoView = vi.fn()
    jumpToArtistSection('world', { getElement: () => ({ scrollIntoView }), reducedMotion: true })
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  // 왜: 약속 D15 — 보던 자리는 스토어가 기억한다. 다른 탭에 갔다 돌아오면 마지막에 간 묶음으로 간다.
  it('마지막에 간 묶음은 떠났다 돌아와도 그대로다', () => {
    const before = useArtistStore.getState().uiTab
    try {
      useArtistStore.getState().setUiTab('props')
      expect(useArtistStore.getState().uiTab).toBe('props')
    } finally {
      useArtistStore.getState().setUiTab(before)
    }
    expect(page()).toMatch(/const remembered = useArtistStore\(\(s\) => s\.uiTab\)/)
  })
})
