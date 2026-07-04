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

interface MentionInsertRequest {
  id: number
  label: string
}

interface ChatUiState {
  chatWidth: number
  collapsed: boolean
  setChatWidth: (w: number) => void
  toggleCollapsed: () => void
  setCollapsed: (v: boolean) => void
  // @멘션 ↔ 카드 하이라이트 동기화. 입력창에 @멘션돼 있는 카드 ref 집합(파생, 미영속).
  mentionedRefs: string[]
  setMentionedRefs: (refs: string[]) => void
  // Cmd/Ctrl+클릭으로 카드 → 입력창 멘션 삽입 요청(브리지). GlobalChat이 소비.
  mentionInsert: MentionInsertRequest | null
  requestMentionInsert: (label: string) => void
  consumeMentionInsert: (id: number) => void
  // 채팅 입력창 포커스(+빔) 요청 브리지 — 첫 진입 웰컴 등에서 set, GlobalChat이 소비.
  focusRequest: number | null
  requestChatFocus: () => void
  consumeChatFocus: () => void
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
      mentionedRefs: [],
      setMentionedRefs: (refs) =>
        set((s) =>
          s.mentionedRefs.length === refs.length &&
          s.mentionedRefs.every((r, i) => r === refs[i])
            ? s
            : { mentionedRefs: refs },
        ),
      mentionInsert: null,
      requestMentionInsert: (label) => set({ mentionInsert: { id: Date.now(), label } }),
      consumeMentionInsert: (id) =>
        set((s) => (s.mentionInsert?.id === id ? { mentionInsert: null } : s)),
      focusRequest: null,
      requestChatFocus: () => set({ focusRequest: Date.now() }),
      consumeChatFocus: () => set({ focusRequest: null }),
    }),
    {
      name: 'tale-chat-ui',
      partialize: (s) => ({ chatWidth: s.chatWidth, collapsed: s.collapsed }),
    },
  ),
)
