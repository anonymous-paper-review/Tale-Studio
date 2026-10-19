// Writer 산문 작업공간의 화면 상태(리뉴얼 1차 2026-10-19). 화면 · 채팅 카드 · 채팅 말 읽기가 같은 창을 연다 —
//   [AI 다시 쓰기 ▾] 조건, 직접 작성 팝업, 산문 확정(브레이크다운) 창. 저장할 값은 없다(산문은 실행 기록이 진실).
//   탭(화면에서 고치기 · 채팅으로 고치기)은 브라우저에 기억한다 — Producer 시작 화면의 탭과 같은 칸을 쓴다.
import { create } from 'zustand'

export type WorkspaceTab = 'screen' | 'chat'

/** Producer 시작 화면 · Writer 가 함께 쓰는 탭 기억 칸. */
export const WORKSPACE_TAB_KEY = 'tale.workspaceTab'

export function readWorkspaceTab(): WorkspaceTab {
  try {
    return window.localStorage.getItem(WORKSPACE_TAB_KEY) === 'chat' ? 'chat' : 'screen'
  } catch {
    return 'screen'
  }
}

export function writeWorkspaceTab(tab: WorkspaceTab): void {
  try {
    window.localStorage.setItem(WORKSPACE_TAB_KEY, tab)
  } catch {
    /* 기억 못 해도 화면은 그대로 쓴다 */
  }
}

interface WriterRoomState {
  tab: WorkspaceTab
  tabLoaded: boolean
  /** [AI 다시 쓰기 ▾] 조건(1안 패널 · 2안 채팅 카드)이 열려 있다. */
  rewriteOpen: boolean
  /** 직접 작성 팝업을 열어 달라는 요청 — 늘어날 때마다 한 번 연다(채팅 카드 · 버튼이 같은 팝업을 쓴다). */
  manualRequest: number
  /** 산문 확정(브레이크다운) 창. */
  confirmOpen: boolean
  /** 채팅 입력칸에 커서를 놓아 달라는 요청(2안 채팅 탭 입력칸). */
  chatFocusRequest: number
  loadTab: () => void
  setTab: (tab: WorkspaceTab) => void
  openRewrite: () => void
  closeRewrite: () => void
  requestManual: () => void
  openConfirm: () => void
  closeConfirm: () => void
  requestChatFocus: () => void
}

export const useWriterRoomStore = create<WriterRoomState>((set, get) => ({
  tab: 'screen',
  tabLoaded: false,
  rewriteOpen: false,
  manualRequest: 0,
  confirmOpen: false,
  chatFocusRequest: 0,
  loadTab: () => {
    if (get().tabLoaded) return
    set({ tab: readWorkspaceTab(), tabLoaded: true })
  },
  setTab: (tab) => {
    writeWorkspaceTab(tab)
    set({ tab, tabLoaded: true })
  },
  openRewrite: () => set({ rewriteOpen: true, confirmOpen: false }),
  closeRewrite: () => set({ rewriteOpen: false }),
  requestManual: () => set((state) => ({ manualRequest: state.manualRequest + 1, rewriteOpen: false })),
  openConfirm: () => set({ confirmOpen: true, rewriteOpen: false }),
  closeConfirm: () => set({ confirmOpen: false }),
  requestChatFocus: () => set((state) => ({ chatFocusRequest: state.chatFocusRequest + 1 })),
}))
