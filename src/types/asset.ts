// ============================================================================
// Generated image — produced by image-gen pipeline, stored in Asset Storage.
// Moved here from the (removed) L0 canvas-store so asset-storage-store and the
// Director contract no longer depend on canvas internals.
// ============================================================================

export type ImageModelId = 'imagen' | 'h100-self'

export type FiveViewKey = 'front' | 'left' | 'right' | 'back' | 'detail'

export type GeneratedImage = {
  id: string
  url: string
  prompt: string
  seed?: number
  angle?: number
  view?: FiveViewKey
  modelId: ImageModelId
  createdAt: number
}

// 캐릭터 뷰 모델 (crop 폐기, 2026-06-05 / front 통합, 2026-06-05). main=정면 풀바디 대표
// 포트레이트(T2I, 핸드오프에서 미리 생성) — 이전의 별도 front 뷰를 흡수했다.
// back/sideLeft/sideRight=main 을 reference 로 한 개별 i2i 생성.
export interface CharacterView {
  main: string | null
  back: string | null
  sideLeft: string | null
  sideRight: string | null
}

export type CharacterViewKey = 'main' | 'back' | 'sideLeft' | 'sideRight'

export const CHARACTER_VIEW_KEYS: CharacterViewKey[] = [
  'main',
  'back',
  'sideLeft',
  'sideRight',
]

export const CHARACTER_VIEW_COLUMNS: Record<CharacterViewKey, string> = {
  main: 'view_main',
  back: 'view_back',
  sideLeft: 'view_side_left',
  sideRight: 'view_side_right',
}

export const CHARACTER_VIEW_LABELS: Record<CharacterViewKey, string> = {
  main: 'Main',
  back: 'Back',
  sideLeft: 'Side (L)',
  sideRight: 'Side (R)',
}

export interface CharacterAsset {
  characterId: string
  name: string
  views: CharacterView
  entityType: 'person' | 'object'
  /** Writer 정의 계승 — asset-storage 등록 시 description/prompt로 전파 */
  description?: string
  fixedPrompt?: string
}

export interface WorldAsset {
  locationId: string
  name: string
  sceneId: string
  wideShot: string | null
  establishingShot: string | null
  /** Writer 정의 계승 — asset-storage 등록 시 description/prompt로 전파 */
  visualDescription?: string
}
