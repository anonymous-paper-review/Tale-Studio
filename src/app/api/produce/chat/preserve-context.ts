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
  const { kind, ref } = cardFill as { kind?: unknown; ref?: unknown }
  if ((kind !== 'character' && kind !== 'background') || typeof ref !== 'string' || !ref) return null
  const target = kind === 'character' ? `the cast card with ref "${ref}"` : `the background card with ref "${ref}"`
  const fields =
    kind === 'character'
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
 * 잠긴 Producer 안내문(2026-10-01 오너 "producer 완성 시 잠그기", "잠금을 풀 수 없게") — Writer 로 넘긴 프로젝트의 채팅 턴.
 * 모델은 질문에는 답하되 이야기·설정·인물·배경·화풍을 바꾸자고 제안하지 않는다. 최종 방어는 클라이언트
 * (producer-store 가드 + 바꾸는 제안이면 모델 답 대신 "바꾸지 않았다"를 남긴다).
 */
export function lockedProducerDirective(producerLocked: unknown): string | null {
  if (producerLocked !== true) return null
  return [
    '[Locked Producer]',
    'This project was handed over to Writer, so the Producer materials (story, settings, cast cards, background cards, art style) are confirmed and cannot change.',
    'Answer questions about them, summarize or explain them, but do not emit extractedSettings, choices or proposals that change them.',
    'If the user asks for a change, say plainly that Producer is confirmed and cannot be changed, that a new project is needed to change it,',
    'and that scenes and dialogue can still be edited in Writer and character and background pictures in Artist.',
  ].join('\n')
}

/** 넘기기 전 트리트먼트 초안(2026-10-02 시안 v04) — 트리트먼트(씬 스토리)는 채팅이 아니라 다시 쓰기 · 직접 고치기로 고친다.
 *  채팅은 Producer 상담(설정 · 캐스팅 · 배경 · 스타일)으로 남는다. 모델이 씬 고치기를 이야기 글 수정으로 처리하지 않게 한다. */
export function treatmentDraftDirective(treatmentDraft: unknown): string | null {
  if (treatmentDraft !== true) return null
  return [
    '[Treatment Draft]',
    'Writer has already written a treatment (the scene story) from this story. It is shown on the Producer screen below the cast and backgrounds.',
    'You cannot edit the treatment from this chat. If the user asks to change scenes, events, sentences, the flow or the ending,',
    'tell them to press Rewrite above the scene story (it offers three versions, or they can type their own request there) or Edit manually,',
    'and do not change the story text to make those changes.',
    'Settings, cast cards, background cards and the art style can still be changed here as usual.',
    'When the user is happy with the treatment, they press Hand over to Writer at the top right.',
  ].join('\n')
}
