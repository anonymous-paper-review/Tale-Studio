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

export interface CharacterView {
  front: string | null
  side: string | null
  back: string | null
  threeQuarterLeft?: string | null
  threeQuarterRight?: string | null
}

export type CharacterViewKey =
  | 'front'
  | 'side'
  | 'back'
  | 'threeQuarterLeft'
  | 'threeQuarterRight'

export const CHARACTER_VIEW_KEYS: CharacterViewKey[] = [
  'front',
  'side',
  'back',
  'threeQuarterLeft',
  'threeQuarterRight',
]

export const CHARACTER_VIEW_COLUMNS: Record<CharacterViewKey, string> = {
  front: 'view_front',
  side: 'view_side',
  back: 'view_back',
  threeQuarterLeft: 'view_three_quarter_left',
  threeQuarterRight: 'view_three_quarter_right',
}

export const CHARACTER_VIEW_LABELS: Record<CharacterViewKey, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
  threeQuarterLeft: '3Q Left',
  threeQuarterRight: '3Q Right',
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
