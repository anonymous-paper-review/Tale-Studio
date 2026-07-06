import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Writer UI 상태 — 탭 선택만 영속화한다.

export type WriterTab = 'storyboard' | 'script' | 'dialogue'

interface WriterUiState {
  activeTab: WriterTab
  setActiveTab: (tab: WriterTab) => void
}

export function normalizeWriterTab(value: unknown): WriterTab {
  return value === 'storyboard' || value === 'script' ? value : 'storyboard'
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
