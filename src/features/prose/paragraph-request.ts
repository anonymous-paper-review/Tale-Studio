'use client'

// 붙은 문단으로 보내기(v3 W1, 오너 2026-11-03 결정 7). Writer 채팅 입력칸 위에 문단이 붙어 있으면 적은 말은 말 읽기
//   (다시 쓰기 조건 · 확정 창 · 채팅 대답)를 거치지 않고 그 문단만 고쳐 달라는 산문 수정 요청으로 간다 — 채팅에서
//   "고칠 점"을 말했을 때와 같은 수정안 길(reviseSceneGate)이다. 보내면 붙은 문단은 떨어진다.
//   넘김 · 확정 말(확정할게 · 브레이크다운하자 · 다음 단계로)은 문단과 상관없이 지금처럼 확정 창으로 간다(검토 A L1).
//   채팅에는 내가 한 말만 "S2 더 웃기게 해 줘"처럼 짧게 남고(AI 에게는 문단 앞부분을 붙인 요청), 보낸 직후 답 문장은 없다 —
//   수정안이 올 때까지 Lumi 점 세 개, 오면 Writer 화면이 "S2를 고쳐 봤어요…"를 남긴다(11/5 시안 WS, 오너 2026-11-09 추천대로).
//   물음은 예외다(오너 2026-11-14 답 B ①) — 붙은 문단이 있어도 물음이면 그 문단 수정 요청이 아니라 AI 가 답하고 문단 칩은 그대로 남는다.
//   "넘어갈까요?" 카드에 한 "응 · 아니"도 카드의 답이라 문단 수정이 아니다(F ①).
//   약속: tests/writer/prose-paragraph.test.ts · tests/writer/prose-paragraph-question.test.ts
import { translate } from '@/lib/i18n/translate'
import { contentLocale } from '@/lib/i18n/content'
import { answerToNextStep } from '@/lib/prose/next-answer'
import { paragraphChatLine, paragraphLabel, paragraphRequest, type ParagraphPick } from '@/lib/prose/paragraph-pick'
import { isProseQuestion } from '@/lib/prose/question'
import { writerChatIntent } from '@/lib/prose/writer-chat'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

/** 지금 프로젝트의 채팅 입력칸에 붙은 문단. */
export function attachedParagraph(): ParagraphPick | null {
  const pick = useWriterRoomStore.getState().paragraph
  return pick && pick.projectId === useProjectStore.getState().projectId ? pick : null
}

/** "넘어갈까요?" 카드(writerNext ask)가 떠 있나. */
function nextStepCardAsking(): boolean {
  const card = useGlobalChatStore.getState().suggestion
  return card?.stage === 'producer' && card.action?.kind === 'writerNext' && card.action.step === 'ask'
}

/**
 * 문단을 붙인 채 보낸 말이 어디로 가나.
 *   'paragraph' 붙은 문단 수정 요청 · 'question' 물음이라 AI 가 답한다(붙은 문단 칩은 그대로) · 'chat' 지금 채팅 길(붙은 문단이 없거나, 확정 창 · 카드 대답).
 *   넘김 · 확정 말이면 붙은 문단을 떼고 'chat' — 채팅은 지금 길(확정 창)로 보낸다. 카드 대답은 문단을 떼지 않는다.
 */
export function pickRoute(typed: string): 'paragraph' | 'question' | 'chat' {
  const said = typed.trim()
  if (!said || !attachedParagraph()) return 'chat'
  if (writerChatIntent(said, { proseDraft: true }) === 'breakdown') {
    useWriterRoomStore.getState().clearParagraph()
    return 'chat'
  }
  if (nextStepCardAsking() && answerToNextStep(said)) return 'chat'
  return isProseQuestion(said) ? 'question' : 'paragraph'
}

/** 이 말을 붙은 문단 수정 요청으로 보내나. 넘김 · 확정 말이면 붙은 문단을 떼고 false — 채팅은 지금 길(확정 창)로 보낸다. 물음 · 카드 대답도 false(문단은 그대로). */
export function goesToParagraph(typed: string): boolean {
  return pickRoute(typed) === 'paragraph'
}

/** 붙은 문단이 그대로 남은 채 보낸 물음인가 — 입력칸이 이 말을 Writer 고치기 길이 아니라 AI 답으로 보낸다(sendMessage askOnly, 오너 2026-11-14 B ①). */
export function questionAboutPick(typed: string): boolean {
  const said = typed.trim()
  return !!said && !!attachedParagraph() && isProseQuestion(said)
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
  const line = paragraphChatLine(pick, said)
  if (ok) {
    useGlobalChatStore.getState().appendLocalUser('producer', line)
    useWriterRoomStore.getState().setReviseAnnounce({ projectId, label: paragraphLabel(pick.index) })
    return true
  }
  const reply = useGlobalChatStore.getState().error ?? translate(contentLocale(), 'Could not send the change request. Please try again.')
  // 고치기 안이 [적용]을 기다려 튕겼다(리드 2026-11-14 C) — 쓴 글과 붙였던 문단을 되돌리고 채팅에는 안내만 남긴다(같은 말이 대화에 두 번 보이지 않게).
  if (useGlobalChatStore.getState().reviseRefused === 'pending') {
    useChatUiStore.getState().requestInputRestore(said, projectId)
    useWriterRoomStore.setState({ paragraph: pick })
    useGlobalChatStore.getState().notifyIssue('producer', reply)
    useGlobalChatStore.setState({ error: reply })
    return true
  }
  useGlobalChatStore.getState().appendLocalExchange('producer', line, reply)
  useGlobalChatStore.setState({ error: reply })
  return true
}
