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

// ─────────────────────────────────────────────────────────────────────────────
// 정적 레퍼런스 데이터 (카메라 기어 / 무브먼트)
//
// 옛 구현은 databases/knowledge/*.yaml 을 fs.readFileSync 로 읽었으나, 그 YAML 들은
// .gitignore 로 제외되어 레포·Vercel 번들에 없다 → /var/task/... ENOENT.
// 카메라 기어/무브먼트는 고정 레퍼런스 데이터(사용자 데이터 아님)이므로 코드에 인라인해
// 번들과 함께 배포한다(서버리스 안전 + DB 라운드트립 불필요 + 함수 sync 유지).
// 출처: databases/migrations/003_camera_presets.sql (brands), 002_camera_movements.sql (movements).
// ─────────────────────────────────────────────────────────────────────────────

const CAMERA_BRANDS: CameraBrand[] = [
  { id: 'arri', label: 'Arri', full_name: 'Arri Alexa', characteristics: 'warm filmic tones, smooth highlight roll-off' },
  { id: 'panavision', label: 'Panavision', full_name: 'Panavision Millennium DXL2', characteristics: 'anamorphic flares, wide latitude' },
  { id: 'red', label: 'RED', full_name: 'RED V-Raptor', characteristics: 'sharp digital, high resolution' },
  { id: 'cooke', label: 'Cooke', full_name: 'Cooke S7/i', characteristics: 'warm Cooke look, vintage color rendition' },
  { id: 'zeiss', label: 'Zeiss', full_name: 'Zeiss Supreme Prime', characteristics: 'clean, neutral, high contrast' },
]

const FOCAL_LENGTHS: number[] = [24, 35, 50, 85]
const APERTURES: number[] = [1.4, 2, 2.8, 4, 5.6, 8]

// WB 프리셋 (표준 영화 색온도). 옛 YAML 의 white_balances 섹션은 마이그레이션에 미보존이라
// 표준값으로 재구성 — 필요 시 값/라벨 조정 가능.
const WHITE_BALANCES: WhiteBalancePreset[] = [
  { id: 'tungsten', label: 'Tungsten', kelvin: 3200 },
  { id: 'warm', label: 'Warm', kelvin: 4300 },
  { id: 'daylight', label: 'Daylight', kelvin: 5600 },
  { id: 'cloudy', label: 'Cloudy', kelvin: 6500 },
  { id: 'shade', label: 'Shade', kelvin: 7500 },
]

