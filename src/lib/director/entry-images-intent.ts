// D0 "넘어가면서 이미지 만들기"(디자이너 1110 확정 · 오너 2026-11-14 페이지 추천) — Storyboard 넘기기 창에서 고르고 [넘어가기] 를
//   누른 경우에만, Director 화면이 준비된 뒤 실사 일괄을 한 번 시작하게 하는 한 번짜리 표시. 사람이 창에서 고른 것이라
//   8/27 "들어가기만 해도 실사를 만들지 않는다"(진입 자동 채움을 지운 결정)와 다른 길이다.
//   메모리에만 둔다 — 화면을 새로 고치면 사라져 같은 일괄이 두 번 돌지 않는다. 넘김이 막혀 Director 가 안 열린 채
//   10분이 지나면 버린다(나중에 다른 길로 들어갔을 때 갑자기 만들지 않게). 약속: tests/writer/director-handover-images.test.ts
const INTENT_TTL_MS = 10 * 60_000

let pending: { projectId: string; at: number } | null = null

export function requestImagesOnDirectorEntry(projectId: string, now = Date.now()): void {
  pending = { projectId, at: now }
}

/** Director 가 열렸을 때 한 번 묻는다 — 그 프로젝트에서 고른 표시가 살아 있으면 true. 묻고 나면 지운다. */
export function takeImagesOnDirectorEntry(projectId: string, now = Date.now()): boolean {
  const hit = !!pending && pending.projectId === projectId && now - pending.at <= INTENT_TTL_MS
  pending = null
  return hit
}

export function clearImagesOnDirectorEntry(): void {
  pending = null
}
