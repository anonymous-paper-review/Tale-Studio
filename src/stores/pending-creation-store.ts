// 새 프로젝트 화면에서 고른 대로 Producer 가 이어서 할 일(2026-10-09 오너 "자료마다 쓰임새를 고른다" · 처음은 2026-10-02 시안 v04 0.1.2).
//   화면 사이를 건너는 동안만 들고 있는 일회용 보관함이다(새로고침하면 사라진다 — 그림 자체는 이미 보관함에 올라가 있다).
//   Producer 화면이 꺼내 채팅 스토어의 runCreationPlan 으로 넘긴다 — 다시 묻지 않는다.
import { create } from 'zustand'
import type { AppLocale } from '@/lib/locale'
import type { CreationImage } from '@/lib/project/creation-materials'

export type PendingCreationImage = CreationImage

export interface PendingCreation {
  /** 트리트먼트를 쓸 언어(새 프로젝트가 정한 것) — 언어가 잠기지 않았으면 트리트먼트를 시작할 때 화면도 맞춘다. */
  locale: AppLocale
  /** 그대로 쓰는 원작 — 대본(이야기에 이미 들어 있다) 또는 만화(옮겨서 넣는다). */
  original: 'script' | 'comic' | null
  comicPages: PendingCreationImage[]
  styleImage: PendingCreationImage | null
  cards: Array<{ image: PendingCreationImage; role: 'character' | 'background' }>
  references: PendingCreationImage[]
  /** 원작이 있을 때 아이디어 칸 글과 메모 — 채팅에 사용자의 메모로 남긴다. */
  note: string | null
  /** 카드 · 원작을 채운 뒤 트리트먼트를 쓴다. */
  startTreatment: boolean
}

interface PendingCreationState {
  byProject: Record<string, PendingCreation>
  put: (projectId: string, pending: PendingCreation) => void
  /** 꺼내면 비운다 — 같은 일을 두 번 하지 않는다. */
  take: (projectId: string) => PendingCreation | null
  clear: () => void
}

export const usePendingCreationStore = create<PendingCreationState>((set, get) => ({
  byProject: {},
  put: (projectId, pending) => set((state) => ({ byProject: { ...state.byProject, [projectId]: pending } })),
  take: (projectId) => {
    const pending = get().byProject[projectId] ?? null
    if (pending) {
      set((state) => {
        const next = { ...state.byProject }
        delete next[projectId]
        return { byProject: next }
      })
    }
    return pending
  },
  clear: () => set({ byProject: {} }),
}))
