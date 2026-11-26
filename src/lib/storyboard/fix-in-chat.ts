'use client'

// Storyboard 샷 상세의 [Lumi 에게 고쳐 달라고 하기](오너 2026-11-26 m1126 O7 "고칠 글을 채팅에 보내면 채팅이 맥락을 보고 그 샷 실사를 다시 그린다").
//   생성 요청을 바로 부르지 않는다 — Director 샷 상세(m-director O5 · ask-lumi-fix)와 같은 말 · 같은 단추로 채팅에 "@샷 N 이미지를 고쳐서 다시 만들어 줘: 바꿀 점"을 보내고,
//   채팅(Lumi)이 샷 글 · 인물 · 장소 · 지금 판을 보고 그 샷 실사를 다시 그린다(lib/storyboard/chat-image-tool · chat-images).
//   이름은 채팅 @ 고르기 목록과 같은 보드 이름(lib/storyboard/mention). 채팅이 접혀 있으면 먼저 편다. 채팅이 다른 말을 처리하는 중이면 보내지 않는다
//   (sendMessage 는 바쁘면 조용히 버린다) — 부른 쪽이 까닭을 보인다. 약속: tests/writer/real-dialog.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'

export type FixInChatResult = 'sent' | 'busy' | 'empty'

/** 채팅에 보낼 글 — Director 상세와 같은 문장(화면 언어), 샷은 보드 이름 멘션. */
export function fixInChatText(locale: AppLocale, label: string, change: string): string {
  return translate(locale, '@{shot} Fix the image and make it again: {change}', { shot: label, change: change.trim() })
}

/** 바꿀 점을 채팅으로 보낸다. 비었으면 'empty', 채팅이 바쁘면 'busy'(보내지 않음), 보냈으면 'sent'. */
export function sendFixToChat(label: string, change: string): FixInChatResult {
  if (!change.trim()) return 'empty'
  const chat = useGlobalChatStore.getState()
  if (chat.loading) return 'busy'
  useChatUiStore.getState().setCollapsed(false)
  void chat.sendMessage(fixInChatText(useLocaleStore.getState().locale, label, change))
  return 'sent'
}
