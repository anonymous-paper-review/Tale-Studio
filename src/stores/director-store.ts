import { create } from 'zustand'
import type { Shot, VideoClip, CameraConfig, LightingConfig } from '@/types'

interface DirectorState {
  shots: Shot[]
  videoClips: VideoClip[]
  selectedSceneId: string | null
  selectedShotId: string | null

  loadMockData: () => void
  selectScene: (id: string) => void
  selectShot: (id: string) => void
  updateCamera: (shotId: string, config: Partial<CameraConfig>) => void
  updateLighting: (shotId: string, config: Partial<LightingConfig>) => void
}

export const useDirectorStore = create<DirectorState>((set) => ({
  shots: [],
  videoClips: [],
  selectedSceneId: null,
  selectedShotId: null,

  loadMockData: async () => {
    const [{ mockShots }, { mockVideoClips }] = await Promise.all([
      import('@/mocks/shot-sequences'),
      import('@/mocks/video-clips'),
    ])

    set({
      shots: mockShots,
      videoClips: mockVideoClips,
      selectedSceneId: mockShots[0]?.sceneId ?? null,
      selectedShotId: mockShots[0]?.shotId ?? null,
    })
  },

  selectScene: (id) =>
    set((state) => {
      const firstShot = state.shots.find((s) => s.sceneId === id)
      return {
        selectedSceneId: id,
        selectedShotId: firstShot?.shotId ?? null,
      }
    }),

  selectShot: (id) => set({ selectedShotId: id }),

  updateCamera: (shotId, config) =>
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === shotId ? { ...s, camera: { ...s.camera, ...config } } : s,
      ),
    })),

  updateLighting: (shotId, config) =>
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === shotId ? { ...s, lighting: { ...s.lighting, ...config } } : s,
      ),
    })),
}))
