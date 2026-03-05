import { create } from 'zustand'
import type { Scene, SceneManifest } from '@/types'

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
      const res = await fetch('/api/write/generate-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyText }),
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
}))
