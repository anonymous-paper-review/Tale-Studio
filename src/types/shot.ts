export type ShotType =
  | 'ECU' | 'CU' | 'MCU' | 'MS' | 'MFS' | 'FS'
  | 'WS' | 'EWS' | 'OTS' | 'POV' | 'TRACK' | '2S'

export type GenerationMethod = 'T2V' | 'I2V'

export interface DialogueLine {
  characterId: string
  text: string
  emotion: string
  delivery: string
  durationHint: number
}

/** Kling 6-axis camera config, each -10 to +10 */
export interface CameraConfig {
  horizontal: number
  vertical: number
  pan: number   // pitch (up/down rotation)
  tilt: number  // yaw (left/right rotation)
  roll: number
  zoom: number
}

export interface LightingConfig {
  position: 'left' | 'top' | 'right' | 'front'
  brightness: number    // 0-100
  colorTemp: number     // 2000-10000 Kelvin
}

export interface Shot {
  shotId: string
  sceneId: string
  shotType: ShotType
  actionDescription: string
  characters: string[]
  durationSeconds: number
  generationMethod: GenerationMethod
  dialogueLines: DialogueLine[]
  camera: CameraConfig
  lighting: LightingConfig
}

export interface VideoClip {
  shotId: string
  url: string | null
  status: 'pending' | 'generating' | 'completed' | 'failed'
  thumbnailUrl: string | null
}
