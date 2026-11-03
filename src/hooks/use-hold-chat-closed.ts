'use client'

// 단계 화면이 붙어 있는 동안 오른쪽 채팅을 닫아 둔다 — Director(v3 D1, 2026-11-03) · Editor(요청 6b).
//   사용자가 고른 열림/닫힘은 모든 단계가 함께 쓰는 기억이라 건드리지 않는다: 화면을 떠나면 들어오기 전 모습으로 돌아가고,
//   닫아 둔 동안 새로고침해도 기억에는 사용자 것이 남는다(chat-ui-store chatHolds). 약속: tests/director/chat-closed.test.ts
import { useEffect } from 'react'
import { useChatUiStore } from '@/stores/chat-ui-store'

export function useHoldChatClosed(holder: string) {
  useEffect(() => {
    useChatUiStore.getState().holdChatClosed(holder)
    return () => useChatUiStore.getState().releaseChatHold(holder)
  }, [holder])
}
