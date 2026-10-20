// 단계 열림 규칙 (리뉴얼 1차 2026-10-19, 프로토타입 20261013).
//
//   화면 이름 Producer → Writer → Artist → Storyboard → Director → Editor 순서로 하나씩 열린다.
//   id 는 옛 이름이다(types/project.ts): entry=Producer, producer=Writer, artist=Artist, writer=Storyboard.
//   - 시작(산문 초안)을 하면 Writer
//   - 산문을 확정하면 Artist (DB current_stage = artist, 산문은 이때 잠긴다)
//   - Artist 에서 완료하기를 하면 Storyboard (DB current_stage = writer)
//   - Director · Editor 는 지금처럼 넘기기로 연다
//   열린 단계는 닫히지 않는다(단조). 넘어간 Producer · Writer 는 잠금이 아니라 "완료" — 다시 볼 수 있다.
//
//   저장된 current_stage 'producer' 는 새 프로젝트의 기본값이기도 해서(아직 시작 전) 그것만으로는 Writer 를 열지 않는다.
//   예전 흐름 프로젝트는 저장값의 순서가 지금과 달라(예전 writer 는 artist 보다 앞) 산출물로도 본다 — 샷이 있으면 Storyboard 까지.
import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'

export interface StageFacts {
  /** projects.current_stage — 지금까지 연 최고 단계(id). */
  storedStage: string
  /** 산문 초안을 시작했다(Writer 실행 기록이 있다). */
  treatmentStarted: boolean
  /** 초안이 아닌 Writer 실행이 있다 — 산문을 넘겨 인물·배경 그림 이후로 간 프로젝트(예전 흐름 포함). */
  runContinued: boolean
  /** 샷 행이 있다(Storyboard 를 돌렸거나, 예전 흐름으로 샷까지 만든 프로젝트). */
  hasShots: boolean
  /** 실행이 새 Writer 에서 산문 확정을 거쳤다(run state _proseLocked) — 2026-10-20부터 이런 실행은 [만들기]가 씬 · 샷까지 이어 만들어
   *  샷이 [완료하기]보다 먼저 생긴다. 그래서 샷만으로 Storyboard 를 열지 않는다(저장 단계 writer = [완료하기]로만 연다). */
  proseConfirmed?: boolean
}

export function stageIndex(id: StageId): number {
  return STAGES.findIndex((s) => s.id === id)
}

function isStageId(v: string): v is StageId {
  return STAGES.some((s) => s.id === v)
}

function further(a: StageId, b: StageId): StageId {
  return stageIndex(a) >= stageIndex(b) ? a : b
}

/** 사실로 본 "지금까지 연 최고 단계". */
export function reachedStageFromFacts(f: StageFacts): StageId {
  let reached: StageId = isStageId(f.storedStage) && f.storedStage !== 'producer' ? f.storedStage : 'entry'
  if (f.treatmentStarted) reached = further(reached, 'producer')
  if (f.runContinued) reached = further(reached, 'artist')
  if (f.hasShots && !f.proseConfirmed) reached = further(reached, 'writer')
  return reached
}

export function canEnterStage(stage: StageId, f: StageFacts): boolean {
  return stageIndex(stage) <= stageIndex(reachedStageFromFacts(f))
}

/** 산문이 잠겼나 — Artist 이후가 열렸으면 Writer 산문은 고칠 수 없다(롤백은 2차). */
export function proseLockedFromFacts(f: StageFacts): boolean {
  return stageIndex(reachedStageFromFacts(f)) >= stageIndex('artist')
}
