'use client'

// Storyboard 샷 상세의 [채팅으로 고치기](오너 2026-11-26 m1126 O7 "고칠 글을 채팅에 보내면 채팅이 맥락을 보고 그 샷 실사를 다시 그린다").
//   생성 요청을 바로 부르지 않는다 — 채팅에 "@샷 N 바꿀 점"을 보내고, 채팅(Lumi)이 샷 글 · 인물 · 장소를 보고 그 샷을 다시 그린다.
//   이름은 채팅 @ 고르기 목록과 같은 보드 이름(lib/storyboard/mention). 채팅이 접혀 있으면 먼저 편다(보낸 말과 답이 보이게).
//   약속: tests/writer/real-dialog.test.ts
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'

/** 채팅에 보낼 글 — 보드 이름 멘션 + 바꿀 점. */
export function fixInChatText(label: string, change: string): string {
  return `@${label} ${change.trim()}`
}

/** 바꿀 점을 채팅으로 보낸다. 비어 있으면 보내지 않는다. */
export async function sendFixToChat(label: string, change: string): Promise<void> {
  if (!change.trim()) return
  useChatUiStore.getState().setCollapsed(false)
  await useGlobalChatStore.getState().sendMessage(fixInChatText(label, change))
}
