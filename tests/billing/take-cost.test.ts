// 영상과 미리보기 생성에 필요한 Take 수를 모델별로 일관되게 계산한다 (#payments-phase-2)
import { describe, expect, it } from 'vitest'
import { TAKE_COST_BY_MODEL, takeCostForPreviz, takeCostForVideo } from '@/lib/billing/take-cost'

// Take 소모량 계산기 (#payments-phase-2) — 계수 표와 미지 모델 폴백을 고정한다.
describe('Take 사용량 계산', () => {
  it('v4 기준 모델별 영상 Take 비용을 사용한다', () => {
    expect(TAKE_COST_BY_MODEL['happy-horse']).toBe(1)
    expect(TAKE_COST_BY_MODEL.seedance).toBe(5)
    expect(TAKE_COST_BY_MODEL['kling-o3']).toBe(5)
    expect(TAKE_COST_BY_MODEL.veo).toBe(5)
    expect(TAKE_COST_BY_MODEL.local).toBe(1)
  })

  describe('takeCostForVideo', () => {
    it('모델을 선택하면 정해진 영상 Take 비용을 적용한다', () => {
      expect(takeCostForVideo('seedance')).toBe(5)
      expect(takeCostForVideo('happy-horse')).toBe(1)
      expect(takeCostForVideo('kling-o3')).toBe(5)
      expect(takeCostForVideo('veo')).toBe(5)
    })

    it('모델을 지정하지 않으면 영상 Take 1을 적용한다', () => {
      expect(takeCostForVideo(null)).toBe(1)
      expect(takeCostForVideo(undefined)).toBe(1)
    })

    it('알 수 없는 모델도 영상 Take 1을 적용한다', () => {
      expect(takeCostForVideo('unknown-model' as never)).toBe(1)
    })
  })

  describe('takeCostForPreviz', () => {
    it('미리보기 영상은 언제나 Take 1을 사용한다', () => {
      expect(takeCostForPreviz()).toBe(1)
    })
  })
})
