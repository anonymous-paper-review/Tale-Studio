import { useGlobalChatStore } from '@/stores/global-chat-store'
import { generationFailureMessage, generationGaveUpMessage } from '@/lib/generation-failure'
import type { StageId } from '@/types'

/**
 * 백그라운드 생성 완료 → 크로스스테이지 알림 (chat-proactive-copilot Phase 2).
 *   artist-store / director-store 의 생성 완료 지점에서 호출한다.
 *   store→store import를 피하려 lib 경유로 호출
 *   (lib→store 는 허용 — `lib/stage-nav.ts` 와 동일 패턴). getState() 런타임 호출이라
 *   global-chat-store ↔ feature store 순환 import 도 안전(top-level 실행 의존 없음).
 *
 *   유저가 *다른* stage 에 있을 때만 배지 bump + 스로틀된 채팅 메시지(throttle은 store가 처리).
 */
export function notifyGenerationComplete(stage: StageId, label: string): void {
  useGlobalChatStore.getState().notifyCompletion(stage, label)
}

/**
 * 생성 트리거 실패 → 사유를 채팅에 남긴다 (#double-fire 2026-07-31).
 *   실패를 삼키고 노드/카드 상태로만 표시하던 store 액션들이 쓴다 — 카드의 작은 빨간 글씨는
 *   캔버스를 스크롤하면 안 보이지만, 채팅은 stage 를 옮겨도 남는 기록이다.
 *   완료 통지와 달리 보고 있는 stage 여도 띄운다(방금 누른 버튼의 즉답).
 */
export function notifyGenerationFailure(
  stage: StageId,
  label: string,
  message: string,
): void {
  useGlobalChatStore.getState().notifyActionError(stage, label, message)
}

/**
 * 생성 잡이 실패했을 때 — 프로바이더 원문을 사용자 언어("무엇이 있었나 + 뭘 하면 되나")로 옮겨 남긴다.
 *   notifyGenerationFailure 와 구분: 저쪽은 *제출조차 못 한* 경우, 이쪽은 제출 후 실패한 경우다.
 *   문구가 다르면 사용자가 다른 행동을 하게 되므로 섞지 않는다.
 */
export function notifyGenerationFailed(stage: StageId, label: string, raw: string): void {
  useGlobalChatStore.getState().notifyIssue(stage, generationFailureMessage(label, raw))
}

/**
 * 약속 E4(2026-09-04): 일괄 생성이 끝났을 때 "N개 완료, M개 실패" 한 줄 — 보고 있는 stage 여도 남긴다
 *   (일괄은 사람이 누른 것이라 결과 줄이 있어야 한다). 건별 완료 알림은 일괄 모드에서 내지 않는다.
 */
export function notifyBatchSummary(stage: StageId, content: string): void {
  useGlobalChatStore.getState().notifyIssue(stage, content)
}

/**
 * give-up 게이트로 자동 생성이 멈췄을 때.
 *   이걸 안 알리면 화면상 아무 일도 안 일어난 것과 구분되지 않는다 — 그리고 원인이 고쳐져도
 *   자동으로는 복구되지 않으므로 "사람이 눌러야 한다"를 반드시 전달해야 한다.
 */
export function notifyGenerationGaveUp(stage: StageId, label: string): void {
  useGlobalChatStore.getState().notifyIssue(stage, generationGaveUpMessage(label))
}
