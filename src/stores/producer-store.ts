import { create } from 'zustand'
import type { ProjectSettings } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

interface ExtractedSettings {
  playtime?: number
  genre?: string
  aspectRatio?: '16:9' | '9:16' | '1:1'
  toneStyle?: string
}

interface ProducerState {
  storyText: string
  projectSettings: ProjectSettings
  chatMessages: ChatMessage[]
  chatLoading: boolean
  syncing: boolean
  error: string | null

  setStoryText: (text: string) => void
  updateSettings: (partial: Partial<ProjectSettings>) => void
  sendChatMessage: (message: string) => Promise<void>
  uploadFile: (file: File) => Promise<void>
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
}

export const useProducerStore = create<ProducerState>((set, get) => ({
  storyText: '',
  projectSettings: { ...DEFAULT_SETTINGS },
  chatMessages: [],
  chatLoading: false,
  syncing: false,
  error: null,

  setStoryText: (text) => set({ storyText: text }),

  updateSettings: (partial) =>
    set((state) => ({
      projectSettings: { ...state.projectSettings, ...partial },
    })),

  sendChatMessage: async (message) => {
    const { chatMessages, projectSettings, storyText } = get()

    set({
      chatMessages: [...chatMessages, { role: 'user', content: message }],
      chatLoading: true,
      error: null,
    })

    try {
      const res = await fetch('/api/produce/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: chatMessages,
          currentSettings: projectSettings,
          storyText,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const { reply, extractedSettings } = await res.json()

      set((state) => {
        const newSettings = extractedSettings
          ? { ...state.projectSettings, ...extractedSettings }
          : state.projectSettings

        // If the AI extracted story text from conversation, update it
        const newStoryText = extractedSettings?.storyText
          ? extractedSettings.storyText
          : state.storyText

        return {
          chatLoading: false,
          chatMessages: [
            ...state.chatMessages,
            { role: 'model', content: reply },
          ],
          projectSettings: newSettings,
          storyText: newStoryText,
        }
      })
    } catch (err) {
      set({
        chatLoading: false,
        error: err instanceof Error ? err.message : 'Chat failed',
      })
    }
  },

  uploadFile: async (file) => {
    try {
      const text = await file.text()
      set({ storyText: text })

      // Auto-send to AI for analysis
      await get().sendChatMessage(
        `I've uploaded a script file. Here's the content:\n\n${text}`,
      )
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'File upload failed',
      })
    }
  },

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
      projectSettings: { ...DEFAULT_SETTINGS },
      chatMessages: [],
      chatLoading: false,
      syncing: false,
      error: null,
    }),
}))
