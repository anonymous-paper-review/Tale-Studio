// ============================================================================
// Image model registry — Director 이미지(스토리보드) 생성 모델 카탈로그.
//
// 실제 생성 경로는 fal 큐(src/lib/writer/llm/fal.ts) — 기본 모델 openai/gpt-image-2
// (+레퍼런스 있으면 /edit 변형). UI(이미지 노드 팝업/패널/툴바)가 이 레지스트리로
// fal.ai 기준 모델명을 표기한다. 지원 모델이 늘면 여기에 행을 추가한다.
//
// #ui-cleanup(2026-08-31): 옛 "Midjourney 8.1 (Coming soon)" 더미 칩은 fal 카탈로그에
// 없는 가짜 선택지라 제거 — 이 레지스트리가 표기의 단일 진실이다.
// ============================================================================

export type ImageModelKey = 'gpt-image-2'

export interface ImageModelSpec {
  key: ImageModelKey
  /** 사람이 읽는 라벨 (UI 표기) */
  label: string
  /** fal.ai 모델 id — falImageSubmit 이 실제 제출하는 경로와 일치 */
  endpoint: string
  /** UI 힌트 (화면비 등) */
  hint: string
}

export const DEFAULT_IMAGE_MODEL_KEY: ImageModelKey = 'gpt-image-2'

export const IMAGE_MODELS: Record<ImageModelKey, ImageModelSpec> = {
  'gpt-image-2': {
    key: 'gpt-image-2',
    label: 'GPT Image 2.0',
    endpoint: 'openai/gpt-image-2',
    hint: '16:9',
  },
}

export const IMAGE_MODEL_ORDER: ImageModelKey[] = ['gpt-image-2']
