// 대본 보존 안내문(#script-preserve 2026-09-17) — 사용자가 "대본을 그대로 보존"을 고른 프로젝트의 채팅 턴에서
//   모델에게 줄거리를 다시 쓰지 말라고 알리는 컨텍스트 블록. 시스템 프롬프트는 storyText 를 "각색 문단"으로
//   내라고 하므로(system-prompt.ts) 이 블록이 없으면 모델이 대본을 요약해 버린다. 최종 방어는 클라이언트
//   (producer-store.applyExtractedSettings 가 보존 중엔 storyText 제안을 버린다) — 이 안내문은 1차 방어다.

/** 클라가 보낸 값이 명시적 true 일 때만 안내문을 돌려준다. 문자열·누락은 종전 경로(각색). */
export function preservedScriptDirective(preserveScript: unknown): string | null {
  if (preserveScript !== true) return null
  return [
    '[Preserved Script]',
    'The Current Story Text above is a script the user chose to keep exactly as written.',
    'Do not rewrite, summarize, adapt or translate it, and do not emit storyText in extractedSettings.',
    'Treat the story as ready (storyReady: true). Read the script and fill only what it supports:',
    'project settings, cast cards (characters as written) and background cards (locations as written).',
    // 2026-10-09 오너 "영상 길이 제한을 없애줘" — 그대로 쓰기는 길이 설정을 쓰지 않는다(/api/writer/start → preserveRuntime).
    'The video runs as long as the script: the runtime setting is not used, so do not set playtime,',
    'never state a runtime in seconds, and if asked, say the length follows the original.',
    'Answer the user in the response language, and never claim you rewrote or tidied the story.',
  ].join('\n')
}

/**
 * 고정된 그림체 안내문(2026-10-09 오너 "그림체 추출을 고르면 Producer 에서 스타일 선택을 막아줘") — 사용자가 올린 그림을
 * "그림체"로 고른 프로젝트의 채팅 턴. 모델은 다른 스타일을 고르거나 권하지 않는다. 최종 방어는 클라이언트(producer-store 가드).
 */
export function fixedStyleDirective(styleLocked: unknown): string | null {
  if (styleLocked !== true) return null
  return [
    '[Fixed Art Style]',
    "The project's art style was extracted from a picture the user uploaded and chose as the art style. It is fixed for this project.",
    'Do not emit styleAnchorKey or styleAnchorFromAttachment, and do not suggest choosing another style or the palette icon.',
    "If the user asks to change the art style, say plainly that it comes from the picture they chose and can't be changed in this project.",
  ].join('\n')
}

/**
 * 카드 채우기 안내문(#image-to-artist 2026-09-17) — 사용자가 올린 그림을 인물·배경 카드로 쓰기로 해서 오는 숨은 턴.
 * 모델은 그 카드 하나만 채운다(줄거리·설정·다른 카드·화풍 제안 금지). 최종 방어는 클라이언트(coerceCardFill).
 */
export function imageCardFillDirective(cardFill: unknown): string | null {
  if (!cardFill || typeof cardFill !== 'object') return null
  const { kind, ref, appearanceOnly } = cardFill as { kind?: unknown; ref?: unknown; appearanceOnly?: unknown }
  if ((kind !== 'character' && kind !== 'background') || typeof ref !== 'string' || !ref) return null
  const target = kind === 'character' ? `the cast card with ref "${ref}"` : `the background card with ref "${ref}"`
  // 산문 인물 카드에 이은 사진(2026-11-11 오너 결정 2) — 외모만 사진에 맞춰 다시 쓰고 이름 · 역할은 산문이 정한 그대로 둔다.
  const fields =
    kind === 'character' && appearanceOnly === true
      ? 'appearance only (age, hair, face, build, clothing, colors, in the response language), rewritten to match the picture. Keep the existing name, role and other fields; do not emit them'
      : kind === 'character'
        ? 'name (only if it is obvious from the picture, otherwise leave it out), entityType, appearance (age, hair, face, build, clothing, colors, in the response language), role only if obvious'
        : 'name for the place, visualDescription (what is in the picture: place, time of day, light, materials, mood, in the response language), purpose (what such a place could be in a story)'
  return [
    '[Image Card Fill]',
    `The attached image belongs to ${target}. Look at the image and fill ONLY that card, using its ref.`,
    `Fields: ${fields}.`,
    'Do not emit storyText, storyReady, project settings, other cards, styleAnchorKey or styleAnchorFromAttachment in this turn.',
    'Do not invent a story. Reply with one short sentence saying what you filled in.',
  ].join('\n')
}

