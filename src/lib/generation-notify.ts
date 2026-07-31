import { useGlobalChatStore } from '@/stores/global-chat-store'
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
