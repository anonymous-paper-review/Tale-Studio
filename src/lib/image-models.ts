// ============================================================================
// Image model registry — Director 이미지(스토리보드) 생성 모델 카탈로그.
//
// 실제 생성 경로는 fal 큐(src/lib/writer/llm/fal.ts). 여기 등록된 모델은 전부
// buildFalImageInput 이 입력 스키마를 아는 계열이다:
//   - openai/gpt-image-2        : 기본. 레퍼런스 있으면 /edit 변형으로 자동 라우팅
//   - fal-ai/flux-2/klein/9b    : flux 계열(image_size preset) — 러프 보드에서 실사용 중
//   - xai/grok-imagine-image    : 전용 스키마(prompt+image_urls만) 처리 존재
// 새 모델은 fal.ts 의 입력 분기가 그 스키마를 알 때만 추가한다 — 모르는 모델을
// 나열하면 422로 죽는 가짜 선택지가 된다.
//
// #ui-cleanup(2026-08-31): 옛 "Midjourney 8.1 (Coming soon)" 더미 칩은 fal 카탈로그에
// 없는 가짜 선택지라 제거 — 이 레지스트리가 표기의 단일 진실이다.
// #image-model-select(2026-08-31): 표기 전용 → 실제 선택으로 승격. Shot.imageModel 이
// generate-storyboard 라우트를 거쳐 falImageSubmit({ model })로 전달된다.
// ============================================================================

export type ImageModelKey =
  | 'gpt-image-2'
  | 'nano-banana'
  | 'flux-2-klein'
  | 'grok-imagine'

export interface ImageModelSpec {
  key: ImageModelKey
  /** 사람이 읽는 라벨 (UI 표기) */
  label: string
  /** fal.ai 모델 id — falImageSubmit 이 실제 제출하는 경로와 일치 */
  endpoint: string
  /** UI 힌트 */
  hint: string
}

export const DEFAULT_IMAGE_MODEL_KEY: ImageModelKey = 'gpt-image-2'

export const IMAGE_MODELS: Record<ImageModelKey, ImageModelSpec> = {
  'gpt-image-2': {
    key: 'gpt-image-2',
    label: 'GPT Image 2.0',
    endpoint: 'openai/gpt-image-2',
    hint: 'Default',
  },
  'nano-banana': {
    key: 'nano-banana',
    label: 'Nano Banana',
    endpoint: 'fal-ai/nano-banana',
    hint: 'Google',
  },
  'flux-2-klein': {
    key: 'flux-2-klein',
    label: 'FLUX.2 Klein 9B',
    endpoint: 'fal-ai/flux-2/klein/9b',
    hint: 'Fast',
  },
  'grok-imagine': {
    key: 'grok-imagine',
    label: 'Grok Imagine',
    endpoint: 'xai/grok-imagine-image',
    hint: 'xAI',
  },
}

export const IMAGE_MODEL_ORDER: ImageModelKey[] = [
  'gpt-image-2',
  'nano-banana',
  'flux-2-klein',
  'grok-imagine',
]

/** 임의 문자열 → ImageModelKey 정규화 (구행/미지정은 기본 모델). */
export function normalizeImageModel(value: unknown): ImageModelKey {
  return typeof value === 'string' && value in IMAGE_MODELS
    ? (value as ImageModelKey)
    : DEFAULT_IMAGE_MODEL_KEY
}
