// ============================================================================
// Image model registry — Artist 캐릭터/사물 이미지 생성 모델 카탈로그.
//
// video-models.ts 와 대칭: 여기 spec 하나로 (1) 팝업/채팅이 고를 수 있는 목록,
// (2) generate-sheet 라우트가 고를 fal 엔드포인트(T2I vs edit), (3) buildFalImageInput
// 이 넣을 canvas 파라미터(aspect_ratio vs image_size)를 모두 결정한다.
//
// reference(정체성/템플릿) 처리:
//   캐릭터 턴어라운드·방향뷰·비기본 모습은 전부 reference 이미지를 넣는 image-to-image(edit)다.
//   그래서 editEndpoint 가 있는 모델만 캐릭터 정체성을 이어받을 수 있다. editEndpoint 가 null 인
//   모델(순수 T2I)은 reference 없이 프롬프트만으로 그린다 — 빠르고 싸지만 정체성이 약하다.
//   앵커(스타일 레퍼런스)가 있을 때 style-anchor.ts 는 base.model 이 '/edit' 로 끝나지 않으면
//   openai/gpt-image-2/edit 로 되돌린다 — 그래서 editEndpoint 는 반드시 '/edit' 로 끝나야 존중된다.
//
// canvas 파라미터(모델 스키마 실측, fal llms.txt 기준):
//   - aspect_ratio 계열: nano-banana(t2i·edit), openai/gpt-image-2(레거시 — 실제로는 image_size지만
//     기존 라우트가 aspect_ratio 를 넘겨도 무해히 무시되는 검증된 경로라 그대로 둔다).
//   - image_size 계열: seedream v4(t2i·edit), flux-2 klein.
// ============================================================================

export type ImageModelKey =
  | 'gpt-image-2'
  | 'nano-banana'
  | 'seedream-4'
  | 'flux-2-klein'

/** canvas(캔버스 크기) 파라미터를 fal 에 어떻게 넘기는가 */
export type ImageCanvasParam = 'aspect_ratio' | 'image_size'

export interface ImageModelSpec {
  key: ImageModelKey
  /** 사람이 읽는 라벨 (UI 표기, i18n base 키) */
  label: string
  /** 한 줄 강점 설명 (UI 표기, i18n base 키) */
  description: string
  /** reference 없을 때(순수 T2I) fal 엔드포인트 */
  t2iEndpoint: string
  /** reference 있을 때(edit/i2i) fal 엔드포인트. null = reference(정체성) 미지원 */
  editEndpoint: string | null
  /** canvas 크기 파라미터 방식 */
  canvas: ImageCanvasParam
  /** 대략 이미지당 가격(USD, UI 힌트). null = 가변/미표기(예: gpt-image-2 는 토큰 과금) */
  pricePerImage: number | null
}

export const DEFAULT_IMAGE_MODEL: ImageModelKey = 'gpt-image-2'

export const IMAGE_MODELS: Record<ImageModelKey, ImageModelSpec> = {
  'gpt-image-2': {
    key: 'gpt-image-2',
    label: 'GPT Image 2',
    description: 'OpenAI · crisp typography, reliable identity',
    t2iEndpoint: 'openai/gpt-image-2',
    editEndpoint: 'openai/gpt-image-2/edit',
    canvas: 'aspect_ratio',
    pricePerImage: null,
  },
  'nano-banana': {
    key: 'nano-banana',
    label: 'Nano Banana',
    description: 'Google Gemini · strong character consistency',
    t2iEndpoint: 'fal-ai/nano-banana',
    editEndpoint: 'fal-ai/nano-banana/edit',
    canvas: 'aspect_ratio',
    pricePerImage: 0.039,
  },
  'seedream-4': {
    key: 'seedream-4',
    label: 'Seedream 4',
    description: 'ByteDance · high-res, rich editing',
    t2iEndpoint: 'fal-ai/bytedance/seedream/v4/text-to-image',
    editEndpoint: 'fal-ai/bytedance/seedream/v4/edit',
    canvas: 'image_size',
    pricePerImage: 0.03,
  },
  'flux-2-klein': {
    key: 'flux-2-klein',
    label: 'FLUX.2 Klein',
    description: 'Black Forest Labs · fast & cheap, no reference',
    t2iEndpoint: 'fal-ai/flux-2/klein/9b',
    editEndpoint: null,
    canvas: 'image_size',
    pricePerImage: 0.012,
  },
}

/** 팝업/채팅에 노출하는 순서 (기본 모델 먼저). */
export const IMAGE_MODEL_ORDER: ImageModelKey[] = [
  'gpt-image-2',
  'nano-banana',
  'seedream-4',
  'flux-2-klein',
]

/** 문자열이 유효한 ImageModelKey 인지 (채팅 cc 입력 화이트리스트 검증용). */
export function isImageModelKey(x: unknown): x is ImageModelKey {
  return typeof x === 'string' && x in IMAGE_MODELS
}

/** 임의 문자열(레거시 endpoint·null·undefined) → ImageModelKey 정규화. 미상은 기본 모델. */
export function normalizeImageModelKey(x: unknown): ImageModelKey {
  if (isImageModelKey(x)) return x
  // 레거시/직접 endpoint 문자열도 흡수한다 (예: 'openai/gpt-image-2/edit').
  if (typeof x === 'string') {
    for (const spec of Object.values(IMAGE_MODELS)) {
      if (x === spec.t2iEndpoint || x === spec.editEndpoint) return spec.key
    }
  }
  return DEFAULT_IMAGE_MODEL
}

/** 모델이 reference(캐릭터 정체성·템플릿)를 실을 수 있는가. */
export function imageModelSupportsReference(key: ImageModelKey): boolean {
  return IMAGE_MODELS[key].editEndpoint != null
}

/**
 * 선택 모델 + reference 유무 → 실제 fal 엔드포인트 결정.
 *   reference 가 필요한데 editEndpoint 가 없으면 순수 T2I 로 폴백한다(reference 는 라우트가 버린다).
 */
export function resolveImageEndpoint(
  key: ImageModelKey,
  hasReference: boolean,
): { endpoint: string; isEdit: boolean } {
  const spec = IMAGE_MODELS[key]
  if (hasReference && spec.editEndpoint) {
    return { endpoint: spec.editEndpoint, isEdit: true }
  }
  return { endpoint: spec.t2iEndpoint, isEdit: false }
}
