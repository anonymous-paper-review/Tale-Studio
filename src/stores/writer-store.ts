import { create } from 'zustand'
import type {
  Scene,
  SceneManifest,
  Character,
  Location,
  Shot,
  DialogueLine,
} from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

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

interface WriterState {
  storyText: string
  expandedStory: string | null
  sceneManifest: SceneManifest | null
  selectedSceneId: string | null
  shots: Shot[]
  selectedShotId: string | null
  generatingShots: boolean
  generating: boolean
  chatMessages: ChatMessage[]
  chatLoading: boolean
  error: string | null

  setStoryText: (text: string) => void
  generateScenes: () => Promise<void>
  loadProject: () => Promise<void>
  selectScene: (id: string) => void
  updateScene: (id: string, changes: Partial<Scene>) => void
  selectShot: (id: string) => void
  updateShot: (id: string, changes: Partial<Shot>) => void
  addDialogueLine: (shotId: string, line: DialogueLine) => void
  removeDialogueLine: (shotId: string, index: number) => void
  updateDialogueLine: (
    shotId: string,
    index: number,
    changes: Partial<DialogueLine>,
  ) => void
  sendChatMessage: (message: string) => Promise<void>
  clearError: () => void
  reset: () => void
}

export const useWriterStore = create<WriterState>((set, get) => ({
  storyText: '',
  expandedStory: null,
  sceneManifest: null,
  selectedSceneId: null,
  shots: [],
  selectedShotId: null,
  generatingShots: false,
  generating: false,
  chatMessages: [],
  chatLoading: false,
  error: null,

  setStoryText: (text) => set({ storyText: text }),

  generateScenes: async () => {
    const { storyText } = get()
    if (!storyText.trim()) return

    set({ generating: true, error: null })

    try {
      const projectId = useProjectStore.getState().projectId
      const res = await fetch('/api/write/generate-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyText, projectId }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const { manifest, expandedStory, shots } = await res.json()
      const firstSceneId = manifest.scenes[0]?.sceneId ?? null
      const firstShot =
        shots?.find((s: Shot) => s.sceneId === firstSceneId) ?? null

      set({
        generating: false,
        sceneManifest: manifest,
        expandedStory,
        selectedSceneId: firstSceneId,
        shots: shots ?? [],
        selectedShotId: firstShot?.shotId ?? null,
      })
    } catch (err) {
      set({
        generating: false,
        error:
          err instanceof Error ? err.message : 'Scene generation failed',
      })
    }
  },

  selectScene: (id) => {
    const { shots } = get()
    const firstShot = shots.find((s) => s.sceneId === id)
    set({
      selectedSceneId: id,
      selectedShotId: firstShot?.shotId ?? null,
    })
  },

  updateScene: (id, changes) =>
    set((state) => {
      if (!state.sceneManifest) return state
      return {
        sceneManifest: {
          ...state.sceneManifest,
          scenes: state.sceneManifest.scenes.map((s) =>
            s.sceneId === id ? { ...s, ...changes } : s,
          ),
        },
      }
    }),

  selectShot: (id) => set({ selectedShotId: id }),

  updateShot: (id, changes) =>
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === id ? { ...s, ...changes } : s,
      ),
    })),

  addDialogueLine: (shotId, line) =>
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === shotId
          ? { ...s, dialogueLines: [...s.dialogueLines, line] }
          : s,
      ),
    })),

  removeDialogueLine: (shotId, index) =>
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === shotId
          ? {
              ...s,
              dialogueLines: s.dialogueLines.filter((_, i) => i !== index),
            }
          : s,
      ),
    })),

  updateDialogueLine: (shotId, index, changes) =>
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === shotId
          ? {
              ...s,
              dialogueLines: s.dialogueLines.map((dl, i) =>
                i === index ? { ...dl, ...changes } : dl,
              ),
            }
          : s,
      ),
    })),

  sendChatMessage: async (message) => {
    const { chatMessages, sceneManifest, shots, selectedShotId } = get()
    const selectedShot = shots.find((s) => s.shotId === selectedShotId)

    set({
      chatMessages: [...chatMessages, { role: 'user', content: message }],
      chatLoading: true,
      error: null,
    })

    try {
      const res = await fetch('/api/write/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: chatMessages,
          sceneContext: sceneManifest,
          shotContext: selectedShot ?? null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const { message: reply } = await res.json()

      set((state) => ({
        chatLoading: false,
        chatMessages: [
          ...state.chatMessages,
          { role: 'model', content: reply },
        ],
      }))
    } catch (err) {
      set({
        chatLoading: false,
        error: err instanceof Error ? err.message : 'Chat failed',
      })
    }
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      storyText: '',
      expandedStory: null,
      sceneManifest: null,
      selectedSceneId: null,
      shots: [],
      selectedShotId: null,
      generatingShots: false,
      generating: false,
      chatMessages: [],
      chatLoading: false,
      error: null,
    }),

  loadProject: async () => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return

    try {
      const supabase = createClient()
      const [
        { data: project },
        { data: scenes },
        { data: characters },
        { data: locations },
        { data: shotsData },
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('story_text, expanded_story')
          .eq('id', projectId)
          .single(),
        supabase
          .from('scenes')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order'),
        supabase
          .from('characters')
          .select('*')
          .eq('project_id', projectId),
        supabase
          .from('locations')
          .select('*')
          .eq('project_id', projectId),
        supabase
          .from('shots')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order'),
      ])

      // Always load story_text even if no scenes yet (P1 → P2 handoff)
      if (!scenes?.length) {
        set({
          storyText: project?.story_text ?? '',
          expandedStory: project?.expanded_story ?? null,
        })
        return
      }

      const manifest: SceneManifest = {
        scenes: scenes.map((s) => ({
          sceneId: s.scene_id,
          act: s.act as Scene['act'],
          narrativeSummary: s.narrative_summary ?? '',
          originalTextQuote: s.original_text_quote ?? '',
          location: s.location ?? '',
          timeOfDay: s.time_of_day ?? '',
          mood: s.mood ?? '',
          charactersPresent: s.characters_present ?? [],
          estimatedDurationSeconds: s.estimated_duration_seconds ?? 30,
        })),
        characters: (characters ?? []).map((c) => ({
          characterId: c.character_id,
          name: c.name,
          role: c.role as Character['role'],
          description: c.description ?? '',
          fixedPrompt: c.fixed_prompt ?? '',
          referenceImages: [],
        })),
        locations: (locations ?? []).map((l) => ({
          locationId: l.location_id,
          name: l.name,
          visualDescription: l.visual_description ?? '',
          timeOfDay: l.time_of_day ?? '',
          lightingDirection: l.lighting_direction ?? '',
        })),
      }

      const shots: Shot[] = (shotsData ?? []).map((s) => ({
        shotId: s.shot_id,
        sceneId: s.scene_id,
        shotType: s.shot_type as Shot['shotType'],
        actionDescription: s.action_description ?? '',
        characters: s.characters ?? [],
        durationSeconds: s.duration_seconds ?? 5,
        generationMethod: (s.generation_method ?? 'T2V') as Shot['generationMethod'],
        dialogueLines: (s.dialogue_lines as DialogueLine[]) ?? [],
        camera: {
          ...DEFAULT_CAMERA,
          ...(s.camera_config as Partial<Shot['camera']> ?? {}),
        },
        lighting: {
          ...DEFAULT_LIGHTING,
          ...(s.lighting_config as Partial<Shot['lighting']> ?? {}),
        },
      }))

      const firstSceneId = manifest.scenes[0]?.sceneId ?? null
      const firstShot =
        shots.find((s) => s.sceneId === firstSceneId) ?? null

      set({
        storyText: project?.story_text ?? '',
        expandedStory: project?.expanded_story ?? null,
        sceneManifest: manifest,
        selectedSceneId: firstSceneId,
        shots,
        selectedShotId: firstShot?.shotId ?? null,
      })
    } catch (err) {
      console.error('[writer-store] loadProject failed:', err)
    }
  },
}))
