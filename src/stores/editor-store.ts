import { create } from 'zustand'
import type { Shot, VideoClip, DialogueLine } from '@/types'
import { useProjectStore } from '@/stores/project-store'
import { useDirectorStore } from '@/stores/director-store'
import { createClient } from '@/lib/supabase/client'

const DEFAULT_CAMERA = {
  horizontal: 0,
  vertical: 0,
  pan: 0,
  tilt: 0,
  roll: 0,
  zoom: 0,
}

const DEFAULT_LIGHTING = {
  position: 'front' as const,
  brightness: 50,
  colorTemp: 5000,
}

// Per-shot debounce timers for speed persist (300ms)
const speedPersistTimers = new Map<string, ReturnType<typeof setTimeout>>()

interface EditorState {
  shots: Shot[]
  videoClips: VideoClip[]
  selectedSceneId: string | null
  selectedClipShotId: string | null
  clipOrder: Record<string, string[]> // sceneId → shotId[]
  rendering: boolean
  error: string | null

  loadData: () => void
  loadMockData: () => void
  reset: () => void
  selectScene: (sceneId: string) => void
  selectClip: (shotId: string) => void
  reorderClips: (sceneId: string, fromIndex: number, toIndex: number) => void
  setTrim: (shotId: string, trimStart: number, trimEnd: number) => void
  setSpeed: (shotId: string, speed: number) => void
  deleteClip: (shotId: string) => void
  renderDraft: () => Promise<void>
}

function buildClipOrder(shots: Shot[]): Record<string, string[]> {
  const order: Record<string, string[]> = {}
  for (const shot of shots) {
    if (!order[shot.sceneId]) order[shot.sceneId] = []
    order[shot.sceneId].push(shot.shotId)
  }
  return order
}

