/** Client-safe structural shape shared by Director video-take consumers. */
export interface VideoTakeSelectionRecord {
  id?: unknown
  url?: unknown
  status?: unknown
  is_final?: unknown
  take_number?: unknown
  created_at?: unknown
  last_attempt_at?: unknown
  deleted_at?: unknown
  /** 화면에서 멈춘 Take(오너 2026-11-14 7번) — 뒤늦게 끝나도 ★ 로 고르지 않은 한 저절로 고르지 않는다. */
  cancelled_at?: unknown
}

function isLive(take: VideoTakeSelectionRecord): boolean {
  return take.deleted_at == null
}

function hasUsableUrl(take: VideoTakeSelectionRecord): boolean {
  return (
    isLive(take) &&
    take.status === 'completed' &&
    typeof take.url === 'string' &&
    take.url.trim().length > 0
  )
}

function numericTake(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && value.trim().length === 0)) return null
  const take = Number(value)
  return Number.isFinite(take) ? take : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function compareDescending(a: string, b: string): number {
  if (a === b) return 0
  return a > b ? -1 : 1
}

/** Descending total Director take order: take number, creation time, then id. */
export function compareDirectorVideoTakeOrder(a: VideoTakeSelectionRecord, b: VideoTakeSelectionRecord): number {
  const aTake = numericTake(a.take_number)
  const bTake = numericTake(b.take_number)
  if (aTake !== bTake) {
    if (aTake === null) return 1
    if (bTake === null) return -1
    return aTake > bTake ? -1 : 1
  }

  const byCreatedAt = compareDescending(stringValue(a.created_at), stringValue(b.created_at))
  if (byCreatedAt !== 0) return byCreatedAt

  return compareDescending(stringValue(a.id), stringValue(b.id))
}

/** The grid default: newest live completed take with a nonblank URL. 화면에서 멈춘 Take 는 기록에만 있다(저절로 고르지 않는다). */
export function selectNewestSuccessfulTake<T extends VideoTakeSelectionRecord>(takes: readonly T[]): T | null {
  return takes.filter((take) => hasUsableUrl(take) && take.cancelled_at == null).sort(compareDirectorVideoTakeOrder)[0] ?? null
}

/** Export/handoff default: usable Final first, otherwise the grid default. */
export function selectHandoffTake<T extends VideoTakeSelectionRecord>(takes: readonly T[]): T | null {
  return (
    takes.filter(take => hasUsableUrl(take) && take.is_final === true).sort(compareDirectorVideoTakeOrder)[0] ??
    selectNewestSuccessfulTake(takes)
  )
}

/** Latest live attempt, ordered by attempt time and then the standard take ordering. */
export function selectLatestAttempt<T extends VideoTakeSelectionRecord>(takes: readonly T[]): T | null {
  return takes.filter(isLive).sort((a, b) => {
    const byAttempt = compareDescending(stringValue(a.last_attempt_at), stringValue(b.last_attempt_at))
    return byAttempt || compareDirectorVideoTakeOrder(a, b)
  })[0] ?? null
}

/** 화면에서 멈췄고 ★ 로 고르지 않은 Take(오너 2026-11-14 7번) — 뒤에서 끝나도 영상 · 실패가 아니고 기록에만 있다. */
export function isStoppedTake(take: VideoTakeSelectionRecord): boolean {
  return take.cancelled_at != null && take.is_final !== true
}

function timeOf(value: unknown): number {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY
}

/** 샷 상태 · 넘기기 창이 보는 가장 새 시도(리드 2026-11-14 규칙) — 멈춘 Take 의 시각은 멈춘 때다: 뒤에서 늦게 실패 · 완성해도
 *  그 뒤에 시작한 시도보다 새것이 되지 않는다. 고른 것이 멈춘 Take 면(isStoppedTake) 그 샷은 실패도 만드는 중도 아니다. */
export function selectLatestShotAttempt<T extends VideoTakeSelectionRecord>(takes: readonly T[]): T | null {
  const at = (take: T) => timeOf(isStoppedTake(take) ? take.cancelled_at : take.last_attempt_at)
  return takes.filter(isLive).sort((a, b) => at(b) - at(a) || compareDirectorVideoTakeOrder(a, b))[0] ?? null
}
