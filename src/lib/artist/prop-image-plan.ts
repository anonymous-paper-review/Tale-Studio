// 소품 그림 제출 계획(서버) — 지시문에 작품 그림체를 붙이고 모델 갈래를 고른다. DB · 외부 호출 없이 순수하다.
//   그림체 기준 그림이 있으면 참고 그림으로 붙이되 인물 조각(Figure rules · Priority)은 싣지 않는다 — 소품에는 사람이 없다(사물 시트 규칙과 같다).
//   기준 그림 없이 그리는 그림체(실사, 2026-10-13 오너)는 배경과 같이 글자 금지 줄을 붙이고 크기로 비율을 정한다.
//   약속: tests/artist/prop-image.test.ts
import { buildPropImagePrompt } from '@/lib/artist/prop-image'
import { imageSizeForAspect } from '@/lib/fal/aspect-size'
import { DEFAULT_WORLD_IMAGE_MODEL, resolveImageEndpoint, type ImageModelKey } from '@/lib/image-models'
import { applyStyleAnchor, type AnchorableSubmit, type ResolvedStyleAnchor } from '@/lib/style-anchor'
import { FACET_NO_TEXT } from '@/lib/style-facets/no-text'

/** 소품 그림 비율 — 정사각 한 장. */
export const PROP_IMAGE_ASPECT = '1:1'

export interface PropImagePlan {
  submit: AnchorableSubmit
  /** 실제 fal 엔드포인트(참고 그림 유무로 t2i/edit 갈래). */
  model: string
  /** 고른 모델 키(기록용). */
  modelKey: ImageModelKey
}

export function planPropImageSubmit(input: {
  name: string
  appearance: string
  instruction?: string | null
  safeMode?: boolean
  anchor: ResolvedStyleAnchor | null
  styleWithoutReference: boolean
  model?: ImageModelKey | null
}): PropImagePlan {
  const modelKey = input.model ?? DEFAULT_WORLD_IMAGE_MODEL
  const prompt = buildPropImagePrompt(input)
  const withoutReference = !input.anchor && input.styleWithoutReference
  const base: AnchorableSubmit = {
    prompt: withoutReference ? `${prompt}\n${FACET_NO_TEXT}` : prompt,
    aspect_ratio: PROP_IMAGE_ASPECT,
    ...(withoutReference ? { image_size: imageSizeForAspect(PROP_IMAGE_ASPECT) } : {}),
  }
  const submit = input.anchor ? applyStyleAnchor(input.anchor, base, 'single', { people: false }) : base
  const model = resolveImageEndpoint(modelKey, !!submit.reference_image_urls?.length).endpoint
  return { submit: { ...submit, model }, model, modelKey }
}
