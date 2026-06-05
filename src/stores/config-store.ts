import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 런타임 기능 플래그 — 피드백 버튼 on/off 등.
 * persist: localStorage 'tale:config'.
 */
interface ConfigState {
  feedbackEnabled: boolean
  setFeedbackEnabled: (v: boolean) => void
  toggleFeedback: () => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      feedbackEnabled: true,
      setFeedbackEnabled: (v) => set({ feedbackEnabled: v }),
      toggleFeedback: () => set((s) => ({ feedbackEnabled: !s.feedbackEnabled })),
    }),
    {
      name: 'tale:config',
      partialize: (s) => ({ feedbackEnabled: s.feedbackEnabled }),
    },
  ),
)
