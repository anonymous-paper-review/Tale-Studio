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

/** The grid default: newest live completed take with a nonblank URL. */
export function selectNewestSuccessfulTake<T extends VideoTakeSelectionRecord>(takes: readonly T[]): T | null {
  return takes.filter(hasUsableUrl).sort(compareDirectorVideoTakeOrder)[0] ?? null
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
