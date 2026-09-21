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
    'Answer the user in the response language, and never claim you rewrote or tidied the story.',
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
