import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_CHAT_MODEL_SETTINGS, parseChatModelSettings, type ChatModelSettings } from '@/lib/chat-model-settings'
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
  // 'toggle': 입력창에 이미 있으면 제거(선택 해제), 없으면 삽입. 기본(undefined)=삽입만.
  // 'compose'(약속 M, 2026-09-04): 입력창을 "@라벨 " 로 바꾸고 커서를 뒤에 둔다 — 보내지는 않는다. hint 는 회색 안내.
  mode?: 'toggle' | 'compose'
  hint?: string
}

interface ChatUiState {
  modelSettings: ChatModelSettings
  setModelSettings: (value: ChatModelSettings) => void
  chatWidth: number
  collapsed: boolean
  setChatWidth: (w: number) => void
  toggleCollapsed: () => void
  setCollapsed: (v: boolean) => void
  /** 채팅을 잠깐 닫아 둔 단계 화면들(Director · Editor) — 화면이 떠나면 빠진다. 기억하지 않는다. */
  chatHolds: string[]
  /** 처음 닫아 둘 때 사용자가 고른 열림/닫힘 — 닫아 둔 동안 브라우저에 기억하는 값도 이것이다(새로고침해도 사용자 것이 남는다). */
  collapsedBeforeHold: boolean | null
  /** 단계 화면이 채팅을 닫아 둔다. 이미 다른 화면이 닫아 두었으면 처음 모습을 그대로 기억한다. */
  holdChatClosed: (holder: string) => void
  /** 화면이 떠난다 — 닫아 둔 화면이 하나도 안 남으면 채팅을 처음 모습으로 돌린다. */
  releaseChatHold: (holder: string) => void
  // @멘션 ↔ 카드 하이라이트 동기화. 입력창에 @멘션돼 있는 카드 ref 집합(파생, 미영속).
  mentionedRefs: string[]
  setMentionedRefs: (refs: string[]) => void
  // Cmd/Ctrl+클릭으로 카드 → 입력창 멘션 삽입 요청(브리지). GlobalChat이 소비.
  mentionInsert: MentionInsertRequest | null
  requestMentionInsert: (label: string) => void
  // 라인 재클릭 시 선택 해제까지 지원하는 토글 요청(스크립트 뷰어). GlobalChat이 소비.
  requestMentionToggle: (label: string) => void
  /** 약속 M: 완드 — 입력창에 "@라벨 "만 넣고 커서를 뒤에 둔다(보내지 않음). hint 는 회색 안내("이 카드 채워줘"). */
  requestMentionCompose: (label: string, hint: string) => void
  consumeMentionInsert: (id: number) => void
  // 채팅 입력창 포커스(+빔) 요청 브리지 — 첫 진입 웰컴 등에서 set, GlobalChat이 소비.
  stylePickerRequest: { id: number; projectId: string } | null
  requestStylePicker: (projectId: string) => void
  consumeStylePicker: (id: number) => void
  focusRequest: number | null
  requestChatFocus: () => void
  consumeChatFocus: () => void
}

const clampWidth = (w: number) =>
  Math.min(CHAT_MAX_WIDTH, Math.max(CHAT_MIN_WIDTH, Math.round(w)))

export const useChatUiStore = create<ChatUiState>()(
  persist(
    (set) => ({
      modelSettings: { ...DEFAULT_CHAT_MODEL_SETTINGS },
      setModelSettings: (value) => { const parsed = parseChatModelSettings(value); if (parsed) set({ modelSettings: parsed }) },
      chatWidth: CHAT_DEFAULT_WIDTH,
      collapsed: false,

      setChatWidth: (w) => set({ chatWidth: clampWidth(w) }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (v) => set({ collapsed: v }),
      chatHolds: [],
      collapsedBeforeHold: null,
      holdChatClosed: (holder) =>
        set((s) => ({
          chatHolds: s.chatHolds.includes(holder) ? s.chatHolds : [...s.chatHolds, holder],
          collapsedBeforeHold: s.chatHolds.length > 0 ? s.collapsedBeforeHold : s.collapsed,
          collapsed: true,
        })),
      releaseChatHold: (holder) =>
        set((s) => {
          if (!s.chatHolds.includes(holder)) return s
          const chatHolds = s.chatHolds.filter((h) => h !== holder)
          if (chatHolds.length > 0) return { chatHolds }
          return { chatHolds, collapsed: s.collapsedBeforeHold ?? s.collapsed, collapsedBeforeHold: null }
        }),
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
      requestMentionToggle: (label) =>
        set({ mentionInsert: { id: Date.now(), label, mode: 'toggle' } }),
      requestMentionCompose: (label, hint) =>
        set({ mentionInsert: { id: Date.now(), label, mode: 'compose', hint } }),
      consumeMentionInsert: (id) =>
        set((s) => (s.mentionInsert?.id === id ? { mentionInsert: null } : s)),
      stylePickerRequest: null,
      requestStylePicker: (projectId) => set({ stylePickerRequest: { id: Date.now(), projectId } }),
      consumeStylePicker: (id) => set((s) => s.stylePickerRequest?.id === id ? { stylePickerRequest: null } : s),
      focusRequest: null,
      requestChatFocus: () => set({ focusRequest: Date.now() }),
      consumeChatFocus: () => set({ focusRequest: null }),
    }),
    {
      name: 'tale-chat-ui',
      // 단계 화면이 채팅을 닫아 둔 동안에는 사용자가 고른 모습을 기억한다(v3 D1 — 닫아 둔 모습이 다른 단계로 새지 않게).
      partialize: (s) => ({ chatWidth: s.chatWidth, collapsed: s.collapsedBeforeHold ?? s.collapsed, modelSettings: s.modelSettings }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<ChatUiState> | undefined
        return { ...current, ...saved, modelSettings: parseChatModelSettings(saved?.modelSettings) ?? { ...DEFAULT_CHAT_MODEL_SETTINGS } }
      },
    },
  ),
)
