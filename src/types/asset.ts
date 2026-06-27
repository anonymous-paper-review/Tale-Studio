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

import type { CandidateImage } from '@/lib/image-provenance'

export interface CharacterAsset {
  characterId: string
  name: string
  views: CharacterView
  entityType: 'person' | 'object'
  /** Writer 정의 계승 — asset-storage 등록 시 description/prompt로 전파 */
  description?: string
  fixedPrompt?: string
  /** 표시용 외형 — 유저 언어(characters.appearance_native). 없으면 fixedPrompt(영어 base) 폴백. (language boundary S2) */
  appearanceNative?: string
  /** 현재 룩(전역 디자인 토큰 + 의상) 지문 — stale 비교 시 전달(C2). 룩 미반영이면 null. */
  lookFingerprint?: string | null
  /** 뷰별 후보 히스토리 (character_image_candidates). 없으면 빈 객체. */
  viewCandidates: Partial<Record<CharacterViewKey, CandidateImage[]>>
}

export interface WorldAsset {
  locationId: string
  name: string
  sceneId: string
  wideShot: string | null
  establishingShot: string | null
  /** Writer/Producer 정의 계승 — asset-storage 등록 시 prompt(생성)로 전파. 영어 base. */
  visualDescription?: string
  /** 표시·등록 description 용 — 유저 언어(locations.visual_description_native). 없으면 visualDescription 폴백. (S2b) */
  visualDescriptionNative?: string
  timeOfDay?: string
  mood?: string
  purpose?: string
  origin?: 'producer' | 'writer'
  userEdited?: boolean
  stale?: boolean
  styleDescription?: string
  lightingSources?: string[]
  props?: string[]
  /** world 샷별 후보 히스토리 (location_image_candidates, C4 AC18 — 캐릭터 viewCandidates 대칭). 없으면 빈 객체. */
  viewCandidates?: Partial<Record<'wideShot' | 'establishingShot', CandidateImage[]>>
}
