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

// #f6(2026-08-26 오너): 'Main'만으로는 의미 불명 — 서술형 라벨. 값은 i18n 키(EN 원문)이며
//   표시 지점에서 t()로 감싼다(messages-ko 에 번역).
export const CHARACTER_VIEW_LABELS: Record<CharacterViewKey, string> = {
  main: 'Main sheet (turnaround)',
  back: 'Back view',
  sideLeft: 'Side view (left)',
  sideRight: 'Side view (right)',
}

import type { CandidateImage } from '@/lib/image-provenance'

/** 캐릭터의 한 "모습" — 시점·의상 변형 (#g4 2026-08-27).
 *  옥화 ─┬ 현재(기본)
 *        └ 젊은 시절  ← 옥화 얼굴을 참조해 생성 = 연속성
 *  모습이 하나뿐이면 카드는 지금과 똑같이 보인다(탭 없음). */
export interface CharacterAppearance {
  appearanceKey: string
  label: string
  isDefault: boolean
  /** 서사 시점(past/present 등). 플래시백 씬이 자동 선택할 근거. 씬의 time_of_day(하루 중 시각)와 다른 축. */
  narrativeTime: NarrativeTime | null
  sheetUrl: string | null
  portraitUrl: string | null
  appearance: string | null
  appearanceNative: string | null
  /** 모습별 뷰 후보 히스토리. 다른 모습 후보를 표시·stale 판정에 섞지 않는다. */
  viewCandidates: Partial<Record<CharacterViewKey, CandidateImage[]>>
}

export type NarrativeTime = 'present' | 'past' | 'future'

export interface CharacterAsset {
  characterId: string
  name: string
  views: CharacterView
  /** 이 캐릭터의 모습 목록(#g4). 기본 모습이 항상 하나 있다. */
  appearances: CharacterAppearance[]
  entityType: 'person' | 'object'
  /** Writer 정의 계승 — asset-storage 등록 시 description/prompt로 전파 */
  description?: string
  fixedPrompt?: string
  /** 표시용 외형 — 유저 언어(characters.appearance_native). 없으면 fixedPrompt(영어 base) 폴백. (language boundary S2) */
  appearanceNative?: string
  /** 현재 룩(전역 디자인 토큰 + 의상) 지문 — stale 비교 시 전달(C2). 룩 미반영이면 null. */
  lookFingerprint?: string | null
  /** 출처 — producer 정의(핸드오프) vs writer 파이프라인 추가. 온보딩 갭 계산에 사용. */
  origin?: 'producer' | 'writer'
  /** 대표 포트레이트(028) — 턴어라운드 시트 좌상단 CHARACTER CONCEPT 크롭. 없으면 views.main 폴백. */
  portrait?: string | null
  /** 뷰별 후보 히스토리 (character_image_candidates). 없으면 빈 객체. */
  viewCandidates: Partial<Record<CharacterViewKey, CandidateImage[]>>
}

export interface WorldAsset {
  locationId: string
  name: string
  sceneId: string
  wideShot: string | null
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
}
