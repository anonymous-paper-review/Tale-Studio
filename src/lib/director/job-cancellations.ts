// 화면에서 멈춘 생성 작업(서버 전용, 디자이너 11/13 · 오너 2026-11-14 7번 · 리드 C) — fal 에는 취소가 없어 작업은 끝까지 돈다.
//   멈춤은 새 표(director_job_cancellations)에만 적는다: 같은 샷 하나만 검사 · 영상 투영(DB 함수)과 넘기기 고르기 · 늦은 이미지(아래)가 이 표를 보고 뺀다.
//   Take 는 돌려주지 않고(7번), 동시 생성 자리도 끝날 때까지 그대로다(리드 c). 약속: tests/director/job-cancel.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import { cancelVideoBatch, getVideoBatchSummary } from '@/lib/director/batch-store'

export interface CancelledJob {
  jobId: string
  kind: string
  writerShotIds: string[]
  videoClipId: string | null
  cancelledAt: string
}

/** 그 프로젝트의 도는(queued) 이미지 · 영상 작업을 멈춘 것으로 적는다. 이미 멈춘 것도 그대로 돌려준다. */
export async function cancelDirectorJobs(projectId: string, jobIds: string[], userId: string): Promise<CancelledJob[]> {
  const { data, error } = await supabaseAdmin.rpc('cancel_director_jobs', { p_project_id: projectId, p_job_ids: jobIds, p_user_id: userId })
  if (error) throw error
  return ((data ?? []) as Array<{ job_id: string; kind: string; writer_shot_ids: string[] | null; video_clip_id: string | null; cancelled_at: string }>).map((row) => ({
    jobId: row.job_id,
    kind: row.kind,
    writerShotIds: row.writer_shot_ids ?? [],
    videoClipId: row.video_clip_id,
    cancelledAt: row.cancelled_at,
  }))
}

/** 이 작업을 화면에서 멈췄나 — 뒤늦게 끝난 결과를 기록에만 넣을지 정한다. 읽지 못하면 멈추지 않은 것으로 본다(종전 동작). */
export async function isJobCancelled(jobId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.from('director_job_cancellations').select('job_id').eq('job_id', jobId).maybeSingle()
    if (error) return false
    return (data as { job_id?: unknown } | null)?.job_id === jobId
  } catch {
    return false
  }
}

/** 작업 id 중 화면에서 멈춘 것과 그때 — 읽지 못하면 빈 표(종전 동작). */
export async function cancelledJobsById(jobIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(jobIds.filter(Boolean))]
  if (!ids.length) return new Map()
  try {
    const { data, error } = await supabaseAdmin.from('director_job_cancellations').select('job_id, cancelled_at').in('job_id', ids)
    if (error) return new Map()
    return new Map(((data ?? []) as Array<{ job_id: string; cancelled_at: string }>).map((row) => [row.job_id, row.cancelled_at]))
  } catch {
    return new Map()
  }
}

/**
 * 카드 [멈추기]로 영상 묶음에 남은 마지막 영상을 멈췄으면(아직 보내지 않은 샷도 없으면) 그 묶음을 [모두 멈추기]와 같은 길로 닫는다
 * (오너 7번 · 리드 11/14) — 멈춘 영상이 생성처에서 끝날 때까지 묶음이 돌면 그동안 그 샷을 다시 만들 수 없다.
 * 보낼 샷이나 멈추지 않은 도는 영상이 남은 묶음은 그대로 이어진다. 돌려주는 값: 닫은 묶음 id.
 */
export async function closeVideoBatchesLeftStopped(projectId: string, userId: string, jobIds: string[]): Promise<string[]> {
  const ids = [...new Set(jobIds.filter(Boolean))]
  if (!ids.length) return []
  const { data, error } = await supabaseAdmin.from('generation_jobs').select('id, batch_id').in('id', ids).eq('project_id', projectId)
  if (error) throw error
  const batchIds = [...new Set(((data ?? []) as Array<{ batch_id: string | null }>).flatMap((job) => (job.batch_id ? [job.batch_id] : [])))]
  const closed: string[] = []
  for (const batchId of batchIds) {
    const summary = await getVideoBatchSummary(batchId, projectId)
    if (!summary || (summary.status !== 'running' && summary.status !== 'paused') || summary.pending > 0) continue
    // 도는 영상이 하나도 없으면(그사이 다 끝남) 멈춘 묶음이 아니라 끝난 묶음이다 — 지금처럼 이어가기가 닫는다.
    const running = summary.jobs.flatMap((job) => (job.status === 'queued' && job.jobId ? [job.jobId] : []))
    const stopped = await cancelledJobsById(running)
    if (!running.length || running.some((jobId) => !stopped.has(jobId))) continue
    await cancelVideoBatch(batchId, projectId, userId)
    closed.push(batchId)
  }
  return closed
}
