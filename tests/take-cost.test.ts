import { describe, expect, it } from 'vitest'
import { TAKE_COST_BY_MODEL, takeCostForPreviz, takeCostForVideo } from '@/lib/billing/take-cost'

// Take 소모량 계산기 (#payments-phase-2) — 계수 표와 미지 모델 폴백을 고정한다.
describe('take-cost', () => {
  it('v4 확정 계수 표를 갖는다', () => {
    expect(TAKE_COST_BY_MODEL['happy-horse']).toBe(1)
    expect(TAKE_COST_BY_MODEL.seedance).toBe(5)
    expect(TAKE_COST_BY_MODEL['kling-o3']).toBe(5)
    expect(TAKE_COST_BY_MODEL.veo).toBe(5)
    expect(TAKE_COST_BY_MODEL.local).toBe(1)
  })

  describe('takeCostForVideo', () => {
    it('모델별 계수를 그대로 반환한다', () => {
      expect(takeCostForVideo('seedance')).toBe(5)
      expect(takeCostForVideo('happy-horse')).toBe(1)
      expect(takeCostForVideo('kling-o3')).toBe(5)
      expect(takeCostForVideo('veo')).toBe(5)
    })

    it('null/undefined 는 드래프트 기준 1로 폴백한다', () => {
      expect(takeCostForVideo(null)).toBe(1)
      expect(takeCostForVideo(undefined)).toBe(1)
    })

    it('레지스트리에 없는 임의 문자열도 1로 폴백한다', () => {
      expect(takeCostForVideo('unknown-model' as never)).toBe(1)
    })
  })

  describe('takeCostForPreviz', () => {
    it('항상 드래프트 단가 1을 반환한다', () => {
      expect(takeCostForPreviz()).toBe(1)
    })
  })
})
