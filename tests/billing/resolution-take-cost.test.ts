// 영상 해상도에 따라 Take 를 센다 — 1080p 는 720p 의 두 배, 해상도를 못 고르는 모델은 기본값 그대로 (오너 2026-10-31)
import { describe, expect, it } from 'vitest'
import { takeCostForVideo } from '@/lib/billing/take-cost'

describe('해상도별 Take 계산', () => {
  // 왜: 사용자가 영상 팝업에서 1080p 를 고르고 만들 때 — 화면 표시와 서버 차감이 모두 이 계산기를 쓴다.
  it('1080p 영상은 720p 영상의 두 배 Take를 쓴다', () => {
    expect(takeCostForVideo('seedance', '720p')).toBe(5)
    expect(takeCostForVideo('seedance', '1080p')).toBe(10)
    expect(takeCostForVideo('happy-horse', '720p')).toBe(1)
    expect(takeCostForVideo('happy-horse', '1080p')).toBe(2)
    expect(takeCostForVideo('veo', '1080p')).toBe(10)
  })

  // 왜: 1080p 를 남겨 둔 영상 노드에서 해상도 칸이 없는 Kling O3 Pro 로 바꿨을 때 — 그 모델은 기본 해상도로만 만든다.
  it('해상도를 고를 수 없는 모델은 1080p를 골라 두어도 기본 Take를 쓴다', () => {
    expect(takeCostForVideo('kling-o3', '1080p')).toBe(5)
    expect(takeCostForVideo('kling-o3', '720p')).toBe(5)
  })

  // 왜: 해상도를 아직 고른 적 없는 영상 노드·예전에 저장된 작업 — 정상 경로 고정(지금과 같은 720p 값).
  it('해상도를 고르지 않았거나 모르는 값이면 720p 값으로 센다', () => {
    expect(takeCostForVideo('seedance')).toBe(5)
    expect(takeCostForVideo('seedance', null)).toBe(5)
    expect(takeCostForVideo('seedance', '4k')).toBe(5)
  })
})
