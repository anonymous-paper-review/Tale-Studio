// 화면에서 멈추기(오너 2026-11-14 7번 · 시안 D3 · D4) — [모두 멈추기] · 카드 · 노드 [멈추기]가 멈출 작업 · 멈춘 묶음이 아직 도는가 · 멈춘 뒤 알림.
//   순수 함수만 둔다. 이미 보낸 작업은 fal 에서 끝까지 돌고 Take 는 돌려주지 않는다. 뒤늦게 끝나면 기록(이미지 버전 · Take 목록)에만
//   남는다(서버 · 기록은 prose). 약속: tests/director/stop-all.test.ts · stop-each.test.ts
import type { ActiveJob } from '@/lib/generation-queue'
import type { GenerationJobKind } from '@/lib/generation-jobs'

/** 화면에서 멈출 수 있는 작업 — 서버 멈춤(cancel_director_jobs)이 받는 셋. */
export const STOPPABLE_JOB_KINDS: readonly GenerationJobKind[] = ['shot_storyboard', 'storyboard_real_grid', 'shot_video']

/** 아직 멈추지 않은 Director 이미지 · 영상 작업. */
export function stoppableJobs<T extends Pick<ActiveJob, 'kind' | 'cancelledAt'>>(jobs: readonly T[]): T[] {
  return jobs.filter((job) => STOPPABLE_JOB_KINDS.includes(job.kind) && !job.cancelledAt)
}

/** 이 작업을 지금 화면에서 멈출 수 있는가 — 지금 도는 작업 목록에 있는(서버가 준 진짜 id) 아직 멈추지 않은 작업일 때만.
 *  요청이 오가는 동안 Take 에 든 것은 화면이 만든 요청 키라 목록에 없다 — 그때는 [멈추기]를 보이지 않는다(검토 a). */
export function isStoppableJob(jobId: string | null | undefined, jobs: readonly Pick<ActiveJob, 'id' | 'kind' | 'cancelledAt'>[]): boolean {
  return !!jobId && stoppableJobs(jobs).some((job) => job.id === jobId)
}

/** 영상 묶음이 아직 도는가 — 멈춘 묶음은 화면에서 멈추지 않은 작업이 남았을 때만 돈다(멈추면 바로 다시 만들 수 있다). */
export function videoBatchLive(
  batch: { busy: boolean; cancelled: boolean; jobIds: readonly string[] },
  jobs: readonly Pick<ActiveJob, 'id' | 'cancelledAt'>[],
): boolean {
  if (!batch.busy) return false
  if (!batch.cancelled) return true
  const live = new Set(jobs.flatMap((job) => (job.cancelledAt ? [] : [job.id])))
  return batch.jobIds.some((id) => live.has(id))
}

/** 멈춘 뒤 알림(영어 키) — 만들던 영상이 있었으면 Take 를 돌려드리지 않는다는 것까지. 이미지는 Take 를 쓰지 않는다. */
export function stopNotice(stopped: { images: number; videos: number }): string {
  if (stopped.videos > 0) return 'Stopped. Takes for the videos being made are not refunded. If they finish later, they stay in the history.'
  if (stopped.images > 0) return 'Stopped. If the images being made finish later, they stay in the versions.'
  return 'Stopped.'
}

/** 카드 · 노드 [멈추기]가 멈출 것 — 그 샷을 만드는 작업들과, 그 작업이 함께 그리는 샷 수(4샷 한 장이면 4). */
export interface ShotStopTarget {
  jobIds: string[]
  sheetShots: number
}

const SHOT_JOB_KINDS: Record<'image' | 'video', readonly GenerationJobKind[]> = {
  image: ['shot_storyboard', 'storyboard_real_grid'],
  video: ['shot_video'],
}

function jobShotIds(target: ActiveJob['target']): string[] {
  const out = new Set<string>(target?.writerShotIds ?? [])
  if (target?.writerShotId) out.add(target.writerShotId)
  if (target?.shotId) out.add(target.shotId)
  return [...out]
}

/** 그 샷이 지금 만드는 이미지나 영상(보낸 작업, 아직 멈추지 않은 것). 없으면 null — 차례를 기다리는 샷은 멈출 작업이 없다. */
export function shotStopTarget(
  jobs: readonly Pick<ActiveJob, 'id' | 'kind' | 'target' | 'cancelledAt'>[],
  writerShotId: string,
  kind: 'image' | 'video',
): ShotStopTarget | null {
  const mine = jobs.filter((job) => SHOT_JOB_KINDS[kind].includes(job.kind) && !job.cancelledAt && jobShotIds(job.target).includes(writerShotId))
  if (mine.length === 0) return null
  return { jobIds: mine.map((job) => job.id), sheetShots: new Set(mine.flatMap((job) => jobShotIds(job.target))).size }
}

/** 카드 · 노드 [멈추기] — 멈추고 알릴 말(영어 키)을 돌려준다. 이미지는 4샷 한 장 단위라 같은 장 샷 수를 말한다. */
export async function stopShotWork(
  cancel: (jobIds: string[]) => Promise<string[]>,
  target: ShotStopTarget,
  kind: 'image' | 'video',
): Promise<{ ok: boolean; text: string; params?: Record<string, number> }> {
  try {
    const stopped = await cancel(target.jobIds)
    if (stopped.length === 0) return { ok: true, text: 'It was already done.' }
    if (kind === 'video') return { ok: true, text: stopNotice({ images: 0, videos: stopped.length }) }
    if (target.sheetShots > 1) {
      return { ok: true, text: 'Stopped {count} shots on the same sheet. If the images finish later, they stay in the versions.', params: { count: target.sheetShots } }
    }
    return { ok: true, text: stopNotice({ images: stopped.length, videos: 0 }) }
  } catch {
    return { ok: false, text: 'Could not stop it. Try again.' }
  }
}