export const useEditorStore = create<EditorState>((set, get) => ({
  shots: [],
  videoClips: [],
  selectedSceneId: null,
  selectedClipShotId: null,
  clipOrder: {},
  rendering: false,
  error: null,

  loadData: async () => {
    const projectId = useProjectStore.getState().projectId

    // 1) Try Supabase
    if (projectId) {
      try {
        const supabase = createClient()
        const { data: dbShots } = await supabase
          .from('shots')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order')

        if (dbShots?.length) {
          const shots: Shot[] = dbShots.map((s) => ({
            shotId: s.shot_id,
            sceneId: s.scene_id,
            shotType: s.shot_type,
            actionDescription: s.action_description ?? '',
            characters: s.characters ?? [],
            durationSeconds: s.duration_seconds ?? 5,
            generationMethod: s.generation_method ?? 'T2V',
            dialogueLines: (s.dialogue_lines as DialogueLine[]) ?? [],
            camera: { ...DEFAULT_CAMERA, ...(s.camera_config ?? {}) },
            lighting: { ...DEFAULT_LIGHTING, ...(s.lighting_config ?? {}) },
            referenceImageUrl: s.reference_image ?? null,
          }))

          const videoClips: VideoClip[] = dbShots.map((s) => ({
            shotId: s.shot_id,
            url: s.video_url ?? null,
            status: s.video_url ? 'completed' : 'pending',
            thumbnailUrl: null,
            trimStart: s.trim_start ?? undefined,
            trimEnd: s.trim_end ?? undefined,
            speed: s.speed ?? 1.0,
          }))

          const order = buildClipOrder(shots)
          const firstSceneId = shots[0]?.sceneId ?? null

          set({
            shots,
            videoClips,
            clipOrder: order,
            selectedSceneId: firstSceneId,
            selectedClipShotId: order[firstSceneId!]?.[0] ?? null,
          })
          return
        }
      } catch (err) {
        console.error('[editor-store] DB load failed, falling back:', err)
      }
    }

    // 2) Try upstream director store
    const directorState = useDirectorStore.getState()
    if (directorState.shots.length > 0) {
      const order = buildClipOrder(directorState.shots)
      const firstSceneId = directorState.shots[0]?.sceneId ?? null

      set({
        shots: directorState.shots,
        videoClips: directorState.videoClips,
        clipOrder: order,
        selectedSceneId: firstSceneId,
        selectedClipShotId: order[firstSceneId!]?.[0] ?? null,
      })
      return
    }

    // No data available — keep empty state (don't show fake mock data)
  },

  reset: () =>
    set({
      shots: [],
      videoClips: [],
      selectedSceneId: null,
      selectedClipShotId: null,
      clipOrder: {},
      rendering: false,
      error: null,
    }),

  loadMockData: async () => {
    const [{ mockShots }, { mockVideoClips }] = await Promise.all([
      import('@/mocks/shot-sequences'),
      import('@/mocks/video-clips'),
    ])

    const order = buildClipOrder(mockShots)

    set({
      shots: mockShots,
      videoClips: mockVideoClips,
      clipOrder: order,
      selectedSceneId: mockShots[0]?.sceneId ?? null,
      selectedClipShotId: mockShots[0]?.shotId ?? null,
    })
  },

  selectScene: (sceneId) =>
    set((state) => {
      const firstShotId = state.clipOrder[sceneId]?.[0] ?? null
      return {
        selectedSceneId: sceneId,
        selectedClipShotId: firstShotId,
      }
    }),

  selectClip: (shotId) => set({ selectedClipShotId: shotId }),

  reorderClips: (sceneId, fromIndex, toIndex) => {
    set((state) => {
      const order = [...(state.clipOrder[sceneId] ?? [])]
      const [moved] = order.splice(fromIndex, 1)
      order.splice(toIndex, 0, moved)
      const newOrder = { ...state.clipOrder, [sceneId]: order }

      // Persist to DB (fire-and-forget)
      fetch('/api/editor/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, clipOrder: order }),
      }).catch((err) => console.error('[editor-store] reorder persist failed:', err))

      return { clipOrder: newOrder }
    })
  },

  setTrim: (shotId, trimStart, trimEnd) => {
    set((state) => ({
      videoClips: state.videoClips.map((c) =>
        c.shotId === shotId ? { ...c, trimStart, trimEnd } : c,
      ),
    }))

    // Persist to DB (fire-and-forget)
    fetch('/api/editor/trim', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shotId, trimStart, trimEnd }),
    }).catch((err) => console.error('[editor-store] trim persist failed:', err))
  },

  setSpeed: (shotId, speed) => {
    const clamped = Math.max(0.25, Math.min(4.0, speed))

    set((state) => ({
      videoClips: state.videoClips.map((c) =>
        c.shotId === shotId ? { ...c, speed: clamped } : c,
      ),
    }))

    // Debounced persist to DB (fire-and-forget)
    const existing = speedPersistTimers.get(shotId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      speedPersistTimers.delete(shotId)
      fetch('/api/editor/speed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotId, speed: clamped }),
      }).catch((err) => console.error('[editor-store] speed persist failed:', err))
    }, 300)
    speedPersistTimers.set(shotId, timer)
  },

  deleteClip: (shotId) =>
    set((state) => {
      const newOrder: Record<string, string[]> = {}
      for (const [sceneId, ids] of Object.entries(state.clipOrder)) {
        newOrder[sceneId] = ids.filter((id) => id !== shotId)
      }
      return {
        clipOrder: newOrder,
        videoClips: state.videoClips.filter((c) => c.shotId !== shotId),
        selectedClipShotId:
          state.selectedClipShotId === shotId ? null : state.selectedClipShotId,
      }
    }),

  renderDraft: async () => {
    set({ rendering: true, error: null })

    try {
      const { clipOrder, selectedSceneId } = get()

      const res = await fetch('/api/editor/render-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipOrder,
          sceneId: selectedSceneId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Render failed')
      }

      // MVP: just marks render complete (actual video merge is post-MVP)
      set({ rendering: false })
    } catch (err) {
      set({
        rendering: false,
        error: err instanceof Error ? err.message : 'Render failed',
      })
    }
  },
}))
