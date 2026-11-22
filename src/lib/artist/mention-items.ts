// Artist 채팅 @고르기 목록(D9, 오너 2026-11-22 "command + 클릭 멘션이 모든 탭에서") — 인물 · 배경 · 소품 카드의 이름.
//   카드가 아직 없는 첫 화면(글 목록, [만들기] 전)은 글 목록 줄(산문 인물 · 배경)의 이름이다.
//   이름이 목록에 있어야 입력창 @이름이 카드 멘션으로 켜진다(global-chat activeMentionRefs). 약속: tests/artist/prop-cards.test.ts
export interface ArtistMentionItem {
  id: string
  label: string
  hint: string
}

export function artistMentionItems(
  input: {
    characters: ReadonlyArray<{ characterId: string; name: string }>
    worlds: ReadonlyArray<{ locationId: string; name: string }>
    props: ReadonlyArray<{ propId: string; name: string }>
    breakdown: ReadonlyArray<{ id: string; name: string; kind: 'person' | 'background' }>
  },
  hints: { character: string; location: string; prop: string },
): ArtistMentionItem[] {
  const named = <T extends { name: string }>(list: ReadonlyArray<T>) => list.filter((item) => item.name?.trim())
  const cards = [
    ...named(input.characters).map((c) => ({ id: c.characterId, label: c.name, hint: hints.character })),
    ...named(input.worlds).map((w) => ({ id: w.locationId, label: w.name, hint: hints.location })),
    ...named(input.props).map((p) => ({ id: p.propId, label: p.name, hint: hints.prop })),
  ]
  if (cards.length > 0) return cards
  return named(input.breakdown).map((row) => ({ id: row.id, label: row.name, hint: row.kind === 'person' ? hints.character : hints.location }))
}
