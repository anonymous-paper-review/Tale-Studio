import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CHAT_DEFAULT_WIDTH,
  CHAT_MIN_WIDTH,
  CHAT_MAX_WIDTH,
} from '@/lib/constants'

/**
 * GlobalChat UI 상태 — 폭 리사이즈 + 접기/펴기.
 * persist: 직렬화 가능한 값(width/collapsed)만 (stores 룰).
 */


interface ChatUiState {
  chatWidth: number
  collapsed: boolean
  setChatWidth: (w: number) => void
  toggleCollapsed: () => void
  setCollapsed: (v: boolean) => void
}

const clampWidth = (w: number) =>
  Math.min(CHAT_MAX_WIDTH, Math.max(CHAT_MIN_WIDTH, Math.round(w)))

export const useChatUiStore = create<ChatUiState>()(
  persist(
    (set) => ({
      chatWidth: CHAT_DEFAULT_WIDTH,
      collapsed: false,

      setChatWidth: (w) => set({ chatWidth: clampWidth(w) }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (v) => set({ collapsed: v }),
    }),
    {
      name: 'tale-chat-ui',
      partialize: (s) => ({ chatWidth: s.chatWidth, collapsed: s.collapsed }),
    },
  ),
)
