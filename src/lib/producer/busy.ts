// Producer 본문 로딩 표시(2026-10-09 오너 "처음 들어왔을 때 바로 로딩 애니메이션이 안 떠서 알아차리기가 힘들다") — 순수.
//   새 프로젝트가 넘긴 일이 남아 있거나(Producer 화면이 실리기 전) 하는 중이면, 또는 채팅에서 고른 만화를 대본으로 옮기는 중이면
//   본문을 막고 로딩 원과 지금 하는 일을 보인다. 트리트먼트 쓰기 · 그림체 분석은 자기 진행 표시가 있어 막지 않는다.
import type { PendingCreation } from '@/stores/pending-creation-store'

export type ProducerBusyKind = 'comic' | 'materials'

/** 채팅 스토어가 일하는 동안 들고 있는 표시 — 어느 프로젝트에서 무슨 일을 하는가. */
export interface BoardBusy {
  projectId: string
  kind: ProducerBusyKind
}

export function producerBusyKind(
  projectId: string | null,
  state: { pending: PendingCreation | null | undefined; busy: BoardBusy | null },
): ProducerBusyKind | null {
  if (!projectId) return null
  if (state.busy?.projectId === projectId) return state.busy.kind
  if (state.pending) return state.pending.original === 'comic' ? 'comic' : 'materials'
  return null
}
