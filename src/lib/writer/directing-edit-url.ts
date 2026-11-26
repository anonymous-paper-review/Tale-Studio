// 화살표 편집기(층 나누기 · 저장 · 줄 읽기 · 끝 장 다시 그리기 · 고친 줄 남기기)가 요청을 보낼 곳 — 순수.
//   콘티 목각 러프는 지금 주소, 실사 시트 가운데 장(오너 2026-11-27 N4b)은 실사 주소. 두 곳은 같은 동작 이름을 받는다.
//   편집기(directing-arrow-editor)와 물음 창(unsaved-arrows-confirm)이 같이 쓴다. 약속: tests/writer/real-arrow-editor.test.ts
/** 편집기가 고치는 그림 — 'rough' = 콘티 목각 러프(기본) · 'real' = 실사 시트의 가운데 장. */
export type DirectingSurface = 'rough' | 'real'

/** 요청을 보낼 곳 — 콘티는 지금 주소, 실사는 실사 주소. */
export function directingEditUrl(surface: DirectingSurface = 'rough'): string {
  return surface === 'real' ? '/api/storyboard/real-directing-edit' : '/api/writer/rough-directing-edit'
}
