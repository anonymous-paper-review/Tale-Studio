// 영상 모델을 고르면 기본 모델과 재생 시간이 안내된 기준에 맞게 정해진다 (#owner-default 2026-08-31: Seedance 2.0)
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_VIDEO_MODEL,
  FAL_VIDEO_MODEL_ORDER,
  VIDEO_MODELS,
  clampDuration,
  normalizeProvider,
} from '@/lib/video-models'

// video-models 레지스트리 계약 — 기본 모델·정규화 폴백을 잠근다(#owner-default 2026-08-31: Seedance 2.0).
describe('영상 모델 선택 기준', () => {
  it('기본 영상 모델은 Seedance다', () => {
    expect(DEFAULT_VIDEO_MODEL).toBe('seedance')
  })

  it('영상 모델 목록의 첫 항목은 기본 모델이다', () => {
    expect(FAL_VIDEO_MODEL_ORDER[0]).toBe(DEFAULT_VIDEO_MODEL)
  })

  it('영상 모델 이름을 넣으면 지원 이름은 유지하고 예전 이름과 모르는 이름은 알맞게 바꾼다', () => {
    expect(normalizeProvider('seedance')).toBe('seedance')
    expect(normalizeProvider('kling')).toBe('kling-o3') // legacy alias
    expect(normalizeProvider('garbage')).toBe(DEFAULT_VIDEO_MODEL)
    expect(normalizeProvider('')).toBe(DEFAULT_VIDEO_MODEL)
  })

  it('영상 길이를 넣으면 모델이 허용하는 범위 안으로 맞추고 고정 길이 모델은 정해진 길이를 쓴다', () => {
    const spec = VIDEO_MODELS[DEFAULT_VIDEO_MODEL]
    expect(spec.duration.mode).toBe('flexible')
    expect(clampDuration(spec, 1)).toBe((spec.duration as { min: number }).min)
    expect(clampDuration(VIDEO_MODELS.veo, 3)).toBe(8) // fixed 모델은 입력 무시
  })
})
