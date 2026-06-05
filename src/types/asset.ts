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

// 턴어라운드 시트 뷰 모델 (decisions #37). main=전체 시트(1×4 스트립), 나머지=crop.
export interface CharacterView {
  main: string | null
  front: string | null
  back: string | null
  sideLeft: string | null
  sideRight: string | null
}

export type CharacterViewKey =
  | 'main'
  | 'front'
  | 'back'
  | 'sideLeft'
  | 'sideRight'

export const CHARACTER_VIEW_KEYS: CharacterViewKey[] = [
  'main',
  'front',
  'back',
  'sideLeft',
  'sideRight',
]

export const CHARACTER_VIEW_COLUMNS: Record<CharacterViewKey, string> = {
  main: 'view_main',
  front: 'view_front',
  back: 'view_back',
  sideLeft: 'view_side_left',
  sideRight: 'view_side_right',
}

export const CHARACTER_VIEW_LABELS: Record<CharacterViewKey, string> = {
  main: 'Main',
  front: 'Front',
  back: 'Back',
  sideLeft: 'Side (L)',
  sideRight: 'Side (R)',
}

export interface CharacterAsset {
  characterId: string
  name: string
  views: CharacterView
  locked: boolean
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
