// 채팅으로 대사만 고치기(오너 2026-11-27 Q1 "대사 수정 기능을 채팅창에서도 이용할 수 있게") — Storyboard 채팅(api/writer/chat)과 Director 채팅이 같이 쓴다.
//   모델 말(updateDialogue) · 서버 검증 · 답 끝 안내를 한 곳에 둬 두 길로 나뉘지 않게 한다.
//   대사 줄 규칙은 콘티 채팅과 같다(validateWriterUpdates — 등록된 인물 id 또는 내레이션 null, 그대로 둔 줄의 감정 · 말투 · 길이 · 시점 보존, 불량 줄만 있는 배열은 버림).
//   받은 고침은 콘티 채팅 고침과 같은 모양(updateShot · patch.dialogueLines 만)이라 화면이 같은 저장 길(writer-store applyChatUpdates —
//   도구가 있으면 확인된 저장, 줄이 줄면 승인 카드)로 저장한다. 모델 말이 updateShot 이 아닌 까닭: Director 채팅의 updateShot 은 캔버스 샷 고치기다.
//   약속: tests/chat/dialogue-edit.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { validateWriterUpdates } from '@/lib/writer-chat-updates'
import type { DialogueLine } from '@/types'

/** 모델 안내 — 대사만 고치는 채팅의 고침 말과 줄 규칙(콘티 채팅 <script-lines> 의 대사 규칙과 같은 뜻). */
export const DIALOGUE_EDIT_GUIDE = `

<dialogue-edits>
You can change the shots' dialogue here: a line's text, who says a line, adding lines and removing lines. Nothing else about a shot changes here.
To change one shot's dialogue, emit (in the same updates block):
{"type":"updateDialogue","id":"<shotId>","dialogueLines":[{"characterId":"<characterId>","text":"..."}, ...]}
- "id" is the exact shot_id from the context. Never invent one.
- "dialogueLines" is the shot's complete new list in order. Include every line you keep and carry over each kept line's existing fields unchanged (characterId, emotion, delivery, durationHint, plannedTiming); resubmitting a line with only characterId and text erases the rest.
- characterId is a character ID from the roster (the part before the parenthesis, never the name), or null for narration (V.O.). Keep null when editing narration. Never invent IDs.
- Emit at most one updateDialogue per shot. Removing lines asks the user to approve before anything is saved, so remove lines only when the user clearly asks.
- When you change dialogue, your reply names the shot by its board name and says what changed.
</dialogue-edits>`

/** 받은 대사 고침 — 콘티 채팅 고침과 같은 모양이라 화면이 같은 길로 저장한다. */
export type DialogueEditUpdate = { type: 'updateShot'; id: string; patch: { dialogueLines: DialogueLine[] } }

/** 모델이 낸 updates 중 대사 고침({"type":"updateDialogue","id","dialogueLines"})만 콘티 채팅과 같은 줄 규칙으로 받는다.
 *  없는 인물의 줄은 빼고 droppedCharacterIds 에 적는다(부른 쪽이 답 끝에 알린다). 쓸 줄이 하나도 없는 고침 · 샷 id 가 없는 고침은 받지 않는다.
 *  빈 목록(대사 모두 지우기)은 받는다 — 줄이 줄면 화면이 저장 전에 승인을 묻는다. 같은 샷은 뒤 것 하나만. */
export function pickDialogueEdits(
  raw: readonly unknown[],
  allowedCharacterIds?: ReadonlySet<string>,
  droppedCharacterIds?: string[],
): DialogueEditUpdate[] {
  const byShot = new Map<string, DialogueEditUpdate>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (rec.type !== 'updateDialogue' || typeof rec.id !== 'string' || !rec.id.trim() || !Array.isArray(rec.dialogueLines)) continue
    const id = rec.id.trim()
    const [checked] = validateWriterUpdates([{ type: 'updateShot', id, patch: { dialogueLines: rec.dialogueLines } }], allowedCharacterIds, droppedCharacterIds)
    const lines = (checked as { patch?: { dialogueLines?: unknown } } | undefined)?.patch?.dialogueLines
    if (!Array.isArray(lines)) continue
    byShot.delete(id)
    byShot.set(id, { type: 'updateShot', id, patch: { dialogueLines: lines as DialogueLine[] } })
  }
  return [...byShot.values()]
}

/** 대사를 고친 답 끝에 붙이는 고정 안내 — 답과 같은 채팅 언어(이미 만든 Take 는 그대로, 새 Take 부터). */
export function dialogueEditNotice(locale: AppLocale): string {
  return translate(locale, 'New videos use the edited dialogue.')
}
