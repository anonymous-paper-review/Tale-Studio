// Artist New UI (asset-shot board) 의 페이지 UI 상태.
//
// 원래 shots 데이터·undo 스택까지 한 통에 있었으나 2026-08-24 전환 3호에서 갈랐다:
// 서버 상태(shots)와 편집 세션(undo/오류)은 `@/lib/artist/board-shots` 로, 여기는
// 서버와 무관한 boardMode 토글만 남는다.
import { create } from 'zustand'

interface ArtistBoardState {
  /** 실험 New UI 토글 — 스토어에 두어 탭 전환(route remount)에도 유지(page-local useState 리셋 방지). */
  boardMode: boolean
  setBoardMode: (on: boolean) => void
}

export const useArtistBoardStore = create<ArtistBoardState>((set) => ({
  boardMode: false,
  setBoardMode: (on) => set({ boardMode: on }),
}))
