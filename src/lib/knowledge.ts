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

interface CameraPreset {
  id: string
  name: string
  description: string
  horizontal: number
  vertical: number
  pan: number
  tilt: number
  roll: number
  zoom: number
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
let presetsCache: CameraPreset[] | null = null
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

export function loadCameraPresets(): CameraPreset[] {
  if (presetsCache) return presetsCache

  const data = loadYaml<{ presets: CameraPreset[] }>('camera_presets.yaml')
  presetsCache = data.presets
  return data.presets
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
