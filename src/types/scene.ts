export interface Scene {
  sceneId: string
  narrativeSummary: string
  originalTextQuote: string
  location: string
  timeOfDay: string
  mood: string
  charactersPresent: string[]
  estimatedDurationSeconds: number
  /** DB scenes.sort_order — 씬 순서. 위치 삽입(추가 팝업)에서 이웃 기준 계산에 사용. */
  sortOrder?: number
}

export interface Character {
  characterId: string
  name: string
  role: 'protagonist' | 'antagonist' | 'supporting'
  description: string
  fixedPrompt: string
  referenceImages: string[]
}

export interface Location {
  locationId: string
  name: string
  visualDescription: string
  timeOfDay: string
  lightingDirection: string
  purpose?: string
  origin?: 'producer' | 'writer'
  userEdited?: boolean
  stale?: boolean
  styleDescription?: string
  lightingSources?: string[]
  props?: string[]
}

export interface SceneManifest {
  scenes: Scene[]
  characters: Character[]
  locations: Location[]
}
