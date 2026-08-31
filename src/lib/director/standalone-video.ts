import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS } from '@/lib/video-models'
import type { StandaloneVideoConfig } from '@/types/director'

const STANDALONE_OWNER_PREFIX = 'standalone:'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CAMERA_KEYS = ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'] as const
const PRESET_KEYS = ['brand', 'focalLength', 'aperture', 'whiteBalance'] as const
const CONFIG_KEYS = ['prompt', 'camera', 'lighting', 'cameraPreset', 'provider', 'durationSeconds'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

function isFiniteNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

/** Creates the non-FK owner group used by standalone Director video clips. */
export function createStandaloneVideoOwnerKey(): string {
  const id = globalThis.crypto?.randomUUID?.()
  if (!id) throw new Error('Secure UUID generation is unavailable')
  return `${STANDALONE_OWNER_PREFIX}${id}`
}

/** Accepts only canonical `standalone:<uuid>` owner groups. */
export function isStandaloneVideoOwnerKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(STANDALONE_OWNER_PREFIX)
    && UUID_PATTERN.test(value.slice(STANDALONE_OWNER_PREFIX.length))
}

/** Returns a fresh complete config suitable for persistence in `video_clips.override`. */
export const DEFAULT_STANDALONE_VIDEO_CONFIG: StandaloneVideoConfig = {
  prompt: '',
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
  cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 },
  provider: DEFAULT_VIDEO_MODEL,
  durationSeconds: 5,
}

export function createDefaultStandaloneVideoConfig(): StandaloneVideoConfig {
  return {
    ...DEFAULT_STANDALONE_VIDEO_CONFIG,
    camera: { ...DEFAULT_STANDALONE_VIDEO_CONFIG.camera },
    lighting: { ...DEFAULT_STANDALONE_VIDEO_CONFIG.lighting },
    cameraPreset: { ...DEFAULT_STANDALONE_VIDEO_CONFIG.cameraPreset },
  }
}

/**
 * Validates a persisted standalone config without accepting partial, legacy, or
 * arbitrary JSON. The returned object is detached and safe to use as generation input.
 */
export function normalizeStandaloneVideoConfig(value: unknown): StandaloneVideoConfig | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, CONFIG_KEYS)) return null
  if (typeof value.prompt !== 'string' || value.prompt.length > 10_000) return null
  if (!isPlainObject(value.camera) || !hasOnlyKeys(value.camera, CAMERA_KEYS)) return null
  const camera = value.camera
  if (!CAMERA_KEYS.every(key => isFiniteNumberInRange(camera[key], -10, 10))) return null
  if (!isPlainObject(value.lighting) || !hasOnlyKeys(value.lighting, ['position', 'brightness', 'colorTemp'])) return null
  const lighting = value.lighting
  if (
    !['left', 'top', 'right', 'front'].includes(lighting.position as string)
    || !isFiniteNumberInRange(lighting.brightness, 0, 100)
    || !isFiniteNumberInRange(lighting.colorTemp, 2000, 10_000)
  ) return null
  if (!isPlainObject(value.cameraPreset) || !hasOnlyKeys(value.cameraPreset, PRESET_KEYS)) return null
  const cameraPreset = value.cameraPreset
  if (
    typeof cameraPreset.brand !== 'string'
    || !cameraPreset.brand.trim()
    || cameraPreset.brand.length > 64
    || !isFiniteNumberInRange(cameraPreset.focalLength, 1, 500)
    || !isFiniteNumberInRange(cameraPreset.aperture, 0.1, 64)
    || !isFiniteNumberInRange(cameraPreset.whiteBalance, 1_000, 20_000)
  ) return null
  if (typeof value.provider !== 'string' || !(value.provider in VIDEO_MODELS)) return null
  if (!isFiniteNumberInRange(value.durationSeconds, 1, 60)) return null

  return {
    prompt: value.prompt.trim(),
    camera: {
      horizontal: camera.horizontal as number,
      vertical: camera.vertical as number,
      pan: camera.pan as number,
      tilt: camera.tilt as number,
      roll: camera.roll as number,
      zoom: camera.zoom as number,
    },
    lighting: {
      position: lighting.position as StandaloneVideoConfig['lighting']['position'],
      brightness: lighting.brightness,
      colorTemp: lighting.colorTemp,
    },
    cameraPreset: {
      brand: cameraPreset.brand.trim(),
      focalLength: cameraPreset.focalLength,
      aperture: cameraPreset.aperture,
      whiteBalance: cameraPreset.whiteBalance,
    },
    provider: value.provider as StandaloneVideoConfig['provider'],
    durationSeconds: value.durationSeconds,
  }
}
