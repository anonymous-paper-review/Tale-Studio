// 보드(씬 · 샷 · 러프 · 대사 탭)가 지금 어느 단계 화면에 붙어 있나 — 같은 보드 부품을 콘티(/studio/conti)와 Storyboard(/studio/writer)가 쓴다
//   (오너 2026-11-26 O1 "콘티를 Artist 앞에"). 머리 이름 · 다음 단추 · 첫 안내 · 넘김 권유 · 알림이 이 단계를 따른다.
//   화면에서는 주소로 정한다(boardStageAt) — 지금 단계 값(저장소)은 레이아웃(부모)의 효과가 주소를 본 *뒤* 바뀌는데,
//   React 는 자식 효과를 먼저 돌려 보드가 처음 붙는 순간에는 저장소가 아직 앞 화면이다(검토 rev-flow 2026-11-26 1번 — 그 순간
//   콘티 보드가 자기를 Storyboard 로 알아 Artist 그림을 그렸다). 오른쪽 채팅도 같은 까닭으로 주소에서 단계를 읽는다(#chat-continuity).
import { stageIdFromPathname } from '@/lib/stage-transition'
import type { StageId } from '@/types'

export type BoardStage = Extract<StageId, 'conti' | 'writer'>

/** 지금 단계가 콘티면 콘티, 아니면 Storyboard(보드의 원래 단계). */
export function boardStageOf(stage: string | null | undefined): BoardStage {
  return stage === 'conti' ? 'conti' : 'writer'
}

/** 화면 주소가 보드 주소(콘티 /studio/conti · Storyboard /studio/writer)면 그 단계, 아니면 null — 지금 단계 값을 보지 않는다. */
export function boardStageOfPath(pathname: string | null | undefined): BoardStage | null {
  const stage = pathname ? stageIdFromPathname(pathname) : null
  return stage === 'conti' || stage === 'writer' ? stage : null
}

/** 보드가 붙은 화면 주소의 단계. 단계 주소가 아니면(주소가 없는 시험 · 미리 보기) 저장소의 지금 단계를 본다. */
export function boardStageAt(pathname: string | null | undefined, storeStage: string | null | undefined): BoardStage {
  return boardStageOf((pathname ? stageIdFromPathname(pathname) : null) ?? storeStage)
}
