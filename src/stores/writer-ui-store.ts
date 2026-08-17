import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Writer UI 상태 — 탭 선택만 영속화한다.

// 'v2' = V2 의미 단위 프리뷰 탭 (#v2-tab 2026-08-17): V2 run 프로젝트에서만 노출.
//   이전엔 워크스페이스가 engine=v2 면 프리뷰를 전면 강점유해 러프 보드가 영영 닫혔다.
export type WriterTab = 'v2' | 'storyboard' | 'script' | 'dialogue'

interface WriterUiState {
  activeTab: WriterTab
  setActiveTab: (tab: WriterTab) => void
  /** V2 run 프로젝트 여부 — 워크스페이스(status 단일 구독자)가 채우는 비영속 UI 플래그. */
  v2Available: boolean
  setV2Available: (available: boolean) => void
}

export function normalizeWriterTab(value: unknown): WriterTab {
  // 'dialogue'는 #dialogue-v4(2026-07-23)에서 활성화 — "준비 중" 시절 가드에 남아있으면
  //   setActiveTab이 대사탭 클릭을 조용히 무시한다(탭 전환 불가 실사고). 'v2'도 동일 함정 주의.
  return value === 'v2' || value === 'storyboard' || value === 'script' || value === 'dialogue'
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
      v2Available: false,
      setV2Available: (available) => set({ v2Available: available }),
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
