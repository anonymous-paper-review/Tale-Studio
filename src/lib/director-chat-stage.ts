// Director 채팅 엔진(/api/director/chat · 빠른 칩 · 되묻기 · 글 고침 [적용] 카드)을 쓰는 단계 — Camera(오너 2026-11-22 D2~D5)와 Director.
//   두 화면은 같은 샷을 보고 같은 막이(그림 Take 0 · 영상은 말한 샷만 · Take 가 모자라면 시작 안 함, 11/14 9번)를 쓴다. 채팅방 구간 · 카드 단계는 말한 화면의 것이다.
//   약속: tests/camera/chat.test.ts
import type { StageId } from '@/types'

export type DirectorChatStage = Extract<StageId, 'camera' | 'director'>

export function isDirectorChatStage(stage: StageId | null | undefined): stage is DirectorChatStage {
  return stage === 'camera' || stage === 'director'
}

/** 채팅 줄 · 카드에 붙일 단계 — Camera 에서 말했으면 Camera, 그 밖은 Director. */
export function directorChatStage(stage: StageId | null | undefined): DirectorChatStage {
  return stage === 'camera' ? 'camera' : 'director'
}
