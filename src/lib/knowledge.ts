import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

interface Technique {
  id: string
  name: string
  prompt_fragment: string
  emotional_tags: string[]
  shot_type_affinity: string[]
  description: string
}

export interface CameraBrand {
  id: string
  label: string
  full_name: string
  characteristics: string
}

export interface WhiteBalancePreset {
  id: string
  label: string
  kelvin: number
}

export interface CameraGearPresets {
  brands: CameraBrand[]
  focal_lengths: number[]
  apertures: number[]
  white_balances: WhiteBalancePreset[]
}

export interface CameraMovement {
  id: string
  label: string
  description: string
  axis: {
    horizontal: number
    vertical: number
    pan: number
    tilt: number
    roll: number
    zoom: number
  }
  prompt_fragment: string
}

const KB_DIR = path.join(process.cwd(), 'databases', 'knowledge')

function loadYaml<T>(filename: string): T {
  const filePath = path.join(KB_DIR, filename)
  const content = fs.readFileSync(filePath, 'utf-8')
  return yaml.load(content) as T
}

let techniquesCache: Technique[] | null = null
let cameraGearCache: CameraGearPresets | null = null
let movementsCache: CameraMovement[] | null = null

export function loadAllTechniques(): Technique[] {
  if (techniquesCache) return techniquesCache

  const categories = ['camera_language', 'rendering_style', 'shot_grammar']
  const all: Technique[] = []

  for (const cat of categories) {
    const data = loadYaml<{ techniques: Omit<Technique, 'category'>[] }>(
      `${cat}.yaml`,
    )
    for (const t of data.techniques) {
      all.push({ ...t, id: t.id })
    }
  }

  techniquesCache = all
  return all
}

export function loadCameraGear(): CameraGearPresets {
  if (cameraGearCache) return cameraGearCache

  const data = loadYaml<CameraGearPresets>('camera_presets.yaml')
  cameraGearCache = {
    brands: data.brands ?? [],
    focal_lengths: data.focal_lengths ?? [24, 35, 50, 85],
    apertures: data.apertures ?? [1.4, 2, 2.8, 4, 5.6, 8],
    white_balances: data.white_balances ?? [],
  }
  return cameraGearCache
}

export function findCameraBrand(id: string): CameraBrand | undefined {
  return loadCameraGear().brands.find((b) => b.id === id)
}

export function loadCameraMovements(): CameraMovement[] {
  if (movementsCache) return movementsCache

  const data = loadYaml<{ movements: CameraMovement[] }>('camera_movements.yaml')
  movementsCache = data.movements
  return data.movements
}

export function findCameraMovement(id: string): CameraMovement | undefined {
  return loadCameraMovements().find((m) => m.id === id)
}

export function queryTechniques(
  moods: string[],
  shotType?: string,
): Technique[] {
  const all = loadAllTechniques()

  return all.filter((t) => {
    const moodMatch =
      moods.length === 0 ||
      t.emotional_tags.some((tag) => moods.includes(tag))
    const shotMatch =
      !shotType || t.shot_type_affinity.includes(shotType)
    return moodMatch || shotMatch
  })
}
