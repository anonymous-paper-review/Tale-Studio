// Editor 를 열 때 자리가 저절로 바뀌었는지(영상 없는 샷이 빠지거나 샷이 새로 들어옴) 보고, 한 번 띄울 알림의 글을 고른다.
//   V1 컷뿐 아니라 그 위 클립(V2 · V3) · 마커 · 사람이 놓은 소리 중 하나라도 옮겨졌으면 알린다(검토 · 리드 규칙 11/14).
//   약속: tests/editor/auto-move-notice.test.ts · tests/editor/shots-with-video.test.ts

/** 열기 전(사람이 보던 자리) · 뒤의 자리 — 모두 시작 초. */
export interface PlacedSnapshot {
  /** V1 컷 — 샷 id 별. */
  cuts: ReadonlyMap<string, number>
  /** V1 밖 줄(V2 · V3 …)의 클립 — 샷 id 별. */
  upper: ReadonlyMap<string, number>
  markers: readonly number[]
  /** 사람이 놓은 소리(영상에 이어지지 않은 조각) — 조각 id 별. */
  sounds: ReadonlyMap<string, number>
}

export interface AutoMoveNotice {
  key: string
  params: Record<string, number>
}

const SAME = 0.0005

/** 두 쪽에 다 있는 것 가운데 하나라도 자리가 바뀌었나. */
function shifted(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>): boolean {
  for (const [id, sec] of before) {
    const now = after.get(id)
    if (now !== undefined && Math.abs(now - sec) > SAME) return true
  }
  return false
}

/**
 * 열 때 한 번 띄울 알림 — 자리가 하나도 바뀌지 않았으면 null. removed = 영상이 없어져 빠진 샷 수, added = 새로 들어온 샷 수.
 *   빠진 쪽만 있으면 예전 저장본(빈 곳 없이 당겨지는 저장본)이라 위 줄 · 마커가 없어 글이 "뒤 컷과 소리"다.
 */
export function autoMoveNotice(
  before: PlacedSnapshot,
  after: PlacedSnapshot,
  { removed, added }: { removed: number; added: number },
): AutoMoveNotice | null {
  const markersMoved =
    before.markers.length !== after.markers.length || before.markers.some((sec, i) => Math.abs(sec - after.markers[i]) > SAME)
  const moved = shifted(before.cuts, after.cuts) || shifted(before.upper, after.upper) || markersMoved || shifted(before.sounds, after.sounds)
  if (!moved || (removed === 0 && added === 0)) return null
  if (removed > 0 && added > 0) {
    return {
      key: 'Shots without video ({removed}) were taken out and new shots ({added}) came in, so the cuts after them and the clips, sounds and markers above them moved.',
      params: { removed, added },
    }
  }
  if (removed > 0) return { key: 'Shots without video ({count}) were taken out, so the cuts and sounds after them moved.', params: { count: removed } }
  return { key: 'New shots ({count}) came in, so the cuts after them and the clips, sounds and markers above them moved.', params: { count: added } }
}
