// 소품 그림 제출 계획(서버) — 지시문에 작품 그림체를 붙이고 모델 갈래를 고른다. DB · 외부 호출 없이 순수하다(양식 주소는 호출부가 올려서 준다).
//   소품 양식(m1126 A2): 인물 시트처럼 양식을 첫 참고 그림으로 넣어 편집 모델이 칸을 채운다(16:9). 그림체 기준 그림이 있으면 인물 시트와 같은
//   그림체 절(turnaround — 기준 그림 1번 · 양식 2번)을 쓴다. 양식 주소가 없으면(올리기 실패) 양식 없이 한 장 그림(16:9)으로 그린다.
//   그림체 기준 그림이 있어도 인물 조각(Figure rules · Priority)은 싣지 않는다 — 소품에는 사람이 없다(사물 시트 규칙과 같다).
//   기준 그림 없이 그리는 그림체(실사, 2026-10-13 오너)는 크기로 비율을 정한다. 글씨 스위치를 끄면(예전 (a)) 양식이 없을 때만 배경과 같은
//   글자 금지 줄을 붙인다 — 양식이 있으면 칸 이름이 있어 붙이지 않는다(인물 시트와 같다). 켜져 있으면(오너 P1 기본) 덧붙인 글씨 금지가 지시문 안에 있다.
//   약속: tests/artist/prop-image.test.ts
import { buildPropImagePrompt, PROP_TEXT_RULE, type PropTextRule } from '@/lib/artist/prop-image'
import { imageSizeForAspect } from '@/lib/fal/aspect-size'
import { DEFAULT_WORLD_IMAGE_MODEL, resolveImageEndpoint, type ImageModelKey } from '@/lib/image-models'
import { applyStyleAnchor, type AnchorableSubmit, type ResolvedStyleAnchor } from '@/lib/style-anchor'
import { FACET_NO_TEXT } from '@/lib/style-facets/no-text'

/** 소품 그림 비율 — 인물 시트 · 배경과 같은 16:9 한 장(m1126 A2, 예전엔 정사각). */
export const PROP_IMAGE_ASPECT = '16:9'

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
  textRule?: PropTextRule
  /** 스토리지에 올린 소품 양식 주소(templateAssetUrl(PROP_SHEET_FILE)) — 없으면 양식 없이 그린다. */
  templateUrl?: string | null
}): PropImagePlan {
  const modelKey = input.model ?? DEFAULT_WORLD_IMAGE_MODEL
  const textRule = input.textRule ?? PROP_TEXT_RULE
  const templateUrl = input.templateUrl?.trim() || null
  const prompt = buildPropImagePrompt({ ...input, textRule, sheet: !!templateUrl })
  const withoutReference = !input.anchor && input.styleWithoutReference
  const base: AnchorableSubmit = {
    prompt: withoutReference && textRule === 'none' && !templateUrl ? `${prompt}\n${FACET_NO_TEXT}` : prompt,
    aspect_ratio: PROP_IMAGE_ASPECT,
    ...(withoutReference ? { image_size: imageSizeForAspect(PROP_IMAGE_ASPECT) } : {}),
    ...(templateUrl ? { reference_image_urls: [templateUrl] } : {}),
  }
  // 양식이 있으면 인물 시트와 같은 그림체 절(turnaround — 기준 그림 뒤 둘째 장이 양식, 전면 글자 금지는 칸 이름 때문에 싣지 않음).
  //   양식이 없으면 예전 그대로 — 글씨 스위치를 켜면 그림체 줄의 전면 글자 금지도 빼야 설명의 글씨가 남는다(첫 시험: 펼친 편지가 빈 종이로 나옴).
  const submit = input.anchor
    ? templateUrl
      ? applyStyleAnchor(input.anchor, base, 'turnaround', { pinAspectRatio: PROP_IMAGE_ASPECT, people: false })
      : applyStyleAnchor(input.anchor, base, 'single', { people: false, ...(textRule === 'described' ? { describedText: true } : {}) })
    : base
  const model = resolveImageEndpoint(modelKey, !!submit.reference_image_urls?.length).endpoint
  return { submit: { ...submit, model }, model, modelKey }
}
