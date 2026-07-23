import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Writer UI 상태 — 탭 선택만 영속화한다.

export type WriterTab = 'storyboard' | 'script' | 'dialogue'

interface WriterUiState {
  activeTab: WriterTab
  setActiveTab: (tab: WriterTab) => void
}

export function normalizeWriterTab(value: unknown): WriterTab {
  // 'dialogue'는 #dialogue-v4(2026-07-23)에서 활성화 — "준비 중" 시절 가드에 남아있으면
  //   setActiveTab이 대사탭 클릭을 조용히 무시한다(탭 전환 불가 실사고).
  return value === 'storyboard' || value === 'script' || value === 'dialogue'
    ? value
    : 'storyboard'
}

export const useWriterUiStore = create<WriterUiState>()(
  persist(
    (set) => ({
      activeTab: 'storyboard',
      setActiveTab: (tab) => {
        const next = normalizeWriterTab(tab)
        if (tab !== next) return
        set({ activeTab: next })
      },
    }),
    {
      name: 'tale-writer-ui',
      partialize: (state) => ({ activeTab: state.activeTab }),
      merge: (persisted, current) => {
        const persistedState =
          persisted && typeof persisted === 'object'
            ? (persisted as Partial<WriterUiState>)
            : {}
        return {
          ...current,
          activeTab: normalizeWriterTab(persistedState.activeTab),
        }
      },
    },
  ),
)
