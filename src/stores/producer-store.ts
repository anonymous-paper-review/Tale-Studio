import { create } from 'zustand'
import type { ProjectSettings } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'

interface ExtractedSettings {
  playtime?: number
  genre?: string
  aspectRatio?: '16:9' | '9:16' | '1:1'
  toneStyle?: string
  dialogueLanguage?: string
  storyText?: string
  storyReady?: boolean
}

interface ProducerState {
  storyText: string
  storyReady: boolean
  projectSettings: ProjectSettings
  syncing: boolean
  error: string | null

  setStoryText: (text: string) => void
  updateSettings: (partial: Partial<ProjectSettings>) => void
  applyExtractedSettings: (extracted: ExtractedSettings) => void
  saveAndHandoff: () => Promise<boolean>
  loadProject: () => Promise<void>
  clearError: () => void
  reset: () => void
}

const DEFAULT_SETTINGS: ProjectSettings = {
  playtime: 0,
  genre: '',
  aspectRatio: '16:9',
  toneStyle: '',
  dialogueLanguage: '',
}

export const useProducerStore = create<ProducerState>((set, get) => ({
  storyText: '',
  storyReady: false,
  projectSettings: { ...DEFAULT_SETTINGS },
  syncing: false,
  error: null,

  setStoryText: (text) => set({ storyText: text }),

  updateSettings: (partial) =>
    set((state) => ({
      projectSettings: { ...state.projectSettings, ...partial },
    })),

  applyExtractedSettings: (extracted) =>
    set((state) => {
      if (!extracted) return state
      const { storyText: nextStory, storyReady: nextReady, ...settingsPatch } =
        extracted
      return {
        projectSettings: {
          ...state.projectSettings,
          ...settingsPatch,
        },
        storyText: nextStory ? nextStory : state.storyText,
        storyReady: nextReady === true ? true : state.storyReady,
      }
    }),

  saveAndHandoff: async () => {
    const { storyText, projectSettings } = get()
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return false

    set({ syncing: true, error: null })

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .update({
          story_text: storyText,
          settings: projectSettings,
          current_stage: 'writer',
        })
        .eq('id', projectId)

      if (error) throw error

      useProjectStore.getState().setStage('writer')
      set({ syncing: false })
      return true
    } catch (err) {
      set({
        syncing: false,
        error: err instanceof Error ? err.message : 'Save failed',
      })
      return false
    }
  },

  loadProject: async () => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return

    try {
      const supabase = createClient()
      const { data: project } = await supabase
        .from('projects')
        .select('story_text, settings')
        .eq('id', projectId)
        .single()

      if (project) {
        set({
          storyText: project.story_text ?? '',
          projectSettings: {
            ...DEFAULT_SETTINGS,
            ...(project.settings as Partial<ProjectSettings>),
          },
        })
      }
    } catch (err) {
      console.error('[producer-store] loadProject failed:', err)
    }
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      storyText: '',
      storyReady: false,
      projectSettings: { ...DEFAULT_SETTINGS },
      syncing: false,
      error: null,
    }),
}))
