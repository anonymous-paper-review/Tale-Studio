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
