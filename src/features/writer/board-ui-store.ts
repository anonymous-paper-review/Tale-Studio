// Storyboard 보드 화면끼리 나누는 작은 상태 (리뉴얼 1차 2026-10-19).
//   머리의 [다음: Director로 →]는 두 탭(러프 · 대사) 어디서나 보이지만, 넘김 창은 러프 보드(rough-storyboard-view)가
//   그린다 — 창의 [남은 컷 그리기]가 보드의 그리기 상태를 그대로 써야 해서다. 그래서 창을 여닫는 값만 여기서 나눈다.
import { create } from 'zustand'

interface BoardUiState {
  /** Director 넘김 확인 창(프로토타입 S7). */
  directorConfirmOpen: boolean
  setDirectorConfirmOpen: (open: boolean) => void
}

export const useBoardUiStore = create<BoardUiState>((set) => ({
  directorConfirmOpen: false,
  setDirectorConfirmOpen: (directorConfirmOpen) => set({ directorConfirmOpen }),
}))
