import type { RoughStoryboardImage, Shot } from '@/types'

export interface RoughProgress {
  total: number
  completed: number
  generating: number
  waiting: number
  failed: number
}

/** 보드에 있는 샷을 한 번씩 센다. 진행 큐는 이전 완료 이미지·실패보다 현재 시도를 우선한다. */
export function summarizeRoughProgress(
  shots: ReadonlyArray<Pick<Shot, 'shotId' | 'roughStoryboard'>>,
  overrides: Readonly<Record<string, RoughStoryboardImage>>,
  localJobs: Readonly<Record<string, { status: 'generating' | 'failed' }>>,
  queuedShotIds: ReadonlySet<string>,
): RoughProgress {
  const counts: RoughProgress = { total: 0, completed: 0, generating: 0, waiting: 0, failed: 0 }
  const seen = new Set<string>()
  for (const shot of shots) {
    if (seen.has(shot.shotId)) continue
    seen.add(shot.shotId)
    counts.total++
    const panel = overrides[shot.shotId] ?? shot.roughStoryboard
    const local = localJobs[shot.shotId]
    if (queuedShotIds.has(shot.shotId) || local?.status === 'generating') counts.generating++
    else if (local?.status === 'failed' || panel?.status === 'failed') counts.failed++
    else if (isRoughDrawn(panel)) counts.completed++
    else counts.waiting++
  }
  return counts
}

/** 다 그린 러프인가 — 완료 상태이고 그림 주소가 있다(보드 진행 요약 · Storyboard 넘김 창이 같은 기준을 쓴다). */
export function isRoughDrawn(panel: Pick<RoughStoryboardImage, 'status' | 'url'> | null | undefined): boolean {
  return panel?.status === 'completed' && !!panel.url
}

/** [남은 컷 (다시) 그리기]가 보낼 샷 — 다 그리지 않았고, 그리는 중이 아니고, 그릴 스토리(액션)가 있는 샷. 보드 순서를 지킨다. */
export function undrawnRoughShotIds(
  shots: ReadonlyArray<Pick<Shot, 'shotId' | 'roughStoryboard' | 'actionDescription'>>,
  overrides: Readonly<Record<string, RoughStoryboardImage>>,
  localJobs: Readonly<Record<string, { status: 'generating' | 'failed' }>>,
  queuedShotIds: ReadonlySet<string>,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const shot of shots) {
    if (seen.has(shot.shotId)) continue
    seen.add(shot.shotId)
    const local = localJobs[shot.shotId]
    if (queuedShotIds.has(shot.shotId) || local?.status === 'generating') continue
    // 진행 요약처럼 방금 실패한 다시 그리기는 예전 그림이 남아 있어도 실패로 본다.
    if (local?.status !== 'failed' && isRoughDrawn(overrides[shot.shotId] ?? shot.roughStoryboard)) continue
    if (!shot.actionDescription?.trim()) continue
    out.push(shot.shotId)
  }
  return out
}

/** 서버 그리드 한 장이 그리는 샷 수(rough-storyboard-grid.ts GRID_MAX_SHOTS) — 그리드는 씬을 넘지 않는다. */
const ROUGH_REDRAW_BATCH = 4

/** 남은 컷을 보낼 묶음 — 이어지는 같은 씬의 샷을 넉 장까지 한 묶음으로. 서버가 한 요청에서 다 그리는 크기라 고른 컷이 빠지지 않는다. */
export function roughRedrawBatches(entries: ReadonlyArray<{ shotId: string; sceneId: string }>): string[][] {
  const batches: Array<{ sceneId: string; ids: string[] }> = []
  for (const entry of entries) {
    const last = batches[batches.length - 1]
    if (last && last.sceneId === entry.sceneId && last.ids.length < ROUGH_REDRAW_BATCH) last.ids.push(entry.shotId)
    else batches.push({ sceneId: entry.sceneId, ids: [entry.shotId] })
  }
  return batches.map((batch) => batch.ids)
}
