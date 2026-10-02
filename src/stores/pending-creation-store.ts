// 새 프로젝트 화면에서 올린 그림(2026-10-02 시안 v04 0.1.2) — Producer 로 넘어가면 채팅이 쓰임새(인물 · 배경 · 참고)를 묻는다.
//   화면 사이를 건너는 동안만 들고 있는 일회용 보관함이다(새로고침하면 사라진다 — 그림 자체는 이미 보관함에 올라가 있다).
import { create } from 'zustand'

export interface PendingCreationImage {
  id: string
  name: string
  thumbUrl: string
  sliceUrls: string[]
}

interface PendingCreationState {
  byProject: Record<string, PendingCreationImage[]>
  put: (projectId: string, images: PendingCreationImage[]) => void
  /** 꺼내면 비운다 — 같은 그림을 두 번 묻지 않는다. */
  take: (projectId: string) => PendingCreationImage[]
  clear: () => void
}

export const usePendingCreationStore = create<PendingCreationState>((set, get) => ({
  byProject: {},
  put: (projectId, images) => set((state) => ({ byProject: { ...state.byProject, [projectId]: images } })),
  take: (projectId) => {
    const images = get().byProject[projectId] ?? []
    if (images.length) {
      set((state) => {
        const next = { ...state.byProject }
        delete next[projectId]
        return { byProject: next }
      })
    }
    return images
  },
  clear: () => set({ byProject: {} }),
}))