/**
 * 잠긴 Producer 안내문(2026-10-01 오너 "producer 완성 시 잠그기", "잠금을 풀 수 없게") — 산문을 확정한 프로젝트의 채팅 턴.
 * 모델은 질문에는 답하되 이야기·설정·인물·배경·화풍을 바꾸자고 제안하지 않는다. 최종 방어는 클라이언트
 * (producer-store 가드 + 바꾸는 제안이면 모델 답 대신 "바꾸지 않았다"를 남긴다).
 * 화면 이름은 지금 이름이다(리드 2026-11-14 D): Writer 는 산문 화면, 씬 · 샷은 Storyboard 화면 — "handed over to Writer"는 옛 말이라 "Producer 가 잠겼다"로 새어 나갔다.
 */
export function lockedProducerDirective(producerLocked: unknown): string | null {
  if (producerLocked !== true) return null
  return [
    '[Locked Producer]',
    'The user confirmed the prose on the Writer screen, so the prose and the materials behind it (story, settings, cast cards, background cards, art style) are confirmed and locked. They cannot change in this project.',
    'Answer questions about them, summarize or explain them, but do not emit extractedSettings, choices or proposals that change them.',
    'If the user asks for a change, say plainly that the prose is confirmed and locked, that a new project is needed to write a different story,',
    'and that character and background pictures can still be changed on the Artist screen, and scenes, shots and dialogue can still be edited on the Storyboard screen once it opens.',
    // 2026-10-27 디자이너 QA 1차 #04: 산문 밖에서(예전 Artist 채팅) 만들어진 인물 카드는 지우기 단추로 지울 수 있다 — "새 프로젝트가 필요해요"와 어긋나지 않게.
    'One exception: a character card that was made outside the prose (for example by the old Artist chat) and is not used by any scene or shot',
    'can be deleted with the trash button on that card in Artist. Say so if the user wants to remove such a card. You cannot delete it from this chat.',
  ].join('\n')
}

/** 넘기기 전 트리트먼트 초안(2026-10-02 시안 v04) — 트리트먼트(씬 스토리)는 이 채팅 턴이 아니라 고치기 요청 · 다시 쓰기 · 직접 고치기로 고친다.
 *  모델이 씬 고치기를 이야기 글 수정으로 처리하지 않게 한다. 지금 Writer 화면의 길로 말한다(리드 2026-11-14 D): 이 턴은 물음에 답하는 턴이다. */
export function treatmentDraftDirective(treatmentDraft: unknown): string | null {
  if (treatmentDraft !== true) return null
  return [
    '[Treatment Draft]',
    'Writer has already written the prose draft (the scene story) from the story the user gave on the Producer start screen. It is shown on the Writer screen.',
    'This chat turn is for answering questions. You cannot edit the prose from here, so do not change the story text. Answer the question in a few sentences and do not emit extractedSettings or choices.',
    'If the user wants scenes, events, sentences, the flow or the ending changed, tell them to type what to change in this chat (the app turns it into a proposal they apply or discard),',
    'to press Rewrite it for three versions, or to edit it themselves with Edit it myself (Edit manually in older projects).',
    'When the user is happy with the prose, they press Run breakdown on the Writer screen and confirm it. Then the prose is locked and Artist opens.',
  ].join('\n')
}

/** 붙은 문단 한 개의 글이 프롬프트를 부풀리지 않게 싣는 글자 수 상한. */
const ATTACHED_PARAGRAPH_MAX_CHARS = 4000

/**
 * 붙은 문단 안내문(리드 2026-11-14 B) — Writer 화면에서 문단(S2)을 붙인 채 보낸 물음. AI 는 화면의 S번호를 모르므로 이름과 그 문단 글을 함께 싣는다.
 * 이 턴은 문단을 고쳐 달라는 요청이 아니라 물음이다(고치기 요청은 클라이언트가 수정안 길로 보낸다). 클라이언트가 보낸 값이라 이름 꼴과 글 길이를 확인한다.
 */
export function attachedParagraphDirective(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { label, text } = raw as { label?: unknown; text?: unknown }
  if (typeof label !== 'string' || !/^S[1-9]\d{0,3}$/.test(label)) return null
  if (typeof text !== 'string' || !text.trim()) return null
  const body = Array.from(text.trim()).slice(0, ATTACHED_PARAGRAPH_MAX_CHARS).join('')
  return [
    `[Attached Paragraph ${label}]`,
    body,
    `The user attached paragraph ${label} of the prose to this message. "This paragraph" and "${label}" mean the text above.`,
    'The message is a question about it, not a request to change the prose. Answer from that paragraph, and from the rest of the Current Story Text when the question needs it. Do not rewrite the paragraph.',
  ].join('\n')
}
