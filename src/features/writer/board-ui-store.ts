// Storyboard 보드 화면끼리 나누는 작은 상태 (리뉴얼 1차 2026-10-19).
//   머리의 [다음: Director로 →]는 두 탭(러프 · 대사) 어디서나 보이지만, 넘김 창은 러프 보드(rough-storyboard-view)가
//   그린다 — 창의 [남은 컷 그리기]가 보드의 그리기 상태를 그대로 써야 해서다. 그래서 창을 여닫는 값만 여기서 나눈다.
//   채팅의 [러프 다시 그리기](2026-10-31 QA)도 같은 까닭으로 요청만 여기 두고, 그리기는 보드가 한다.
//   샷 고치기 팝업도 보드가 그리지만 대사 탭에서 샷을 눌러도 열려야 해서(2026-10-31 QA) 연 샷 id 를 여기서 나눈다.
import { create } from 'zustand'

interface BoardUiState {
  /** Director 넘김 확인 창(프로토타입 S7). */
  directorConfirmOpen: boolean
  setDirectorConfirmOpen: (open: boolean) => void
  /** 샷 고치기 팝업에 연 샷(없으면 닫힘) — 보드 카드 · 대사 탭 어디서 눌러도 같은 팝업. */
  shotEditId: string | null
  setShotEditId: (shotId: string | null) => void
  /** 채팅 고치기 뒤 [러프 다시 그리기] — 보드가 받아 그 샷들만 다시 그린다. id 는 같은 샷을 다시 눌러도 새 요청으로 보이게. */
  roughRedrawRequest: { id: number; shotIds: string[] } | null
  requestRoughRedraw: (shotIds: string[]) => void
  consumeRoughRedraw: (id: number) => void
}

let nextRequestId = 0

export const useBoardUiStore = create<BoardUiState>((set) => ({
  directorConfirmOpen: false,
  setDirectorConfirmOpen: (directorConfirmOpen) => set({ directorConfirmOpen }),
  shotEditId: null,
  setShotEditId: (shotEditId) => set({ shotEditId }),
  roughRedrawRequest: null,
  requestRoughRedraw: (shotIds) => set({ roughRedrawRequest: { id: ++nextRequestId, shotIds: [...shotIds] } }),
  consumeRoughRedraw: (id) => set((state) => (state.roughRedrawRequest?.id === id ? { roughRedrawRequest: null } : state)),
}))
