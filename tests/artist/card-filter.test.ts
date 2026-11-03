// Artist 걸러 보기 — 모두 · 인물 · 배경 칸을 고르면 그 카드만 보이고, 칸의 숫자는 그 칸에서 보이는 카드 수다 (v3 A5, 오너 2026-11-03)
import { describe, expect, it } from 'vitest'
import { ARTIST_FILTERS, artistFilterCounts, artistFilterShows } from '@/lib/artist/card-filter'
import { useArtistStore } from '@/stores/artist-store'

describe('걸러 보기', () => {
  // 왜: 시안 A5 — 인물과 배경을 한 화면에서 함께 훑어본다(예전에는 두 탭을 오가야 했다).
  it('모두를 고르면 인물 카드와 배경 카드를 모두 보인다', () => {
    expect(artistFilterShows('all')).toEqual({ characters: true, world: true })
  })

  // 왜: 정상 경로 고정 — 예전 등장인물 탭과 같은 카드(사람 · 예전 흐름의 사물)를 보인다.
  it('인물을 고르면 인물 카드만 보인다', () => {
    expect(artistFilterShows('characters')).toEqual({ characters: true, world: false })
  })

  // 왜: 정상 경로 고정 — 예전 배경 탭과 같은 카드를 보인다.
  it('배경을 고르면 배경 카드만 보인다', () => {
    expect(artistFilterShows('world')).toEqual({ characters: false, world: true })
  })

  // 왜: 시안의 "모두 4 · 인물 3 · 배경 1" — 칸을 고르기 전에 몇 장이 보일지 안다. 보관 카드도 그 칸에 보이므로 센다.
  it('칸의 숫자는 그 칸을 골랐을 때 보이는 카드 수다', () => {
    expect(artistFilterCounts({ characters: 3, worlds: 1 })).toEqual({ all: 4, characters: 3, world: 1 })
    expect(artistFilterCounts({ characters: 0, worlds: 0 })).toEqual({ all: 0, characters: 0, world: 0 })
  })

  // 왜: 약속 D15 — 보던 칸은 스토어가 기억한다. 모두 칸도 떠났다 돌아오면 그대로다.
  it('모두 · 인물 · 배경 중 고른 칸은 떠났다 돌아와도 그대로다', () => {
    expect(ARTIST_FILTERS).toEqual(['all', 'characters', 'world'])
    const before = useArtistStore.getState().uiTab
    try {
      useArtistStore.getState().setUiTab('all')
      expect(useArtistStore.getState().uiTab).toBe('all')
    } finally {
      useArtistStore.getState().setUiTab(before)
    }
  })
})
