// Artist 첫 안내(2026-10-27 디자이너 QA 1차 관찰 49) — 인물 · 배경 카드가 생긴 뒤에 그 수로 한 번만 말한다.
//   예전에는 화면이 열리기만 하면(대기 시간이 지나도) 말해서, 산문 목록 단계(카드 행이 아직 없음)에
//   '캐릭터 0명 · 배경 0곳'이 채팅에 그대로 남았다. 디자인 중에는 카드가 일부만 있어 수가 틀린다.
//   채팅으로 인물 · 배경을 더할 수 없어(디자이너 QA 1차 #04) "추가"는 말하지 않는다.
import type { ArtistPhase } from '@/lib/artist/breakdown'
import { parseAttachmentMarker } from '@/lib/chat-blocks'
import { translate } from '@/lib/i18n/translate'
import { useGlobalChatStore } from '@/stores/global-chat-store'

export const ARTIST_BRIEF_TEXT =
  'I have concepts ready for the characters and backgrounds: {count} characters · {worldCount} backgrounds.\n' +
  "Let me know which character or background you'd like to revise.\n" +
  'Press "@" to pick a character or background (Ctrl+click a card does the same).'

/** 안내할 수 — 화면이 열렸고 디자인이 끝나 카드가 있을 때만. 아니면 null(아직 말하지 않는다). 수는 머리 줄과 같다(사람 인물 · 배경). */
export function artistBriefCounts(input: {
  ready: boolean
  phase: ArtistPhase
  characters: ReadonlyArray<{ entityType: 'person' | 'object' }>
  worlds: ReadonlyArray<unknown>
}): { count: number; worldCount: number } | null {
  if (!input.ready || input.phase === 'list' || input.phase === 'making') return null
  if (input.characters.length === 0 && input.worlds.length === 0) return null
  return { count: input.characters.filter((c) => c.entityType === 'person').length, worldCount: input.worlds.length }
}

/**
 * 첫 안내를 채팅에 한 번 남긴다. 이미 Artist 채팅이 있으면(안내했거나 대화했으면) 다시 말하지 않는다.
 *   true = 이 프로젝트는 안내를 마쳤다(떴거나 닫혔거나 이미 대화가 있다) — 화면은 더 부르지 않는다.
 */
export function offerArtistBrief(projectId: string, content: string | null): boolean {
  if (!content) return false
  const chat = useGlobalChatStore.getState()
  // 채팅 기록을 다 읽기 전에는 말하지 않는다 — 읽기 전이면 이미 안내한 프로젝트를 처음으로 보고 한 번 더 남겼다(#welcome-race 와 같은 이유).
  if (chat.messagesLoadedProjectId !== projectId) return false
  if (artistChatStarted(chat.messages)) return true
  const id = `artist-brief:${projectId}`
  const dismissed = chat.dismissedSuggestionIds.includes(id)
  chat.offerSuggestion({
    id,
    stage: 'artist',
    // #feedback 2026-08-07: 무엇을 만들었는지 + @멘션 · Ctrl+클릭 조작법.
    content,
    action: null,
    // dismissible(2026-08-11): 선점할 수 있어야 다른 제안이 이 안내에 막히지 않는다(#handoff-starved).
    dismissible: true,
  })
  return dismissed || useGlobalChatStore.getState().suggestion?.id === id || useGlobalChatStore.getState().messages.some((m) => m.stage === 'artist')
}

/** 첫 안내의 첫 문장(한 · 영) — 예전 문구("수정하거나 추가하고 싶은")로 남은 안내도 같은 문장으로 시작한다. */
const BRIEF_HEADS = (['ko', 'en'] as const).map((locale) => translate(locale, ARTIST_BRIEF_TEXT, { count: 0, worldCount: 0 }).split(':')[0])

/**
 * 이 프로젝트 Artist 채팅에서 이미 안내했거나 사람이 말을 걸었나.
 *   그림체를 올린 말풍선(그림 첨부) · 그림체 안내는 대화로 치지 않는다 — 스타일 창에서 그림체를 올리면
 *   Artist 채팅에 말풍선이 생겨 첫 안내를 영영 하지 않았다(검토 지적 13).
 */
function artistChatStarted(messages: ReadonlyArray<{ stage: string; role: string; content: string }>): boolean {
  return messages.some((message) => message.stage === 'artist' && (
    BRIEF_HEADS.some((head) => message.content.startsWith(head))
    || (message.role === 'user' && parseAttachmentMarker(message.content).urls.length === 0)
  ))
}
