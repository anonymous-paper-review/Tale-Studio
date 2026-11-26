// 보드 [+ 씬 추가]의 장소(W6 오너 2026-11-26, 리드 승인 ⑥ · ⑦) — Artist 배경 목록에서 고르거나 "새 장소"를 적는다.
//   고른 배경이면 그 배경 id 가 씬 장소다 — 러프 · 실사가 그 배경 그림을 참고한다(채팅이 적은 장소를 배경에 잇는 W6 과 같은 규칙).
//   새 장소에 배경 이름을 그대로 적었으면 그 배경 id 로 잇는다. 목록에 없는 새 장소는 적은 이름 그대로 두고 배경 카드는 만들지 않는다(알리기만, ⑦).
//   목록이 없으면(Artist 전 · 예전 흐름) 지금처럼 글로 적는다. 약속: tests/writer/add-scene-place.test.ts
export const NEW_PLACE = '__new_place'

export interface PlaceRow {
  locationId: string
  name?: string | null
}

const placeKey = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

function knownPlace(location: string, locations: readonly PlaceRow[]): PlaceRow | undefined {
  const key = placeKey(location)
  if (!key) return undefined
  return locations.find((row) => placeKey(row.locationId) === key || (!!row.name && placeKey(row.name) === key))
}

/** 고른 칸 → 씬 장소. 배경을 골랐으면 그 id, "새 장소"(또는 목록 없음)면 적은 이름 — 배경 이름과 같으면 그 배경 id. */
export function scenePlaceOf(choice: string, newText: string, locations: readonly PlaceRow[] = []): string {
  if (choice && choice !== NEW_PLACE) return choice
  const text = newText.trim()
  return knownPlace(text, locations)?.locationId ?? text
}

/** 그 장소가 Artist 배경(id 또는 이름 — 대소문자 · 띄어쓰기 상관없이)인가. */
export function isKnownPlace(location: string, locations: readonly PlaceRow[]): boolean {
  return !!knownPlace(location, locations)
}
