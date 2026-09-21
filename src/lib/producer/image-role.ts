// 그림 역할(#image-to-artist 2026-09-17) — Producer 채팅에 올린 그림을 어떻게 쓸지: 인물 카드 · 배경 카드 · 참고 자료.
//   종전엔 그림이 곧장 채팅 모델로 가서 이야기 시드로 각색됐다. 이제 쓰임새를 먼저 정한다 — 사용자의 말이 분명하면
//   그대로, 아니면 선택지로 묻는다. 여기는 말을 읽는 순수 함수만 둔다(스토어·화면은 이 결과만 믿는다).

export type ImageRole = 'character' | 'background' | 'reference'

// 낱말 목록 — 참고 자료를 먼저 본다: "이 인물 그림은 참고로만" 은 참고다.
const REFERENCE_RE = /참고|레퍼런스|화풍|그림체|스타일|분위기|느낌|reference|style|mood|vibe|inspiration/i // i18n-ok: 역할 낱말 규칙 자체
const CHARACTER_RE = /인물|캐릭터|주인공|등장인물|사람|character|protagonist|person|hero/i // i18n-ok: 역할 낱말 규칙 자체
const BACKGROUND_RE = /배경|장소|공간|풍경|무대|background|location|place|scenery|setting/i // i18n-ok: 역할 낱말 규칙 자체

const SHORT_TEXT_MAX = 40

/**
 * 사용자가 그림과 함께 쓴 말에서 역할을 읽는다. 짧고(40자 이하) 한 역할만 담겼을 때만 답한다 —
 * "이 사진 속 인물이 배경 앞에 서 있는 장면으로 이야기를 만들어 줘" 같은 긴 요청은 묻는 쪽이 맞다.
 */
export function matchImageRoleInText(text: string): ImageRole | null {
  const t = (text ?? '').trim()
  if (!t || t.length > SHORT_TEXT_MAX) return null
  const hits: ImageRole[] = []
  if (REFERENCE_RE.test(t)) hits.push('reference')
  if (CHARACTER_RE.test(t)) hits.push('character')
  if (BACKGROUND_RE.test(t)) hits.push('background')
  return hits.length === 1 ? hits[0] : null
}

/** 선택지 답(버튼 문구·직접 입력)을 역할로 읽는다. 참고 → 인물 → 배경 순으로 본다. */
export function matchImageRoleAnswer(text: string): ImageRole | null {
  const t = (text ?? '').trim()
  if (!t) return null
  if (REFERENCE_RE.test(t)) return 'reference'
  if (CHARACTER_RE.test(t)) return 'character'
  if (BACKGROUND_RE.test(t)) return 'background'
  return null
}

/** 카드 채우기 턴의 대상(#image-to-artist) — 숨은 요청이 어느 카드를 채우는지. */
export interface CardFill {
  kind: 'character' | 'background'
  ref: string
}

interface ExtractedLike {
  characters?: Array<object>
  backgrounds?: Array<object>
}

/**
 * 카드 채우기 턴의 모델 제안을 그 카드 하나로 좁힌다 — 줄거리·설정·다른 카드 제안은 버리고, 첫 항목을 그 카드(ref)에 붙인다.
 * 모델은 제안만 하고 제품 층이 화이트리스트로 적용한다(architecture.md).
 */
export function coerceCardFill<T extends ExtractedLike>(extracted: T | null | undefined, fill: CardFill): Partial<T> {
  if (!extracted) return {}
  const list = fill.kind === 'character' ? extracted.characters : extracted.backgrounds
  const first = Array.isArray(list) ? list.find((e) => e && typeof e === 'object') : undefined
  if (!first) return {}
  const entry: Record<string, unknown> = { ...(first as Record<string, unknown>), ref: fill.ref }
  delete entry.remove
  return (fill.kind === 'character' ? { characters: [entry] } : { backgrounds: [entry] }) as unknown as Partial<T>
}
