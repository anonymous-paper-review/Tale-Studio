'use client'

// 단계 화면이 붙어 있는 동안 오른쪽 채팅을 닫아 둔다 — Director(v3 D1, 2026-11-03) · Editor(요청 6b).
//   사용자가 고른 열림/닫힘은 모든 단계가 함께 쓰는 기억이라 건드리지 않는다: 화면을 떠나면 들어오기 전 모습으로 돌아가고,
//   닫아 둔 동안 새로고침해도 기억에는 사용자 것이 남는다(chat-ui-store chatHolds). 약속: tests/director/chat-closed.test.ts
//   닫아 둘 때 채팅 입력칸에 있던 커서는 뺀다 — 숨은 입력칸에 치는 글이 들어가 Enter 로 보이지 않게 보내지지 않게(검토 B B1).
import { useEffect } from 'react'
import { useChatUiStore } from '@/stores/chat-ui-store'

/** 지금 커서가 채팅 안([data-chat-panel])에 있으면 뺀다. 채팅 밖의 커서는 그대로 둔다. */
function dropChatFocus() {
  if (typeof document === 'undefined') return
  const active = document.activeElement as (Element & { blur?: () => void }) | null
  if (active?.closest?.('[data-chat-panel]')) active.blur?.()
}

export function useHoldChatClosed(holder: string) {
  useEffect(() => {
    useChatUiStore.getState().holdChatClosed(holder)
    dropChatFocus()
    return () => useChatUiStore.getState().releaseChatHold(holder)
  }, [holder])
}
