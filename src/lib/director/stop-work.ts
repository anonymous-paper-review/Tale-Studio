// 화면에서 멈추기(오너 2026-11-14 7번 · 시안 D3 · D4) — [모두 멈추기]가 멈출 작업 · 멈춘 묶음이 아직 도는가 · 멈춘 뒤 알림. 순수 함수만 둔다.
//   이미 보낸 작업은 fal 에서 끝까지 돌고 Take 는 돌려주지 않는다. 뒤늦게 끝나면 기록(이미지 버전 · Take 목록)에만 남는다(서버 · 기록은 prose).
//   약속: tests/director/stop-all.test.ts
import type { ActiveJob } from '@/lib/generation-queue'
import type { GenerationJobKind } from '@/lib/generation-jobs'

/** 화면에서 멈출 수 있는 작업 — 서버 멈춤(cancel_director_jobs)이 받는 셋. */
export const STOPPABLE_JOB_KINDS: readonly GenerationJobKind[] = ['shot_storyboard', 'storyboard_real_grid', 'shot_video']

/** 아직 멈추지 않은 Director 이미지 · 영상 작업. */
export function stoppableJobs<T extends Pick<ActiveJob, 'kind' | 'cancelledAt'>>(jobs: readonly T[]): T[] {
  return jobs.filter((job) => STOPPABLE_JOB_KINDS.includes(job.kind) && !job.cancelledAt)
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
