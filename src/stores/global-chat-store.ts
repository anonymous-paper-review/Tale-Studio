import { create } from 'zustand'
import type { StageId } from '@/types'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useWriterStore } from '@/stores/writer-store'
import {
  useCanvasStore,
  serializeCanvasContext,
  type CanvasUpdate,
} from '@/stores/canvas-store'
import { useDirectorStore } from '@/stores/director-store'
import {
  useDirectorCanvasStore,
  serializeDirectorCanvasContext,
  type DirectorCanvasUpdate,
} from '@/stores/director-canvas-store'
import { saveChatMessage } from '@/lib/chat-persistence'

export interface GlobalChatMessage {
  id: string
  stage: StageId
  role: 'user' | 'model'
  content: string
}

interface GlobalChatState {
  messages: GlobalChatMessage[]
  loading: boolean
  error: string | null

  loadMessages: (projectId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  clearError: () => void
  reset: () => void
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useGlobalChatStore = create<GlobalChatState>((set, get) => ({
  messages: [],
  loading: false,
  error: null,

  loadMessages: async (projectId) => {
    try {
      const res = await fetch(`/api/project/${projectId}/messages`)
      if (!res.ok) {
        set({ messages: [] })
        return
      }
      const { messages } = await res.json()
      const normalized: GlobalChatMessage[] = (messages ?? []).map(
        (m: { stage: string; role: 'user' | 'model'; content: string }) => ({
          id: makeId(),
          stage: m.stage as StageId,
          role: m.role,
          content: m.content,
        }),
      )
      set({ messages: normalized })
    } catch (err) {
      console.error('[global-chat-store] loadMessages failed:', err)
      set({ messages: [] })
    }
  },

  sendMessage: async (content) => {
    const trimmed = content.trim()
    if (!trimmed || get().loading) return

    const stage = useProjectStore.getState().currentStage
    const projectId = useProjectStore.getState().projectId
    const history = get().messages

    const historyPayload = history.map((m) => ({
      stage: m.stage,
      role: m.role,
      content: m.content,
    }))

    let endpoint: string
    let body: Record<string, unknown>

    switch (stage) {
      case 'producer': {
        const p = useProducerStore.getState()
        endpoint = '/api/produce/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          currentSettings: p.projectSettings,
          storyText: p.storyText,
        }
        break
      }
      case 'writer': {
        const w = useWriterStore.getState()
        const selectedShot =
          w.shots.find((s) => s.shotId === w.selectedShotId) ?? null
        endpoint = '/api/write/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          sceneContext: w.sceneManifest,
          shotContext: selectedShot,
        }
        break
      }
      case 'artist': {
        const canvasContext = serializeCanvasContext(
          useCanvasStore.getState(),
        )
        endpoint = '/api/artist/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          canvasContext,
        }
        break
      }
      case 'director': {
        // D-7: Director Canvas가 노드를 가지고 있으면 agentic 모드 (canvasContext 전달)
        // 아니면 legacy director-store 모드 (shotContext 전달)
        const canvasState = useDirectorCanvasStore.getState()
        const hasCanvasNodes = canvasState.nodes.length > 0

        if (hasCanvasNodes) {
          const canvasContext = serializeDirectorCanvasContext(canvasState)
          endpoint = '/api/director/chat'
          body = {
            message: trimmed,
            history: historyPayload,
            canvasContext,
          }
        } else {
          const d = useDirectorStore.getState()
          const selectedShot = d.shots.find(
            (s) => s.shotId === d.selectedShotId,
          )
          const shotContext = selectedShot
            ? {
                shotType: selectedShot.shotType,
                actionDescription: selectedShot.actionDescription,
                camera: selectedShot.camera,
                lighting: selectedShot.lighting,
                generationMethod: selectedShot.generationMethod,
              }
            : undefined
          endpoint = '/api/director/chat'
          body = {
            message: trimmed,
            history: historyPayload,
            shotContext,
          }
        }
        break
      }
      default:
        set({
          error: 'Chat is not available on this stage yet.',
        })
        return
    }

    const userMsg: GlobalChatMessage = {
      id: makeId(),
      stage,
      role: 'user',
      content: trimmed,
    }

    set((state) => ({
      messages: [...state.messages, userMsg],
      loading: true,
      error: null,
    }))

    if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      const reply: string = data.reply ?? data.message ?? ''

      set((state) => ({
        loading: false,
        messages: [
          ...state.messages,
          {
            id: makeId(),
            stage,
            role: 'model',
            content: reply,
          },
        ],
      }))

      if (projectId) saveChatMessage(projectId, stage, 'model', reply)

      if (stage === 'producer' && data.extractedSettings) {
        useProducerStore
          .getState()
          .applyExtractedSettings(data.extractedSettings)
      }
      if (stage === 'writer' && Array.isArray(data.updates)) {
        useWriterStore.getState().applyUpdates(data.updates)
      }
      if (stage === 'artist' && Array.isArray(data.updates)) {
        const result = useCanvasStore
          .getState()
          .applyUpdates(data.updates as CanvasUpdate[])
        if (result.skipped.length > 0) {
          console.warn('[global-chat-store] artist updates skipped:', result.skipped)
        }
      }
      if (stage === 'director') {
        // Agentic 응답 — DirectorCanvasUpdate[]
        if (Array.isArray(data.updates)) {
          const result = useDirectorCanvasStore
            .getState()
            .applyUpdates(data.updates as DirectorCanvasUpdate[])
          if (result.skipped.length > 0) {
            console.warn(
              '[global-chat-store] director updates skipped:',
              result.skipped,
            )
          }
        }
        // Legacy 응답 — suggestedCamera/suggestedLighting
        if (data.suggestedCamera) {
          useDirectorStore
            .getState()
            .applySuggestedCamera(data.suggestedCamera)
        }
        if (data.suggestedLighting) {
          useDirectorStore
            .getState()
            .applySuggestedLighting(data.suggestedLighting)
        }
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Chat failed',
      })
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({ messages: [], loading: false, error: null }),
}))
