import { create } from 'zustand'
import type { StageId } from '@/types'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useArtistStore, type ArtistUpdate } from '@/stores/artist-store'
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
      case 'artist': {
        // Card UI (artist-store) — no canvas graph. Provide a lightweight asset
        // summary in place of the former serializeCanvasContext output.
        const a = useArtistStore.getState()
        const charLines = a.characterAssets.map(
          (c) =>
            `- ${c.name} (${c.characterId})${c.locked ? ' [locked]' : ''}`,
        )
        const worldLines = a.worldAssets.map(
          (w) => `- ${w.name} (${w.locationId})`,
        )
        const canvasContext = [
          '## Artist 에셋',
          `### 캐릭터 (${a.characterAssets.length})`,
          ...(charLines.length ? charLines : ['- (없음)']),
          `### 장소 (${a.worldAssets.length})`,
          ...(worldLines.length ? worldLines : ['- (없음)']),
        ].join('\n')
        endpoint = '/api/artist/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          canvasContext,
        }
        break
      }
      case 'director': {
        // Director Canvas agentic 모드 — 항상 canvasContext 전달.
        // (unify-director-store-db Step 1: 옛 director-store legacy 분기 제거, canvas가 단일 진실)
        const canvasState = useDirectorCanvasStore.getState()
        const canvasContext = serializeDirectorCanvasContext(canvasState)
        endpoint = '/api/director/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          canvasContext,
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
      if (stage === 'artist' && Array.isArray(data.updates)) {
        // 카드 모델 ArtistUpdate (createCharacter / regenerateCharacter /
        // regenerateWorldAsset) — artist/chat 카드모델 재작성(2026-06-06)으로 활성화.
        void useArtistStore
          .getState()
          .applyUpdates(data.updates as ArtistUpdate[])
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
