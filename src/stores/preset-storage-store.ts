import { create } from 'zustand'
import type { CameraConfig, CameraPreset, LightingConfig } from '@/types/shot'

// ============================================================================
// Camera/Light Preset Library — Director Canvas D-6 (decisions #46)
// DB-backed (camera_light_presets) → persist 미들웨어 미사용 (localStorage 금지).
// ============================================================================

export type CameraLightPreset = {
  id: string
  name: string
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
}

type SavePresetInput = {
  projectId: string
  name: string
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
}

interface PresetStorageState {
  presets: CameraLightPreset[]
  loading: boolean
  loadedProjectId: string | null

  loadPresets: (projectId: string) => Promise<void>
  savePreset: (input: SavePresetInput) => Promise<void>
  deletePreset: (id: string) => Promise<void>
}

export const usePresetStorageStore = create<PresetStorageState>()((set) => ({
  presets: [],
  loading: false,
  loadedProjectId: null,

  loadPresets: async (projectId) => {
    set({ loading: true })
    try {
      const res = await fetch(
        `/api/director/presets?projectId=${encodeURIComponent(projectId)}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { presets } = (await res.json()) as {
        presets: CameraLightPreset[]
      }
      set({ presets, loadedProjectId: projectId, loading: false })
    } catch (err) {
      console.warn('[preset-storage] loadPresets failed', err)
      set({ loadedProjectId: projectId, loading: false })
    }
  },

  savePreset: async (input) => {
    try {
      const res = await fetch('/api/director/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { preset } = (await res.json()) as { preset: CameraLightPreset }
      set((s) => ({ presets: [preset, ...s.presets] }))
    } catch (err) {
      console.warn('[preset-storage] savePreset failed', err)
    }
  },

  deletePreset: async (id) => {
    try {
      const res = await fetch(
        `/api/director/presets?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }))
    } catch (err) {
      console.warn('[preset-storage] deletePreset failed', err)
    }
  },
}))
