import { create } from 'zustand'
import type { Scene, SceneManifest, Character, Location } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

interface WriterState {
  storyText: string
  expandedStory: string | null
  sceneManifest: SceneManifest | null
  selectedSceneId: string | null
  generating: boolean
  chatMessages: ChatMessage[]
  chatLoading: boolean
  error: string | null

  setStoryText: (text: string) => void
  generateScenes: () => Promise<void>
  loadProject: () => Promise<void>
  selectScene: (id: string) => void
  updateScene: (id: string, changes: Partial<Scene>) => void
  sendChatMessage: (message: string) => Promise<void>
  clearError: () => void
}

export const useWriterStore = create<WriterState>((set, get) => ({
  storyText: '',
  expandedStory: null,
  sceneManifest: null,
  selectedSceneId: null,
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

      const { manifest, expandedStory } = await res.json()

      set({
        generating: false,
        sceneManifest: manifest,
        expandedStory,
        selectedSceneId: manifest.scenes[0]?.sceneId ?? null,
      })
    } catch (err) {
      set({
        generating: false,
        error:
          err instanceof Error ? err.message : 'Scene generation failed',
      })
    }
  },

  selectScene: (id) => set({ selectedSceneId: id }),

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

  sendChatMessage: async (message) => {
    const { chatMessages, sceneManifest } = get()

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
      ])

      if (!scenes?.length) return

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

      set({
        storyText: project?.story_text ?? '',
        expandedStory: project?.expanded_story ?? null,
        sceneManifest: manifest,
        selectedSceneId: manifest.scenes[0]?.sceneId ?? null,
      })
    } catch (err) {
      console.error('[writer-store] loadProject failed:', err)
    }
  },
}))
