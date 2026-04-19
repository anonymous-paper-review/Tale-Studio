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

export interface CameraPreset {
  brand: string         // brand id: 'arri' | 'panavision' | 'red' | 'cooke' | 'zeiss'
  focalLength: number   // mm: 24 | 35 | 50 | 85
  aperture: number      // f-stop: 1.4 | 2 | 2.8 | 4 | 5.6 | 8
  whiteBalance: number  // kelvin: 3200 | 5600 | 6500 or custom
}

export const DEFAULT_CAMERA_PRESET: CameraPreset = {
  brand: 'arri',
  focalLength: 35,
  aperture: 2.8,
  whiteBalance: 5600,
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
  cameraPreset?: CameraPreset
  movementPreset?: string | null
  movementIntensity?: number
  lighting: LightingConfig
  referenceImageUrl?: string | null
}

export interface VideoClip {
  shotId: string
  url: string | null
  status: 'pending' | 'generating' | 'completed' | 'failed'
  thumbnailUrl: string | null
  trimStart?: number  // seconds, client-only for P5 crop
  trimEnd?: number    // seconds, client-only for P5 crop
}
