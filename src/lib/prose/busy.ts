// Writer 산문 작업공간의 "AI 작업 중" 잠금(리뉴얼 1차 2026-10-19, 프로토타입 E5 · W2).
//   산문 초안을 쓰는 동안과 산문을 고치는 동안(세 가지 안 · 수정안)은 화면 전체를 진행 표시로 덮는다.
import type { SceneGatePhase } from '@/lib/writer/scene-gate'

export type ProseBusy =
  | { kind: 'draft'; step: 0 | 1 | 2 }
  | { kind: 'rewrite' }
  | { kind: 'revise' }
  | null

/** 초안 단계(Writer 01~04) → 진행 표시 세 줄(자료 정리 · 이야기 뼈대 · 씬 스토리 쓰기)의 지금 줄. */
function draftStep(stage: string | null | undefined): 0 | 1 | 2 {
  if (stage === 'narrativeStructure') return 1
  if (stage === 'scenes' || stage === 'storyCheck') return 2
  return 0
}

export function proseBusy(input: {
  draftLive: boolean
  phase: SceneGatePhase
  currentStage?: string | null
  proposal?: { status: string; variants?: readonly unknown[] } | null
  /** 수정 요청을 보냈는데 아직 수정안이 보이지 않는 동안. */
  requestPending: boolean
}): ProseBusy {
  if (input.draftLive && input.phase === 'writing') return { kind: 'draft', step: draftStep(input.currentStage) }
  if (input.phase !== 'gate') return null
  if (input.proposal?.status === 'generating') return input.proposal.variants?.length ? { kind: 'rewrite' } : { kind: 'revise' }
  if (!input.proposal && input.requestPending) return { kind: 'revise' }
  return null
}

/** 예전 방식(리뉴얼 전)으로 Writer 에 넘겨 씬 스토리 확정을 기다리는 프로젝트 — 새 Writer 화면에서도 확정해 이어 가게 한다.
 *  새 흐름의 확정한 산문은 실행이 아직 초안(draftRun)이라 Artist [만들기]로 이어 간다 — 여기에 해당하지 않는다. */
export function legacyGateWaiting(input: { locked: boolean; phase: SceneGatePhase; draftRun: boolean }): boolean {
  return input.locked && input.phase === 'gate' && !input.draftRun
}