const CAMERA_MOVEMENTS: CameraMovement[] = [
  { id: 'static', label: 'Static', description: 'Locked down camera, no movement', axis: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, prompt_fragment: 'locked down camera, no movement' },
  { id: 'dolly-in', label: 'Dolly In', description: 'Slow forward push toward subject', axis: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 5 }, prompt_fragment: 'dolly in, slow forward push' },
  { id: 'dolly-out', label: 'Dolly Out', description: 'Slow pull back away from subject', axis: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: -5 }, prompt_fragment: 'dolly out, slow pull back' },
  { id: 'push-in', label: 'Push In', description: 'Rapid push toward subject', axis: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 8 }, prompt_fragment: 'rapid push-in, emphatic forward zoom' },
  { id: 'pull-out', label: 'Pull Out', description: 'Rapid pull away to reveal context', axis: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: -8 }, prompt_fragment: 'rapid pull-out, revealing wider context' },
  { id: 'orbit-left', label: 'Orbit Left', description: 'Arc around subject to the left', axis: { horizontal: 6, vertical: 0, pan: 0, tilt: -3, roll: 0, zoom: 0 }, prompt_fragment: 'orbital camera arcing left around subject' },
  { id: 'orbit-right', label: 'Orbit Right', description: 'Arc around subject to the right', axis: { horizontal: -6, vertical: 0, pan: 0, tilt: 3, roll: 0, zoom: 0 }, prompt_fragment: 'orbital camera arcing right around subject' },
  { id: 'pan-left', label: 'Pan Left', description: 'Smooth horizontal pan to the left', axis: { horizontal: 0, vertical: 0, pan: 0, tilt: -7, roll: 0, zoom: 0 }, prompt_fragment: 'smooth pan left across the scene' },
  { id: 'pan-right', label: 'Pan Right', description: 'Smooth horizontal pan to the right', axis: { horizontal: 0, vertical: 0, pan: 0, tilt: 7, roll: 0, zoom: 0 }, prompt_fragment: 'smooth pan right across the scene' },
  { id: 'whip-pan-left', label: 'Whip Pan L', description: 'Fast whip pan to the left', axis: { horizontal: 0, vertical: 0, pan: 0, tilt: -10, roll: 0, zoom: 0 }, prompt_fragment: 'whip pan left, fast motion blur' },
  { id: 'whip-pan-right', label: 'Whip Pan R', description: 'Fast whip pan to the right', axis: { horizontal: 0, vertical: 0, pan: 0, tilt: 10, roll: 0, zoom: 0 }, prompt_fragment: 'whip pan right, fast motion blur' },
  { id: 'crane-up', label: 'Crane Up', description: 'Rising vertical movement', axis: { horizontal: 0, vertical: 8, pan: -2, tilt: 0, roll: 0, zoom: 0 }, prompt_fragment: 'crane up, rising vertical reveal' },
  { id: 'crane-down', label: 'Crane Down', description: 'Descending vertical movement', axis: { horizontal: 0, vertical: -8, pan: 2, tilt: 0, roll: 0, zoom: 0 }, prompt_fragment: 'crane down, descending vertical movement' },
  { id: 'handheld', label: 'Handheld', description: 'Documentary-style shaky cam', axis: { horizontal: 2, vertical: 1, pan: 2, tilt: 2, roll: 1, zoom: 0 }, prompt_fragment: 'handheld shaky-cam, documentary feel' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Techniques: 라이브 DB 에 knowledge_techniques 테이블이 있으나 본 로더는 아직 YAML 을 읽는다.
//   해당 YAML(camera_language/rendering_style/shot_grammar.yaml)도 gitignore 라 Vercel 에 없음.
//   → 읽기 실패는 throw 하지 않고 [] 로 graceful degrade (generate-shots 가 죽지 않게).
//   TODO(후속): queryTechniques 를 knowledge_techniques DB(어댑터)로 전환. (CLAUDE.md: 프로덕션=Supabase)
// ─────────────────────────────────────────────────────────────────────────────

const KB_DIR = path.join(process.cwd(), 'databases', 'knowledge')
let warnedTechniquesMissing = false

function loadYaml<T>(filename: string): T {
  const filePath = path.join(KB_DIR, filename)
  const content = fs.readFileSync(filePath, 'utf-8')
  return yaml.load(content) as T
}

let techniquesCache: Technique[] | null = null

export function loadAllTechniques(): Technique[] {
  if (techniquesCache) return techniquesCache

  const categories = ['camera_language', 'rendering_style', 'shot_grammar']
  const all: Technique[] = []

  for (const cat of categories) {
    try {
      const data = loadYaml<{ techniques: Omit<Technique, 'category'>[] }>(
        `${cat}.yaml`,
      )
      for (const t of data.techniques) {
        all.push({ ...t, id: t.id })
      }
    } catch (e) {
      // YAML 부재(Vercel 등) → 해당 카테고리 스킵. 1회 경고.
      if (!warnedTechniquesMissing) {
        warnedTechniquesMissing = true
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[knowledge] technique YAML unavailable (${msg}). Returning empty set — wire to knowledge_techniques DB.`)
      }
    }
  }

  // 부분 로드라도 캐시(전부 실패 시 [] 캐시 — Vercel에서 매 호출 재시도 방지)
  techniquesCache = all
  return all
}

export function loadCameraGear(): CameraGearPresets {
  return {
    brands: CAMERA_BRANDS,
    focal_lengths: FOCAL_LENGTHS,
    apertures: APERTURES,
    white_balances: WHITE_BALANCES,
  }
}

export function findCameraBrand(id: string): CameraBrand | undefined {
  return CAMERA_BRANDS.find((b) => b.id === id)
}

export function loadCameraMovements(): CameraMovement[] {
  return CAMERA_MOVEMENTS
}

export function findCameraMovement(id: string): CameraMovement | undefined {
  return CAMERA_MOVEMENTS.find((m) => m.id === id)
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
