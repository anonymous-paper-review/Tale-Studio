import { describe, it, expect } from 'vitest'
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  IMAGE_MODEL_ORDER,
  isImageModelKey,
  normalizeImageModelKey,
  imageModelSupportsReference,
  resolveImageEndpoint,
} from '@/lib/image-models'
import { getAllowedFields } from '@/lib/fal/model-schemas'

// image-models 레지스트리 계약 — 팝업/채팅 모델 선택 + generate-sheet 엔드포인트 결정의 단일 진실.
describe('image-models 레지스트리', () => {
  it("모든 editEndpoint 는 '/edit' 로 끝나거나 null 이다 (style-anchor Rule M 존중 조건)", () => {
    // applyStyleAnchor 는 base.model 이 '/edit' 로 안 끝나면 gpt-image-2/edit 로 되돌린다.
    for (const spec of Object.values(IMAGE_MODELS)) {
      if (spec.editEndpoint !== null) {
        expect(spec.editEndpoint.endsWith('/edit'), spec.key).toBe(true)
      }
    }
  })

  it('레지스트리의 모든 엔드포인트가 model-schemas(FAL_INPUT_ALLOWLIST)에 등록돼 있다', () => {
    // 누락 시 computeIgnoredFields 가 관측을 못 한다 — 새 모델 추가할 때 스키마 등록을 강제한다.
    for (const spec of Object.values(IMAGE_MODELS)) {
      expect(getAllowedFields(spec.t2iEndpoint), `t2i: ${spec.t2iEndpoint}`).toBeTruthy()
      if (spec.editEndpoint) {
        expect(getAllowedFields(spec.editEndpoint), `edit: ${spec.editEndpoint}`).toBeTruthy()
      }
    }
  })

  it('IMAGE_MODEL_ORDER 는 레지스트리 키와 정확히 일치한다(중복·누락 없음)', () => {
    expect([...IMAGE_MODEL_ORDER].sort()).toEqual(Object.keys(IMAGE_MODELS).sort())
    expect(IMAGE_MODEL_ORDER[0]).toBe(DEFAULT_IMAGE_MODEL)
  })

  it('normalizeImageModelKey: 유효 키·레거시 endpoint·미상 처리', () => {
    expect(normalizeImageModelKey('nano-banana')).toBe('nano-banana')
    expect(normalizeImageModelKey('openai/gpt-image-2/edit')).toBe('gpt-image-2') // 레거시 endpoint 흡수
    expect(normalizeImageModelKey('fal-ai/nano-banana')).toBe('nano-banana')
    expect(normalizeImageModelKey(undefined)).toBe(DEFAULT_IMAGE_MODEL)
    expect(normalizeImageModelKey('garbage')).toBe(DEFAULT_IMAGE_MODEL)
  })

  it('isImageModelKey: 화이트리스트 판정 (채팅 cc 입력 검증용)', () => {
    expect(isImageModelKey('seedream-4')).toBe(true)
    expect(isImageModelKey('nope')).toBe(false)
    expect(isImageModelKey(undefined)).toBe(false)
    expect(isImageModelKey(42)).toBe(false)
  })

  it('imageModelSupportsReference: editEndpoint 유무를 반영', () => {
    expect(imageModelSupportsReference('gpt-image-2')).toBe(true)
    expect(imageModelSupportsReference('nano-banana')).toBe(true)
    expect(imageModelSupportsReference('seedream-4')).toBe(true)
    expect(imageModelSupportsReference('flux-2-klein')).toBe(false) // 순수 T2I
  })

  it('resolveImageEndpoint: reference 있으면 edit, 없으면 t2i', () => {
    expect(resolveImageEndpoint('gpt-image-2', true)).toEqual({
      endpoint: 'openai/gpt-image-2/edit',
      isEdit: true,
    })
    expect(resolveImageEndpoint('gpt-image-2', false)).toEqual({
      endpoint: 'openai/gpt-image-2',
      isEdit: false,
    })
    expect(resolveImageEndpoint('seedream-4', true)).toEqual({
      endpoint: 'fal-ai/bytedance/seedream/v4/edit',
      isEdit: true,
    })
  })

  it('resolveImageEndpoint: reference 미지원 모델은 reference 요청이 와도 T2I 로 폴백', () => {
    // flux-2-klein 은 editEndpoint 가 없다 → 라우트가 reference 를 버리고 t2i 로 간다.
    expect(resolveImageEndpoint('flux-2-klein', true)).toEqual({
      endpoint: 'fal-ai/flux-2/klein/9b',
      isEdit: false,
    })
  })
})
