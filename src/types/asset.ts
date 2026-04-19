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
}

export interface WorldAsset {
  locationId: string
  name: string
  sceneId: string
  wideShot: string | null
  establishingShot: string | null
}
