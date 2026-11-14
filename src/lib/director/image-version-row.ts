// 샷 상세 이미지 탭의 버전 줄(오너 2026-11-14 답 5 "다 남기되 보여주는 건 5개로 하고 오른쪽 왼쪽 버튼으로 이전껄 볼 수 있게") —
//   버전은 지우지 않고(storyboard-image-versions), 줄에는 한 번에 5개만 보인다. 보이는 5개(창)는 맨 오른쪽 버전 id 로 기억한다 —
//   멈춘 뒤 끝난 그림이 뒤에 붙어도 보던 칸이 밀리지 않고, 붙은 버전은 › 로 본다(리드 검토 11/14, 예전엔 가장 새 것부터 센 쪽 번호라 밀렸다).
//   창은 처음 열 때와 지금 그림이 바뀔 때만 다시 잡는다: 가장 새 것부터 5개씩 끊은 칸 중 지금 그림이 든 칸(맨 앞 칸은 v1 부터 5개),
//   지금 그림이 없으면 가장 새 5개. ‹ · › 는 보이는 5개 바로 앞 · 바로 뒤 5개, v1 이나 가장 새 것에 닿으면 끝에서 5개를 채운다(겹칠 수 있다).
//   화면: features/director/shot-detail/shot-image-tab.tsx · 약속: tests/director/image-version-row.test.ts

/** 버전 줄에 한 번에 보이는 버전 수. */
export const VERSION_ROW_SIZE = 5

/** 줄이 기억하는 창 — anchor = 창을 잡을 때의 지금 그림(버전 id, 없으면 null), endId = 보이는 5개 중 맨 오른쪽 버전 id. */
export interface VersionRowWindow {
  anchor: string | null
  endId: string | null
}

export interface VersionRowView<T> {
  /** 보일 버전 — 옛 것(왼쪽) → 새 것(오른쪽). */
  shown: T[]
  /** 보이는 5개 중 맨 오른쪽 버전 id — 단추 · 고르기가 다음 창을 이 값으로 기억한다. */
  endId: string | null
  /** 넘기기 단추를 보이는가 — 버전이 5개를 넘을 때만. */
  paged: boolean
  /** 왼쪽 단추(이전 버전)를 누를 수 있는가 — v1 이 보이면 꺼진다. */
  earlier: boolean
  /** 오른쪽 단추(다음 버전)를 누를 수 있는가 — 가장 새 버전이 보이면 꺼진다. */
  later: boolean
}

/** 창의 끝 자리(v1 부터 센 개수) — 5개를 채울 수 있으면 채우고, 버전 수를 넘지 않는다. */
function clampEnd(count: number, end: number): number {
  return Math.min(count, Math.max(end, Math.min(count, VERSION_ROW_SIZE)))
}

/** endId 의 끝 자리 — 모르는 id 면 가장 새 쪽. */
function endOf(versions: readonly { id: string }[], endId: string | null): number {
  const at = endId ? versions.findIndex((version) => version.id === endId) : -1
  return clampEnd(versions.length, at < 0 ? versions.length : at + 1)
}

const idAt = (versions: readonly { id: string }[], end: number): string | null => (end > 0 ? versions[end - 1]!.id : null)

/** 지금 보일 창 — 기억한 창은 지금 그림이 그대로인 동안만 쓴다(saved 가 null 이면 처음 열 때). 지금 그림이 바뀌었으면
 *  (새로 만든 그림 · Lumi 그림 · 올린 그림) 지금 그림이 든 칸으로 다시 잡는다. 멈춘 뒤 끝난 그림은 지금 그림을 바꾸지 않아 창 그대로다. */
export function versionRowWindow(versions: readonly { id: string }[], currentId: string | null, saved: VersionRowWindow | null): VersionRowWindow {
  if (saved && saved.anchor === currentId && (saved.endId === null ? versions.length === 0 : versions.some((version) => version.id === saved.endId))) return saved
  const count = versions.length
  const at = currentId ? versions.findIndex((version) => version.id === currentId) : -1
  const page = at < 0 ? 0 : Math.floor((count - 1 - at) / VERSION_ROW_SIZE)
  return { anchor: currentId, endId: idAt(versions, clampEnd(count, count - page * VERSION_ROW_SIZE)) }
}

/** 그 창의 버전 줄. */
export function versionRowView<T extends { id: string }>(versions: readonly T[], endId: string | null): VersionRowView<T> {
  const end = endOf(versions, endId)
  const start = Math.max(0, end - VERSION_ROW_SIZE)
  return { shown: versions.slice(start, end), endId: idAt(versions, end), paged: versions.length > VERSION_ROW_SIZE, earlier: start > 0, later: end < versions.length }
}

/** ‹(step -1) · ›(step 1) 뒤의 창 끝 — 보이는 5개 바로 앞 · 바로 뒤 5개. 끝에 닿으면 끝에서 5개(겹칠 수 있고, 돌지 않는다). */
export function versionRowStep(versions: readonly { id: string }[], endId: string | null, step: 1 | -1): string | null {
  return idAt(versions, clampEnd(versions.length, endOf(versions, endId) + step * VERSION_ROW_SIZE))
}
