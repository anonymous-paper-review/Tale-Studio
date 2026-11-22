import { create } from 'zustand'

import type { BoardLoadStatus } from '@/lib/director/board-load'

// 판을 DB 에서 다 읽었나(fb-blur QA 2026-11-23) — 동기화 훅(use-writer-director-sync.ts)이 적고 Cinema 판 · 위쪽 만들기 줄이 읽는다.
//   한 번에 한 프로젝트만 적는다. 적힌 것이 없는 프로젝트(처음 열 때 · 훅이 떠난 뒤)는 "불러오는 중"으로 본다 — 읽기 전 판을 "샷 없음"으로 보이지 않게.
//   이 브라우저 메모리에만 있다(저장하지 않는다). director-store 는 건드리지 않는다. 약속: tests/camera/board-load.test.ts
interface BoardLoadState {
  projectId: string | null
  status: BoardLoadStatus
  /** 못 불러옴일 때 [다시 불러오기]가 부르는 일 — 동기화 훅이 적는다. */
  retry: (() => void) | null
}

export const useBoardLoadStore = create<BoardLoadState>(() => ({ projectId: null, status: 'loading', retry: null }))

/** 이 프로젝트의 판 읽기 상태 — 적힌 것이 다른 프로젝트거나 없으면 불러오는 중. */
export function boardLoadStatusOf(state: Pick<BoardLoadState, 'projectId' | 'status'>, projectId: string | null | undefined): BoardLoadStatus {
  return projectId && state.projectId === projectId ? state.status : 'loading'
}

export function markBoardLoad(projectId: string, status: BoardLoadStatus, retry: (() => void) | null = null): void {
  useBoardLoadStore.setState({ projectId, status, retry })
}

/** 훅이 떠나거나 프로젝트가 바뀌면 그 프로젝트 기록을 지운다 — 다음에 들어올 때 옛 "다 읽음"으로 읽기 전 판을 보이지 않게. */
export function forgetBoardLoad(projectId: string | null | undefined): void {
  if (projectId && useBoardLoadStore.getState().projectId === projectId) {
    useBoardLoadStore.setState({ projectId: null, status: 'loading', retry: null })
  }
}

/** [다시 불러오기] — 훅이 적어 둔 다시 읽기를 부른다. */
export function retryBoardLoad(): void {
  useBoardLoadStore.getState().retry?.()
}

export function useBoardLoadStatus(projectId: string | null | undefined): BoardLoadStatus {
  return useBoardLoadStore((s) => boardLoadStatusOf(s, projectId))
}
