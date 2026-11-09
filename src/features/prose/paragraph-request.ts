'use client'

// 붙은 문단으로 보내기(v3 W1, 오너 2026-11-03 결정 7). Writer 채팅 입력칸 위에 문단이 붙어 있으면 적은 말은 말 읽기
//   (다시 쓰기 조건 · 확정 창 · 채팅 대답)를 거치지 않고 그 문단만 고쳐 달라는 산문 수정 요청으로 간다 — 채팅에서
//   "고칠 점"을 말했을 때와 같은 수정안 길(reviseSceneGate)이다. 보내면 붙은 문단은 떨어진다.
//   넘김 · 확정 말(확정할게 · 브레이크다운하자 · 다음 단계로)은 문단과 상관없이 지금처럼 확정 창으로 간다(검토 A L1).
//   약속: tests/writer/prose-paragraph.test.ts
import { translate } from '@/lib/i18n/translate'
import { contentLocale } from '@/lib/i18n/content'
import { paragraphRequest, type ParagraphPick } from '@/lib/prose/paragraph-pick'
import { writerChatIntent } from '@/lib/prose/writer-chat'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

/** 지금 프로젝트의 채팅 입력칸에 붙은 문단. */
export function attachedParagraph(): ParagraphPick | null {
  const pick = useWriterRoomStore.getState().paragraph
  return pick && pick.projectId === useProjectStore.getState().projectId ? pick : null
}

/** 이 말을 붙은 문단 수정 요청으로 보내나. 넘김 · 확정 말이면 붙은 문단을 떼고 false — 채팅은 지금 길(확정 창)로 보낸다. */
export function goesToParagraph(typed: string): boolean {
  const said = typed.trim()
  if (!said || !attachedParagraph()) return false
  if (writerChatIntent(said, { proseDraft: true }) !== 'breakdown') return true
  useWriterRoomStore.getState().clearParagraph()
  return false
}

/** 붙은 문단으로 보낸다. 붙은 문단이 없거나 말이 비었거나 넘김 · 확정 말이면 보내지 않고 false — 채팅은 지금 길로 보낸다. */
export async function sendParagraphRequest(typed: string): Promise<boolean> {
  const said = typed.trim()
  if (!goesToParagraph(said)) return false
  const pick = attachedParagraph()
  if (!pick) return false
  const projectId = pick.projectId
  const text = paragraphRequest(pick, said, useLocaleStore.getState().locale)
  useWriterRoomStore.getState().clearParagraph()
  // 수정안이 정해질 때까지 어느 문단을 고치는지 기억한다 — 고치는 동안 그 문단만 흐리게(11/5 시안 WL). 보내지 못하면 잊는다.
  useWriterRoomStore.getState().setRevising(pick)
  const chat = useGlobalChatStore.getState()
  chat.dismissSuggestion({ implicit: true })
  useGlobalChatStore.setState({ error: null })
  const ok = await chat.reviseSceneGate(text)
  if (!ok && useWriterRoomStore.getState().revising === pick) useWriterRoomStore.getState().clearRevising()
  // 답을 기다리는 사이 다른 프로젝트로 옮겼으면 그 채팅에 남기지 않는다.
  if (useProjectStore.getState().projectId !== projectId) return true
  const reply = ok
    ? translate(contentLocale(), 'Creating a scene story proposal. You can keep chatting and editing while it is prepared.')
    : useGlobalChatStore.getState().error ?? translate(contentLocale(), 'Could not send the change request. Please try again.')
  useGlobalChatStore.getState().appendLocalExchange('producer', text, reply)
  if (!ok) useGlobalChatStore.setState({ error: reply })
  return true
}
