import { describe, it, expect } from 'vitest'
import {
  DEFAULT_VIDEO_MODEL,
  FAL_VIDEO_MODEL_ORDER,
  VIDEO_MODELS,
  clampDuration,
  normalizeProvider,
} from '@/lib/video-models'

// video-models 레지스트리 계약 — 기본 모델·정규화 폴백을 잠근다(#owner-default 2026-08-31: Seedance 2.0).
describe('video-models 레지스트리', () => {
  it('DEFAULT_VIDEO_MODEL 은 seedance 다', () => {
    expect(DEFAULT_VIDEO_MODEL).toBe('seedance')
  })

  it('FAL_VIDEO_MODEL_ORDER 첫 항목은 기본 모델과 일치한다', () => {
    expect(FAL_VIDEO_MODEL_ORDER[0]).toBe(DEFAULT_VIDEO_MODEL)
  })

  it('normalizeProvider: 유효 키·legacy alias·미상 처리', () => {
    expect(normalizeProvider('seedance')).toBe('seedance')
    expect(normalizeProvider('kling')).toBe('kling-o3') // legacy alias
    expect(normalizeProvider('garbage')).toBe(DEFAULT_VIDEO_MODEL)
    expect(normalizeProvider('')).toBe(DEFAULT_VIDEO_MODEL)
  })

  it('clampDuration: flexible 모델은 spec 범위로 가두고, fixed 모델은 고정 seconds 를 반환', () => {
    const spec = VIDEO_MODELS[DEFAULT_VIDEO_MODEL]
    expect(spec.duration.mode).toBe('flexible')
    expect(clampDuration(spec, 1)).toBe((spec.duration as { min: number }).min)
    expect(clampDuration(VIDEO_MODELS.veo, 3)).toBe(8) // fixed 모델은 입력 무시
  })
})
