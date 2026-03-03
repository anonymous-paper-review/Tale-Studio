export type Act = 'intro' | 'dev' | 'turn' | 'conclusion'

export interface Scene {
  sceneId: string
  act: Act
  narrativeSummary: string
  originalTextQuote: string
  location: string
  timeOfDay: string
  mood: string
  charactersPresent: string[]
  estimatedDurationSeconds: number
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
}

export interface SceneManifest {
  scenes: Scene[]
  characters: Character[]
  locations: Location[]
}
