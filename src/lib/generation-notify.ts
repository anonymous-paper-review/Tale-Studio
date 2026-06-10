import { useGlobalChatStore } from '@/stores/global-chat-store'
import type { StageId } from '@/types'

/**
 * 백그라운드 생성 완료 → 크로스스테이지 알림 (chat-proactive-copilot Phase 2).
 *   artist-store / director-canvas-store 의 생성 완료 지점에서 호출한다.
 *   store→store import 금지 규약(.claude/rules/stores.md)을 피하려 lib 경유로 호출
 *   (lib→store 는 허용 — `lib/stage-nav.ts` 와 동일 패턴). getState() 런타임 호출이라
 *   global-chat-store ↔ feature store 순환 import 도 안전(top-level 실행 의존 없음).
 *
 *   유저가 *다른* stage 에 있을 때만 배지 bump + 스로틀된 채팅 메시지(throttle은 store가 처리).
 */
export function notifyGenerationComplete(stage: StageId, label: string): void {
  useGlobalChatStore.getState().notifyCompletion(stage, label)
}
