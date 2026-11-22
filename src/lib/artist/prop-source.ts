// 소품을 만드는 출처(D7 결정 1 — 리드 2026-11-22 "오너 답을 기다리는 동안 출처만 갈아 끼울 수 있게").
//   카드(화면) · 서버 첫 그림 · 그리기 창구 · 실사 참고(2단계)는 props 행과 샷 소품 칸(static_spec.prop_placement 의 id 또는 이름)만 읽고
//   출처를 모른다. 출처가 바뀌면 바뀌는 것은 둘뿐이다: ① props 행을 넣는 자리 ② 소품 묶음이 비었을 때 안내 한 줄(PROP_EMPTY_LINE).
//   - producer_cards(지금, 리드 결정 1): Producer 사물 카드 → 넘길 때(writer/start) · 디자인 저장(v2 persist · persist_manifest)이 행을 넣는다.
//     Writer 단계에는 사물 캐스트로 들어가 샷 소품 칸이 그 id 를 쓴다(2026-11-22 실측 8/8).
//   - story_pick(안 B): [만들기] 뒤 v2Design 앞에서 AI 가 이야기에서 3~5개를 골라 같은 사물 캐스트 길로 넣는다 — 그 뒤는 지금 코드 그대로.
//   - repeated_in_shots(안 A): 샷이 다 나온 뒤(persistShots 뒤) 샷 소품 칸에서 두 샷 이상 나오는 물건을 행으로 — 생김새 글이 없어 이름으로만 그린다.
//   DB 출처 칸은 producer · writer · user 만 받는다 — A · B 는 Writer 가 만든 것이라 writer(마이그레이션 없음).
//   약속: tests/artist/prop-source.test.ts
export type PropSourceId = 'producer_cards' | 'repeated_in_shots' | 'story_pick'

/** 지금 쓰는 출처 — 출처를 바꾸면 이 줄과 그 출처가 행을 넣는 자리, 아래 안내 한 줄만 바꾼다. */
export const ACTIVE_PROP_SOURCE: PropSourceId = 'producer_cards'

/** 출처마다 props.origin 에 적는 값(DB 가 받는 값 안에서). */
export const PROP_SOURCE_ORIGIN: Record<PropSourceId, 'producer' | 'writer'> = {
  producer_cards: 'producer',
  repeated_in_shots: 'writer',
  story_pick: 'writer',
}

/** 소품 묶음이 비었을 때 한 줄(영어 원문 = 사전 키). 아직 쓰지 않은 출처는 null — 그 출처로 바꿀 때 문장과 사전 줄을 함께 넣는다. */
export const PROP_EMPTY_LINE: Record<PropSourceId, string | null> = {
  producer_cards: 'No props yet. Objects you set in Producer become props.',
  repeated_in_shots: null,
  story_pick: null,
}

/** 지금 출처의 "소품이 없을 때" 한 줄. */
export function propEmptyLine(source: PropSourceId = ACTIVE_PROP_SOURCE): string {
  return PROP_EMPTY_LINE[source] ?? (PROP_EMPTY_LINE.producer_cards as string)
}
