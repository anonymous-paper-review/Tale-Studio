// ============================================================================
// Image model registry — 이미지 생성 모델 카탈로그 (Artist 캐릭터 시트 · Director 스토리보드 공용).
//
// video-models.ts 와 대칭: 여기 spec 하나로 (1) 팝업/채팅이 고를 수 있는 목록,
// (2) 라우트가 고를 fal 엔드포인트(T2I vs edit), (3) buildFalImageInput 이 넣을
// canvas 파라미터(aspect_ratio vs image_size)를 모두 결정한다.
//
// #registry-merge(2026-08-31): Artist(#g4)와 Director(#image-model-select)가 각자 만든 두
//   레지스트리를 하나로 합쳤다. Director 쪽 spec 은 endpoint 하나뿐이라 reference 가 있는
//   생성에서 edit 갈래로 못 갔다 — 아래 t2i/edit 분리 구조가 그 상위집합이라 이쪽으로 통일한다.
//
// reference(정체성/템플릿) 처리:
//   캐릭터 턴어라운드·방향뷰·비기본 모습은 전부 reference 이미지를 넣는 image-to-image(edit)다.
//   그래서 editEndpoint 가 있는 모델만 캐릭터 정체성을 이어받을 수 있다. editEndpoint 가 null 인
//   모델(순수 T2I)은 reference 없이 프롬프트만으로 그린다 — 빠르고 싸지만 정체성이 약하다.
//   앵커(스타일 레퍼런스)가 있을 때 style-anchor.ts 는 base.model 이 '/edit' 로 끝나지 않으면
//   openai/gpt-image-2/edit 로 되돌린다 — 그래서 editEndpoint 는 반드시 '/edit' 로 끝나야 존중된다.
//
// canvas 파라미터(모델 스키마 실측, fal llms.txt 기준):
//   - aspect_ratio 계열: nano-banana-2(t2i·edit, resolution 0.5K~4K 등급만 있고 정확한 픽셀 캔버스는 없음),
//     nano-banana(t2i·edit), openai/gpt-image-2(레거시 — 실제로는 image_size지만
//     기존 라우트가 aspect_ratio 를 넘겨도 무해히 무시되는 검증된 경로라 그대로 둔다).
//   - image_size 계열: seedream v4(t2i·edit), flux-2 klein.
//   - grok-imagine 은 fal.ts 가 prompt+image_urls 만 보내는 전용 분기라 canvas 값을 쓰지 않는다.
//
// 새 모델은 fal.ts 의 입력 분기가 그 스키마를 알고 model-schemas.ts 에 필드가 등록됐을 때만
//   추가한다 — 모르는 모델을 나열하면 422 로 죽는 가짜 선택지가 된다(tests/image-models.test.ts 가 잠근다).
// ============================================================================

export type ImageModelKey =
  | 'gpt-image-2'
  | 'nano-banana-2'
  | 'nano-banana'
  | 'seedream-4'
  | 'flux-2-klein'
  | 'grok-imagine'

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

// #owner-default(2026-08-31): Artist 기본 이미지 모델을 nano-banana 로 변경(오너 지시).
// #owner-default(2026-09-02): nano-banana-2(Gemini 3.1 Flash Image) 로 교체(오너 지시). 1세대는 선택지로 남긴다.
export const DEFAULT_IMAGE_MODEL: ImageModelKey = 'nano-banana-2'

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
  'nano-banana-2': {
    key: 'nano-banana-2',
    label: 'Nano Banana 2',
    description: 'Google Gemini 3.1 · strong character consistency, up to 14 references',
    t2iEndpoint: 'fal-ai/nano-banana-2',
    editEndpoint: 'fal-ai/nano-banana-2/edit',
    canvas: 'aspect_ratio',
    // fal 표기 $0.08/장(1K 기준; 2K ×1.5, 4K ×2). 라우트는 resolution 을 보내지 않아 기본 1K.
    pricePerImage: 0.08,
  },
  'nano-banana': {
    key: 'nano-banana',
    label: 'Nano Banana',
    description: 'Google Gemini 2.5 · previous generation',
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
  'grok-imagine': {
    key: 'grok-imagine',
    label: 'Grok Imagine',
    description: 'xAI · keeps the input framing',
    t2iEndpoint: 'xai/grok-imagine-image',
    editEndpoint: 'xai/grok-imagine-image/edit',
    // fal.ts 가 prompt+image_urls 만 보내는 전용 분기라 실제로는 안 쓰인다(표기상 기본값).
    canvas: 'aspect_ratio',
    pricePerImage: null,
  },
}

/** 팝업/채팅/패널에 노출하는 순서 (기본 모델 먼저). */
export const IMAGE_MODEL_ORDER: ImageModelKey[] = [
  'nano-banana-2',
  'nano-banana',
  'gpt-image-2',
  'seedream-4',
  'flux-2-klein',
  'grok-imagine',
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

// ── 시트 지오메트리 계약 경로(#sheet-model-guard 2026-09-01) ──
// 러프/실사 시트 repaint(스트립·그리드)는 **정확한 픽셀 캔버스**(예: 2880×1280)를 요구한다 —
// finalize 가 반환 치수를 계약 검증하므로, aspect_ratio 방식 모델(nano-banana·nano-banana-2 등 고정 ~1024²)이
// 들어오면 전 잡이 '계약 위반(요청 2880x1280, 반환 1024x1024)'으로 죽는다(실측 3e0169eb 18/18).
// 자격 = image_size 를 실제로 존중 + edit(레퍼런스) 지원. gpt-image-2 는 canvas 표기가 legacy
// aspect_ratio 지만 image_size 를 수락하는 검증된 시트 경로다(완료 239건 실측).
export const DEFAULT_SHEET_IMAGE_MODEL: ImageModelKey = 'gpt-image-2'
const SHEET_CAPABLE: ReadonlySet<ImageModelKey> = new Set(['gpt-image-2', 'seedream-4'])

export function imageModelSupportsSheetCanvas(key: ImageModelKey): boolean {
  return SHEET_CAPABLE.has(key)
}

/** 시트 계약 경로용 모델 강제 — 부적합 선택(기본 모델 포함)은 검증된 시트 모델로 대체한다. */
export function resolveSheetImageModel(requested: ImageModelKey | null | undefined): ImageModelKey {
  return requested && imageModelSupportsSheetCanvas(requested) ? requested : DEFAULT_SHEET_IMAGE_MODEL
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
