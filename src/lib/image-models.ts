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
//     기존 라우트가 aspect_ratio 를 넘겨도 무해히 무시되는 검증된 경로라 그대로 둔다. 무시되면 기본 4:3(1024x768)이다.
//     예외(2026-10-13): 기준 그림 없이 그리는 그림체(실사)의 배경은 world-submit 이 image_size 를 직접 정해 보낸다).
//   - image_size 계열: seedream v4(t2i·edit), flux-2 klein, MiniMax H3 Image(t2i·edit — 가로 × 세로를 정확히 받는다, 넓이 65.5만~2,000만 · 1:3~3:1).
//     H3 는 fal 견본 크기 중 16:9(1024×576)가 넓이 하한 밑이라 fal.ts 가 비율에서 크기를 직접 셈한다(2026-11-26 D5).
//   - grok-imagine 은 fal.ts 전용 분기다 — 호출자가 정한 비율을 Grok 이 받는 가장 가까운 aspect_ratio 로 보내고(2026-10-12),
//     비율이 없으면 입력 그림 비율을 따른다. Director 에셋 노드는 Grok 이면 비율을 빼서 입력 구도를 지킨다. 크기(image_size)는 받지 않는다.
//
// 새 모델은 fal.ts 의 입력 분기가 그 스키마를 알고 model-schemas.ts 에 필드가 등록됐을 때만
//   추가한다 — 모르는 모델을 나열하면 422 로 죽는 가짜 선택지가 된다(tests/image-models.test.ts 가 잠근다).
// ============================================================================

import { nearestNanoBanana2Ratio } from '@/lib/fal/aspect-size'

export type ImageModelKey =
  | 'gpt-image-2'
  | 'nano-banana-2'
  | 'nano-banana'
  | 'seedream-4'
  | 'flux-2-klein'
  | 'grok-imagine'
  | 'h3-image'

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
// #owner-default(2026-10-09): gpt-image-2 로 교체(오너 지시 "기본 모델 gpt-image-2으로 변경해줘", 모든 스타일).
//   실측: 실사 스타일 인물 시트가 nano-banana-2 로는 18장 중 7장만 실사, gpt-image-2 로는 8장 모두 실사.
//   nano-banana-2 와 1세대는 선택지로 남긴다.
export const DEFAULT_IMAGE_MODEL: ImageModelKey = 'gpt-image-2'
/** 배경(월드) 기본 모델 — 오너 B5(2026-09-04) "지금 것": 배경은 종전대로 GPT Image 2(앵커가 있으면 edit)로 첫 생성한다.
 *  캐릭터와 같은 것은 "고를 수 있다"는 기능이지 기본값이 아니다. */
export const DEFAULT_WORLD_IMAGE_MODEL: ImageModelKey = 'gpt-image-2'

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
    // fal.ts 전용 분기가 비율을 직접 정한다(정한 비율은 가장 가까운 Grok 비율로, 없으면 입력 그림 비율).
    canvas: 'aspect_ratio',
    pricePerImage: null,
  },
  // 2026-11-26 오너 D5 "이미지모델 H3image … 까지 늘려줘" — fal 의 MiniMax H3 Image(참고 그림 16장 · 정확한 크기). 토큰 과금이라 장당 값 미표기.
  'h3-image': {
    key: 'h3-image',
    label: 'H3 Image',
    description: 'MiniMax · exact sizes, up to 16 references',
    t2iEndpoint: 'minimax/h3-image/text-to-image',
    editEndpoint: 'minimax/h3-image/edit',
    canvas: 'image_size',
    pricePerImage: null,
  },
}

/** 팝업/채팅/패널에 노출하는 순서 (기본 모델 먼저). */
export const IMAGE_MODEL_ORDER: ImageModelKey[] = [
  'gpt-image-2',
  'nano-banana-2',
  'nano-banana',
  'seedream-4',
  'flux-2-klein',
  'grok-imagine',
  'h3-image',
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
// h3-image(2026-11-26 D5): 개발 DB 실측 2/2 — 요청한 시트 캔버스 그대로 돌려줌(1536×896 · 1024×1536, 계약 위반 0).
// nano-banana-2(2026-11-26 리드 Q2 길 a): 정확한 크기는 못 받지만 시트 크기에 가장 가까운 비율로 그리게 하고(fal.ts), finalize 가 칸 모양으로
//   맞춰 자른다(sheet-fit.ts). 실측 2/2 칸 자리 맞음(16:9 프로젝트 768×1376 · 9:16 프로젝트 1376×768). 가까운 비율이 없는 시트(정사각 640×1792 →
//   1:4 도 43% 어긋남)와 시트 크기를 모를 때는 쓰지 않는다. 1세대 nano-banana 는 그대로 시트에 쓰지 않는다.
export const DEFAULT_SHEET_IMAGE_MODEL: ImageModelKey = 'gpt-image-2'
const SHEET_CAPABLE: ReadonlySet<ImageModelKey> = new Set(['gpt-image-2', 'seedream-4', 'h3-image'])
/** 시트를 비율로만 그리는 모델 — 시트 크기에 가장 가까운 비율이 이만큼(로그 비 8%) 안일 때만 시트에 쓴다. */
const SHEET_BY_RATIO: ReadonlySet<ImageModelKey> = new Set(['nano-banana-2'])
export const SHEET_RATIO_MAX_GAP = 0.08

/** 이 모델로 시트(sheetCanvas 'WxH')를 그릴 수 있는가 — 비율로만 그리는 모델은 시트 크기를 알 때만 판정한다. */
export function imageModelSupportsSheetCanvas(key: ImageModelKey, sheetCanvas?: string | null): boolean {
  if (SHEET_CAPABLE.has(key)) return true
  if (!SHEET_BY_RATIO.has(key) || !sheetCanvas) return false
  const size = /^(\d+)x(\d+)$/.exec(sheetCanvas.trim())
  return !!size && nearestNanoBanana2Ratio(Number(size[1]), Number(size[2])).gap <= SHEET_RATIO_MAX_GAP
}

/** 시트 계약 경로용 모델 강제 — 부적합 선택(기본 모델 포함)은 검증된 시트 모델로 대체한다. sheetCanvas = 이번 시트 크기('WxH'). */
export function resolveSheetImageModel(requested: ImageModelKey | null | undefined, sheetCanvas?: string | null): ImageModelKey {
  return requested && imageModelSupportsSheetCanvas(requested, sheetCanvas) ? requested : DEFAULT_SHEET_IMAGE_MODEL
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
