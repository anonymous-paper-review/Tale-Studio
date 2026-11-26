// 보드(씬 · 샷 · 러프 · 대사 탭)가 지금 어느 단계 화면에 붙어 있나 — 같은 보드 부품을 콘티(/studio/conti)와 Storyboard(/studio/writer)가 쓴다
//   (오너 2026-11-26 O1 "콘티를 Artist 앞에"). 머리 이름 · 다음 단추 · 첫 안내 · 넘김 권유 · 알림이 이 단계를 따른다.
//   화면에서는 useProjectStore((s) => boardStageOf(s.currentStage)) 로 읽는다 — 값이 글자라 훅 조건 목록에 넣어도 렌더마다 바뀌지 않는다.
import type { StageId } from '@/types'

export type BoardStage = Extract<StageId, 'conti' | 'writer'>

/** 지금 단계가 콘티면 콘티, 아니면 Storyboard(보드의 원래 단계). */
export function boardStageOf(stage: string | null | undefined): BoardStage {
  return stage === 'conti' ? 'conti' : 'writer'
}
