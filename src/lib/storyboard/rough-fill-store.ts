'use client'

// Storyboard 이어 그리기(빠진 콘티 그림)의 상태 — 보드 · 머리 [시작] · 채팅 고치기가 같은 "그리는 중"을 본다(리드 2026-11-26 m1126).
//   pending = 이어 그리기가 보냈고 아직 샷을 다시 읽지 않은 샷: 작업이 큐에 오르기 전 · 끝난 뒤 다시 읽는 동안에도 그 카드가 기다림을 보이게(깜박임 방지).
//   running = 이어 그리기가 도는 중(한 번에 하나). 서버 요청 · 펌프는 lib/storyboard/rough-fill. 약속: tests/writer/real-rough-fill.test.ts
import { create } from 'zustand'

export interface RoughFillState {
  projectId: string | null
  pending: Readonly<Record<string, true>>
  running: boolean
}

export const useRoughFillStore = create<RoughFillState>(() => ({ projectId: null, pending: {}, running: false }))

const NO_PENDING: Readonly<Record<string, true>> = {}

/** 그 프로젝트의 pending — 다른 프로젝트 것은 보지 않는다. */
export function roughFillPendingOf(state: RoughFillState, projectId: string | null): Readonly<Record<string, true>> {
  return projectId && state.projectId === projectId ? state.pending : NO_PENDING
}

/** 화면에서 읽는 pending(같은 참조를 돌려 다시 그리기를 부르지 않는다). */
export function useRoughFillPending(projectId: string | null): Readonly<Record<string, true>> {
  return useRoughFillStore((state) => roughFillPendingOf(state, projectId))
}
