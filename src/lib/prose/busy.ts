// Writer 산문 작업공간의 "AI 작업 중" 잠금(리뉴얼 1차 2026-10-19, 프로토타입 E5 · W2).
//   산문 초안을 쓰는 동안과 산문을 고치는 동안(세 가지 안 · 수정안)은 화면 전체를 진행 표시로 덮는다.
import type { SceneGatePhase } from '@/lib/writer/scene-gate'

export type ProseBusy =
  /** step null = 진행 상태를 아직 읽지 못해 어느 줄인지 모른다(줄 목록 없이 잠근다). */
  | { kind: 'draft'; step: 0 | 1 | 2 | null }
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
  /** Writer 진행 상태를 한 번이라도 읽었나(읽다 실패한 것도 읽은 것). 없으면 읽은 것으로 본다.
   *  아직이면(false) 넘기기 전 초안은 쓰는 중으로 보고 잠근다 — Writer 에 들어온 직후 상태를 읽는 약 2초 동안
   *  잠금 없이 [산문 쓰기]와 채팅 입력이 열렸다(디자이너 QA 1차 #07). */
  statusRead?: boolean
  currentStage?: string | null
  proposal?: { status: string; variants?: readonly unknown[] } | null
  /** 수정 요청을 보냈는데 아직 수정안이 보이지 않는 동안. */
  requestPending: boolean
}): ProseBusy {
  if (input.draftLive && input.statusRead === false) return { kind: 'draft', step: null }
  if (input.draftLive && input.phase === 'writing') return { kind: 'draft', step: draftStep(input.currentStage) }
  if (input.phase !== 'gate') return null
  if (input.proposal?.status === 'generating') return input.proposal.variants?.length ? { kind: 'rewrite' } : { kind: 'revise' }
  if (!input.proposal && input.requestPending) return { kind: 'revise' }
  return null
}

/** 산문 자리의 [산문 쓰기] — 진행 상태를 읽어 Writer 가 아직 쓴 적이 없다고 안 뒤에만 둔다(디자이너 QA 1차 #07).
 *  읽기 전에 두면 쓰는 중인 초안 위로 단추가 잠깐 열려 같은 산문을 두 번 쓰게 할 수 있다. */
export function proseStartOffered(input: { locked: boolean; storyReady: boolean; phase: SceneGatePhase; statusRead: boolean }): boolean {
  return !input.locked && input.storyReady && input.statusRead && input.phase === 'before'
}

/** 예전 방식(리뉴얼 전)으로 Writer 에 넘겨 씬 스토리 확정을 기다리는 프로젝트 — 새 Writer 화면에서도 확정해 이어 가게 한다.
 *  새 흐름의 확정한 산문은 실행이 아직 초안(draftRun)이라 Artist [만들기]로 이어 간다 — 여기에 해당하지 않는다. */
export function legacyGateWaiting(input: { locked: boolean; phase: SceneGatePhase; draftRun: boolean }): boolean {
  return input.locked && input.phase === 'gate' && !input.draftRun
}

/** 산문을 넘긴 뒤(초안이 아닌 실행) 실행이 멈췄다 — Writer 화면에 멈춘 이유와 [이어서 다시 시도]를 보인다(리뉴얼 1차 검토).
 *  산문 초안을 쓰다 실패한 것은 산문 자리의 [다시 시도](재료 · 조건 그대로 처음부터)가 맡는다. */
export function handedRunStopped(input: { draftLive: boolean; phase: SceneGatePhase }): boolean {
  return !input.draftLive && input.phase === 'failed'
}
