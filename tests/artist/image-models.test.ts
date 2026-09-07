// 이미지 모델을 고르면 지원되는 방식으로 요청하고, 시트에 맞지 않는 모델은 안전한 선택으로 바꾼다
import { describe, it, expect } from 'vitest'
import { resolveSheetImageModel,
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
describe('이미지 모델 선택 약속', () => {
  it("모델의 편집용 요청 주소는 편집 경로로 끝나거나 비워 둔다 (style-anchor Rule M 존중 조건)", () => {
    // applyStyleAnchor 는 base.model 이 '/edit' 로 안 끝나면 gpt-image-2/edit 로 되돌린다.
    for (const spec of Object.values(IMAGE_MODELS)) {
      if (spec.editEndpoint !== null) {
        expect(spec.editEndpoint.endsWith('/edit'), spec.key).toBe(true)
      }
    }
  })

  it('사용 가능한 모델마다 필요한 요청 항목을 빠짐없이 등록해 둔다', () => {
    // 누락 시 computeIgnoredFields 가 관측을 못 한다 — 새 모델 추가할 때 스키마 등록을 강제한다.
    for (const spec of Object.values(IMAGE_MODELS)) {
      expect(getAllowedFields(spec.t2iEndpoint), `t2i: ${spec.t2iEndpoint}`).toBeTruthy()
      if (spec.editEndpoint) {
        expect(getAllowedFields(spec.editEndpoint), `edit: ${spec.editEndpoint}`).toBeTruthy()
      }
    }
  })

  it('모델 선택 순서는 등록된 모델과 중복·누락 없이 일치한다', () => {
    expect([...IMAGE_MODEL_ORDER].sort()).toEqual(Object.keys(IMAGE_MODELS).sort())
    expect(IMAGE_MODEL_ORDER[0]).toBe(DEFAULT_IMAGE_MODEL)
  })

  it('#owner-default(2026-09-02): 기본 모델은 nano-banana-2, 1세대는 선택지로 남는다', () => {
    expect(DEFAULT_IMAGE_MODEL).toBe('nano-banana-2')
    expect(IMAGE_MODELS['nano-banana-2'].t2iEndpoint).toBe('fal-ai/nano-banana-2')
    expect(IMAGE_MODELS['nano-banana-2'].editEndpoint).toBe('fal-ai/nano-banana-2/edit')
    expect(isImageModelKey('nano-banana')).toBe(true)
  })

  it('알려진 모델 이름과 예전 요청 주소는 맞는 모델로 바꾸고, 모르는 값은 기본 모델을 쓴다', () => {
    expect(normalizeImageModelKey('nano-banana')).toBe('nano-banana')
    expect(normalizeImageModelKey('fal-ai/nano-banana-2/edit')).toBe('nano-banana-2')
    expect(normalizeImageModelKey('openai/gpt-image-2/edit')).toBe('gpt-image-2') // 레거시 endpoint 흡수
    expect(normalizeImageModelKey('fal-ai/nano-banana')).toBe('nano-banana')
    expect(normalizeImageModelKey(undefined)).toBe(DEFAULT_IMAGE_MODEL)
    expect(normalizeImageModelKey('garbage')).toBe(DEFAULT_IMAGE_MODEL)
  })

  it('지원하는 모델 이름만 채팅 선택으로 인정한다', () => {
    expect(isImageModelKey('seedream-4')).toBe(true)
    expect(isImageModelKey('nope')).toBe(false)
    expect(isImageModelKey(undefined)).toBe(false)
    expect(isImageModelKey(42)).toBe(false)
  })

  it('참조 이미지를 지원하는 모델만 이미지와 함께 요청할 수 있다', () => {
    expect(imageModelSupportsReference('gpt-image-2')).toBe(true)
    expect(imageModelSupportsReference('nano-banana')).toBe(true)
    expect(imageModelSupportsReference('nano-banana-2')).toBe(true)
    expect(imageModelSupportsReference('seedream-4')).toBe(true)
    expect(imageModelSupportsReference('flux-2-klein')).toBe(false) // 순수 T2I
  })

  it('참조 이미지가 있으면 편집 방식으로, 없으면 새로 만드는 방식으로 요청한다', () => {
    expect(resolveImageEndpoint('nano-banana-2', true)).toEqual({
      endpoint: 'fal-ai/nano-banana-2/edit',
      isEdit: true,
    })
    expect(resolveImageEndpoint('nano-banana-2', false)).toEqual({
      endpoint: 'fal-ai/nano-banana-2',
      isEdit: false,
    })
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

  it('참조 이미지를 지원하지 않는 모델은 참조 요청이 와도 새 이미지 만들기로 처리한다', () => {
    // flux-2-klein 은 editEndpoint 가 없다 → 라우트가 reference 를 버리고 t2i 로 간다.
    expect(resolveImageEndpoint('flux-2-klein', true)).toEqual({
      endpoint: 'fal-ai/flux-2/klein/9b',
      isEdit: false,
    })
  })
})

describe('시트에 맞는 이미지 모델 선택 (#sheet-model-guard 2026-09-01)', () => {
  it('시트에 맞지 않는 모델(기본 nano-banana 포함)은 검증된 모델로 바꿔서 사용한다', () => {
    // 실측 3e0169eb: nano-banana 가 2880×1280 요청에 1024² 를 반환해 그리드 18/18 전멸.
    expect(resolveSheetImageModel(null)).toBe('gpt-image-2')
    expect(resolveSheetImageModel('nano-banana')).toBe('gpt-image-2')
    expect(resolveSheetImageModel('nano-banana-2')).toBe('gpt-image-2') // resolution 등급만 있고 픽셀 캔버스 없음
    expect(resolveSheetImageModel('grok-imagine')).toBe('gpt-image-2')
    expect(resolveSheetImageModel('flux-2-klein')).toBe('gpt-image-2') // edit 미지원 — 시트 repaint 불가
  })

  it('시트에 맞는 모델을 고르면 그대로 사용한다', () => {
    expect(resolveSheetImageModel('gpt-image-2')).toBe('gpt-image-2')
    expect(resolveSheetImageModel('seedream-4')).toBe('seedream-4')
  })
})
