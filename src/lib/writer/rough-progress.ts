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
    else if (panel?.status === 'completed' && panel.url) counts.completed++
    else counts.waiting++
  }
  return counts
}
