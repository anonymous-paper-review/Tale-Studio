// 샷 상세 이미지 탭의 버전 줄(오너 2026-11-14 답 5 "다 남기되 보여주는 건 5개로 하고 오른쪽 왼쪽 버튼으로 이전껄 볼 수 있게") —
//   버전은 지우지 않고(storyboard-image-versions), 줄에는 한 번에 5개만 보인다. 쪽은 가장 새 버전부터 5개씩 끊는다(0쪽 = 가장 새 5개,
//   왼쪽 단추로 1쪽 · 2쪽 …). 맨 앞 쪽은 v1 부터 5개를 채워, 버전이 5개를 넘으면 어느 쪽이든 5개가 보인다(바로 뒤 쪽과 겹칠 수 있다).
//   처음에는 지금 그림인 버전이 든 쪽, 지금 그림이 바뀌면 그 쪽으로 간다. 화면: features/director/shot-detail/shot-image-tab.tsx
//   약속: tests/director/image-version-row.test.ts

/** 버전 줄에 한 번에 보이는 버전 수. */
export const VERSION_ROW_SIZE = 5

/** 쪽 수 — 5개 이하면 1쪽(넘기기 단추 없음). */
export function versionRowPageCount(count: number): number {
  return Math.max(1, Math.ceil(count / VERSION_ROW_SIZE))
}

function clampPage(count: number, page: number): number {
  return Math.min(Math.max(0, Math.floor(page)), versionRowPageCount(count) - 1)
}

/** 목록 자리(v1 = 0)의 버전이 든 쪽 — 겹치면 더 새 쪽. 없는 자리(지금 그림 없음)면 가장 새 쪽(0). */
export function versionRowPageOf(count: number, index: number): number {
  if (index < 0 || index >= count) return 0
  return clampPage(count, Math.floor((count - 1 - index) / VERSION_ROW_SIZE))
}

export interface VersionRowView<T> {
  /** 이 쪽에 보일 버전 — 옛 것(왼쪽) → 새 것(오른쪽). */
  shown: T[]
  /** 보이는 쪽 — 0 이 가장 새 쪽. */
  page: number
  /** 넘기기 단추를 보이는가 — 버전이 5개를 넘을 때만. */
  paged: boolean
  /** 왼쪽 단추(이전 버전)를 누를 수 있는가 — 맨 앞 쪽이면 꺼진다. */
  earlier: boolean
  /** 오른쪽 단추(다음 버전)를 누를 수 있는가 — 가장 새 쪽이면 꺼진다. */
  later: boolean
}

/** 그 쪽의 버전 줄. 없는 쪽이면 가장 가까운 쪽. */
export function versionRowView<T>(versions: readonly T[], page: number): VersionRowView<T> {
  const count = versions.length
  const at = clampPage(count, page)
  const last = versionRowPageCount(count) - 1
  const end = Math.max(count - at * VERSION_ROW_SIZE, Math.min(count, VERSION_ROW_SIZE))
  return { shown: versions.slice(Math.max(0, end - VERSION_ROW_SIZE), end), page: at, paged: last > 0, earlier: at < last, later: at > 0 }
}

/** 넘겨 본 쪽 — 그때 지금 그림이던 버전(anchor)과 함께 둔다. 버전을 눌러 고르면 고른 버전이 anchor 다(보던 쪽 그대로). */
export interface VersionRowMove {
  anchor: string | null
  page: number
}

/** 보일 쪽 — 넘겨 본 쪽은 지금 그림이 그대로일 때만 쓴다. 지금 그림이 바뀌면(새로 만든 그림 · Lumi 그림 · 올린 그림)
 *  지금 그림이 든 쪽으로 간다. 멈춘 뒤 끝난 그림은 지금 그림을 바꾸지 않아 보던 쪽 그대로다. */
export function shownVersionRowPage(versions: readonly { id: string }[], currentId: string | null, moved: VersionRowMove | null): number {
  if (moved && moved.anchor === currentId) return clampPage(versions.length, moved.page)
  return versionRowPageOf(versions.length, currentId ? versions.findIndex((version) => version.id === currentId) : -1)
}
