// Artist 인물 · 배경 카드에 마우스를 올리면 카드 아래에 뜨는 지난 그림은 그 칸에 남은 그림 중 카드에 보이는 그림을 뺀 것이고, 다른 작품 스타일 판 그림은 채택할 수 없다 (오너 2026-11-26 A4)
import { describe, expect, it } from 'vitest'
import { historyStrip, pastArtistImages, pastCandidates } from '@/lib/version-history'
import type { VersionSummary } from '@/lib/artist/style-versions'

const cand = (id: string, day: number, selected = false) => ({
  id, url: `https://media.test/${id}.png`, isSelected: selected, generatedAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`, sourceHash: null,
})

describe('Artist 지난 그림', () => {
  it('인물 · 배경 칸의 지난 그림은 카드에 보이는 그림을 빼고 가장 새로 그린 것부터 5개까지 보인다', () => {
    // 왜: 오너 A4 "Artist 호버링하면 과거 이력 아래에 뜨기 (5개까지 작은 카드 형태로)" — 칸마다 고른 그림 + 최근 5장이 남는다(10/31 보관 규칙).
    const candidates = [cand('c1', 1), cand('c2', 2), cand('c3', 3, true), cand('c4', 4), cand('c5', 5), cand('c6', 6), cand('c7', 7)]
    const strip = historyStrip(pastCandidates(candidates, 'https://media.test/c3.png'))
    expect(strip.shown.map((c) => c.id)).toEqual(['c7', 'c6', 'c5', 'c4', 'c2'])
    expect(strip.more).toBe(1)
    // 고른 표시가 다른 그림에 남아 있어도 카드에 보이는 그림은 지난 그림이 아니다(카드 판 배지와 같은 기준).
    expect(pastCandidates(candidates, 'https://media.test/c7.png').map((c) => c.id)).toEqual(['c6', 'c5', 'c4', 'c2', 'c1'])
    // 그림이 하나뿐이면 지난 그림이 없다 — 줄이 뜨지 않는다.
    expect(pastCandidates([cand('only', 1, true)], 'https://media.test/only.png')).toEqual([])
    expect(pastCandidates(undefined, null)).toEqual([])
  })

  it('다른 작품 스타일 판에서 그린 지난 그림은 채택할 수 없다고 표시되고, 작품 스타일 기록이 하나뿐이면 가리지 않는다', () => {
    // 왜: 작품 스타일은 하나다(10/28 오너) — 다른 스타일 그림을 카드 하나만 되돌리면 작품 안에 스타일이 섞인다. 상세 기록의 [불러오기] · 서버 거절과 같은 판정.
    const versions: VersionSummary[] = [
      { n: 1, styleId: 'watercolor', current: false, active: [{ from: null, to: '2026-11-03T00:00:00Z' }] },
      { n: 2, styleId: 'anime', current: true, active: [{ from: '2026-11-03T00:00:00Z', to: null }] },
    ]
    const past = pastArtistImages([cand('old', 1), cand('new', 4), cand('now', 5, true)], 'https://media.test/now.png', { versions, currentStyleId: 'anime' })
    expect(past.map((p) => [p.id, p.otherStyle?.n ?? null])).toEqual([['new', null], ['old', 1]])
    expect(pastArtistImages([cand('old', 1), cand('now', 5, true)], 'https://media.test/now.png', { versions: [versions[1]!], currentStyleId: 'anime' })[0]!.otherStyle).toBeNull()
  })
})
