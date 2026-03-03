export interface CharacterView {
  front: string | null
  side: string | null
  back: string | null
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
