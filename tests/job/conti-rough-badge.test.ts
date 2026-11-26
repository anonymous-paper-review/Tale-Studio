// 콘티에서 그린 러프의 완료 숫자가 레일의 Writer 칸(씬 스토리 · 콘티)에 붙고, 콘티를 보는 동안에는 붙지 않는지 검사한다 (오너 2026-11-26 O1 — 러프는 Writer 콘티에서 그린다)
import { describe, expect, it } from 'vitest'
import { LANE_STAGE, deriveStageBadges } from '@/lib/generation-batches'
import { railItemBadge } from '@/lib/stage-rail'

describe('러프 완료 숫자', () => {
  // 왜(혼자 정한 것): O1 — 러프는 콘티에서 그린다. Storyboard 칸에 숫자가 붙으면 아직 열리지도 않은 Storyboard 에 새 것이 생긴 것처럼 보인다.
  it('콘티에서 그린 러프의 완료 숫자는 레일의 Writer 칸에 붙고 Storyboard 칸에는 붙지 않는다', () => {
    const stage = LANE_STAGE['writer-rough']
    expect(stage).toBe('conti')
    const badges = deriveStageBadges([{ stage, lane: 'writer-rough', at: 2000, units: 3 }], { conti: 1000 }, 'artist')
    expect(railItemBadge('producer', badges)).toBe(3)
    expect(railItemBadge('writer', badges)).toBe(0)
  })

  // 왜: 정상 경로 고정 — 지금 보고 있는 단계의 완료는 숫자로 쌓지 않는다(그 자리에서 보고 있다).
  it('콘티를 보는 동안 그려진 러프는 완료 숫자로 쌓이지 않는다', () => {
    const badges = deriveStageBadges([{ stage: LANE_STAGE['writer-rough'], lane: 'writer-rough', at: 2000, units: 3 }], { conti: 1000, writer: 1000 }, 'conti')
    expect(badges).toEqual({})
  })
})
