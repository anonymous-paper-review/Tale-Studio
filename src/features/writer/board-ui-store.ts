// Storyboard 보드 화면끼리 나누는 작은 상태 (리뉴얼 1차 2026-10-19).
//   머리의 [다음: Director로 →]는 두 탭(러프 · 대사) 어디서나 보이지만, 넘김 창은 러프 보드(rough-storyboard-view)가
//   그린다 — 창의 [남은 컷 그리기]가 보드의 그리기 상태를 그대로 써야 해서다. 그래서 창을 여닫는 값만 여기서 나눈다.
//   채팅의 [러프 다시 그리기](2026-10-31 QA)도 같은 까닭으로 요청만 여기 두고, 그리기는 보드가 한다.
//   요청은 프로젝트에 묶는다 — 다른 프로젝트 보드는 버리고, 보드가 내려가면 지운다(2026-11-01 리뷰 B1: B 의 같은 id 샷을 그렸다).
//   샷 고치기 팝업도 보드가 그리지만 대사 탭에서 샷을 눌러도 열려야 해서(2026-10-31 QA) 연 샷 id 를 여기서 나눈다.
import { create } from 'zustand'

interface BoardUiState {
  /** Director 넘김 확인 창(프로토타입 S7). */
  directorConfirmOpen: boolean
  setDirectorConfirmOpen: (open: boolean) => void
  /** 샷 고치기 팝업에 연 샷(없으면 닫힘) — 보드 카드 · 대사 탭 어디서 눌러도 같은 팝업. */
  shotEditId: string | null
  setShotEditId: (shotId: string | null) => void
  /** 지금 열려 있는 Storyboard 보드의 프로젝트(없으면 null) — 채팅이 [러프 다시 그리기]를 묻고 보여 줄지 정한다. */
  boardProjectId: string | null
  openBoard: (projectId: string) => void
  /** 보드가 내려가거나 프로젝트가 바뀌면 — 그 보드 표시와 남은 [러프 다시 그리기] 요청을 지운다. */
  closeBoard: (projectId: string) => void
  /** 채팅 고치기 뒤 [러프 다시 그리기] — 그 프로젝트 보드가 받아 그 샷들만 다시 그린다. id 는 같은 샷을 다시 눌러도 새 요청으로 보이게. */
  roughRedrawRequest: { id: number; projectId: string; shotIds: string[] } | null
  requestRoughRedraw: (projectId: string, shotIds: string[]) => void
  /** 요청을 꺼낸다 — 그 프로젝트 것이면 샷 id 들, 아니면 null(요청은 어느 쪽이든 지운다). */
  takeRoughRedraw: (projectId: string) => string[] | null
  /** 카드를 [나중에] · Esc 로 내렸다 — 그 카드의 요청(같은 프로젝트 · 같은 샷)이 아직 기다리면 지운다(2026-11-02 리뷰 3차 M3). */
  cancelRoughRedraw: (projectId: string, shotIds: readonly string[]) => void
}

let nextRequestId = 0

export const useBoardUiStore = create<BoardUiState>((set, get) => ({
  directorConfirmOpen: false,
  setDirectorConfirmOpen: (directorConfirmOpen) => set({ directorConfirmOpen }),
  shotEditId: null,
  setShotEditId: (shotEditId) => set({ shotEditId }),
  boardProjectId: null,
  openBoard: (projectId) => set({ boardProjectId: projectId }),
  closeBoard: (projectId) =>
    set((state) => ({
      boardProjectId: state.boardProjectId === projectId ? null : state.boardProjectId,
      roughRedrawRequest: null,
    })),
  roughRedrawRequest: null,
  requestRoughRedraw: (projectId, shotIds) => set({ roughRedrawRequest: { id: ++nextRequestId, projectId, shotIds: [...shotIds] } }),
  takeRoughRedraw: (projectId) => {
    const request = get().roughRedrawRequest
    if (!request) return null
    set({ roughRedrawRequest: null })
    return request.projectId === projectId ? request.shotIds : null
  },
  cancelRoughRedraw: (projectId, shotIds) => {
    const request = get().roughRedrawRequest
    if (!request || request.projectId !== projectId || request.shotIds.length !== shotIds.length) return
    if (request.shotIds.every((id, index) => id === shotIds[index])) set({ roughRedrawRequest: null })
  },
}))
