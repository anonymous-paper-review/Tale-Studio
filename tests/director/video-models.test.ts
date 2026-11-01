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

  // 왜: 예전에 저장된 노드·요청이 자체 호스팅('local') 모델 이름을 들고 들어와도, 만드는 것은
  //   결제 심사 문서가 밝힌 처리 업체(fal) 카탈로그 모델뿐이어야 한다(2026-10-11 로컬 경로 제거).
  it('예전 로컬 모델 이름은 기본 영상 모델로 바꾼다', () => {
    expect(normalizeProvider('local')).toBe(DEFAULT_VIDEO_MODEL)
    expect(Object.keys(VIDEO_MODELS)).not.toContain('local')
  })

  // 왜: 정상 경로 고정(오너 2026-11-01). 디렉터 영상 노드에서 Seedance 2.5 를 고르면 fal 의 Seedance 2.5 로 만들어야 한다.
  //   fal 에는 Seedance 2.5 참고 영상 모델이 미국 서버 입구(us)로만 있다.
  it('Seedance 2.5 를 고르면 fal 의 Seedance 2.5 참고 영상 모델로 만든다', () => {
    expect(VIDEO_MODELS['seedance-2.5'].label).toBe('Seedance 2.5')
    expect(VIDEO_MODELS['seedance-2.5'].endpoint).toBe('bytedance/seedance-2.5/us/reference-to-video')
    expect(normalizeProvider('seedance-2.5')).toBe('seedance-2.5')
  })

  // 왜: 모델 단추가 늘어도 처음 고르는 모델(Seedance 2.0)은 그대로이고, 같은 계열 새 판은 옆에 있어야 찾기 쉽다.
  it('영상 모델 목록에서 Seedance 2.5 는 Seedance 2.0 바로 다음에 있고 기본 모델은 그대로 Seedance 2.0 이다', () => {
    expect(FAL_VIDEO_MODEL_ORDER.indexOf('seedance-2.5')).toBe(FAL_VIDEO_MODEL_ORDER.indexOf('seedance') + 1)
    expect(DEFAULT_VIDEO_MODEL).toBe('seedance')
  })

  // 왜: Seedance 2.5 는 30초까지 만들 수 있지만 Take 는 길이와 상관없이 한 편 값이다. 다른 모델과 같은 15초에서 끊는다.
  it('Seedance 2.5 영상 길이는 4~15초 안으로 맞추고 480p · 720p · 1080p 를 낼 수 있다', () => {
    const spec = VIDEO_MODELS['seedance-2.5']
    expect(clampDuration(spec, 2)).toBe(4)
    expect(clampDuration(spec, 30)).toBe(15)
    expect(spec.resolutions).toEqual(['480p', '720p', '1080p'])
  })

  it('영상 길이를 넣으면 모델이 허용하는 범위 안으로 맞추고 고정 길이 모델은 정해진 길이를 쓴다', () => {
    const spec = VIDEO_MODELS[DEFAULT_VIDEO_MODEL]
    expect(spec.duration.mode).toBe('flexible')
    expect(clampDuration(spec, 1)).toBe((spec.duration as { min: number }).min)
    expect(clampDuration(VIDEO_MODELS.veo, 3)).toBe(8) // fixed 모델은 입력 무시
  })
})
