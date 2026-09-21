import { supabaseAdmin } from '@/lib/supabase/admin'
import { userOwnsProject } from '@/lib/generation-jobs'
import type { reserveDirectorVideoTake, DirectorVideoReservation } from '@/lib/director-video-takes'
import type { PreparedDirectorVideoSubmission } from '@/lib/director/video-submit'
import type { VideoBatchSummary, VideoBatchStatus } from '@/lib/director/video-batch-types'
import type { Json, Tables } from '@/types/database'

type Batch = Tables<'director_video_batches'>
type ItemState = Pick<Tables<'director_video_batch_items'>, 'id' | 'batch_id' | 'job_id' | 'status' | 'error' | 'submission_response'>
type JobState = Pick<Tables<'generation_jobs'>, 'id' | 'status' | 'result_url' | 'error' | 'request_id'>

function summarize(batch: Batch, items: ItemState[], jobs: Map<string, JobState>): VideoBatchSummary {
  const summary: VideoBatchSummary = {
    id: batch.id, projectId: batch.project_id, status: batch.status as VideoBatchStatus,
    total: items.length, started: 0, failedToStart: 0, done: 0, failed: 0, pending: 0, active: 0,
    stopReason: batch.stop_reason, jobs: [],
  }
  for (const item of items) {
    const job = item.job_id ? jobs.get(item.job_id) : undefined
    const response = item.submission_response
    const body = response && typeof response === 'object' && !Array.isArray(response) ? response : null
    const providerRequest = job?.request_id
      && !job.request_id.startsWith('reserved:') && !job.request_id.startsWith('local_reserved:')
    const accepted = job?.status === 'completed' || Boolean(providerRequest)
      || Boolean(item.job_id && body?.jobId === item.job_id && body.unresolved !== true
        && (body.status === 'generating' || body.status === 'completed' || typeof body.recoveryReceipt === 'string'))
    if (accepted) summary.started += 1
    if (job) {
      if (job.status === 'completed') summary.done += 1
      else if (job.status === 'failed') {
        summary.failed += 1
        if (!accepted) summary.failedToStart += 1
      }
      else summary.active += 1
      summary.jobs.push({
        jobId: job.id, status: job.status as 'queued' | 'completed' | 'failed',
        resultUrl: job.result_url, error: job.error ?? item.error,
      })
    } else if (item.status === 'pending') {
      summary.pending += 1
    } else if (item.status === 'skipped' && item.error?.includes('batch_shot_already_completed')) {
      summary.done += 1
    } else {
      summary.failed += 1
      if (!accepted) summary.failedToStart += 1
    }
  }
  return summary
}

async function readSummary(batch: Batch): Promise<VideoBatchSummary> {
  // 묶음별 최대 100개를 따로 읽어 여러 묶음의 합이 조회 상한에 잘리지 않게 한다.
  const { data: items, error } = await supabaseAdmin.from('director_video_batch_items')
    .select('id, batch_id, job_id, status, error, submission_response').eq('batch_id', batch.id)
  if (error) throw new Error(error.message)
  const jobIds = [...new Set((items ?? []).flatMap((item) => item.job_id ? [item.job_id] : []))]
  const jobs = new Map<string, JobState>()
  if (jobIds.length) {
    const { data, error: jobError } = await supabaseAdmin.from('generation_jobs')
      .select('id, status, result_url, error, request_id').in('id', jobIds)
    if (jobError) throw new Error(jobError.message)
    for (const job of data ?? []) jobs.set(job.id, job)
  }
  return summarize(batch, items ?? [], jobs)
}

export async function getVideoBatchSummary(batchId: string, projectId: string): Promise<VideoBatchSummary | null> {
  const { data, error } = await supabaseAdmin.from('director_video_batches')
    .select('*').eq('id', batchId).eq('project_id', projectId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return readSummary(data)
}

export async function listVideoBatchSummaries(projectId: string): Promise<VideoBatchSummary[]> {
  const [running, recent] = await Promise.all([
    supabaseAdmin.from('director_video_batches').select('*').eq('project_id', projectId)
      .eq('status', 'running').order('created_at', { ascending: false }),
    supabaseAdmin.from('director_video_batches').select('*').eq('project_id', projectId)
      .neq('status', 'running').order('created_at', { ascending: false }).limit(20),
  ])
  if (running.error) throw new Error(running.error.message)
  if (recent.error) throw new Error(recent.error.message)
  return Promise.all([...(running.data ?? []), ...(recent.data ?? [])].map(readSummary))
}

export async function createVideoBatch(input: {
  id: string
  projectId: string
  userId: string
  items: Array<{ id: string; shot_id: string; prepared: PreparedDirectorVideoSubmission }>
}): Promise<VideoBatchSummary> {
  const { error } = await supabaseAdmin.rpc('create_director_video_batch', {
    p_batch_id: input.id, p_project_id: input.projectId, p_user_id: input.userId,
    p_items: input.items as unknown as Json,
  })
  if (error) {
    // #batch-resume: 입력 준비 중 먼저 저장된 중단 기록은 지우지 않고 그대로 돌려준다.
    if (error.code === '23505') {
      const stopped = await getVideoBatchSummary(input.id, input.projectId)
      if (stopped?.status === 'cancelled') return stopped
    }
    throw new Error(error.message)
  }
  const batch = await getVideoBatchSummary(input.id, input.projectId)
  if (!batch) throw new Error('Created video batch is missing')
  return batch
}

export async function cancelVideoBatch(batchId: string, projectId: string, userId: string): Promise<VideoBatchSummary> {
  if (!await userOwnsProject(projectId, userId)) throw new Error('Forbidden')
  const { data: project, error: projectError } = await supabaseAdmin.from('projects')
    .select('workspace_id').eq('id', projectId).maybeSingle()
  if (projectError) throw new Error(projectError.message)
  if (!project?.workspace_id) throw new Error('Project workspace is missing')
  // 준비 중 POST보다 먼저 중단해도 기록을 남긴다. 중복 id의 기존 내용은 덮어쓰지 않는다.
  const { error: insertError } = await supabaseAdmin.from('director_video_batches').upsert({
    id: batchId, project_id: projectId, user_id: userId, workspace_id: project.workspace_id,
    status: 'cancelled', stop_reason: 'user_cancelled',
  }, { onConflict: 'id', ignoreDuplicates: true })
  if (insertError) throw new Error(insertError.message)
  const { error } = await supabaseAdmin.from('director_video_batches').update({
    status: 'cancelled', stop_reason: 'user_cancelled', lease_token: null, lease_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', batchId).eq('project_id', projectId).eq('user_id', userId).in('status', ['running', 'paused'])
  if (error) throw new Error(error.message)
  const batch = await getVideoBatchSummary(batchId, projectId)
  if (!batch) throw new Error('Batch does not belong to project')
  return batch
}

export async function reserveVideoBatchItem(
  itemId: string,
  leaseToken: string,
  input: Parameters<typeof reserveDirectorVideoTake>[0],
): Promise<DirectorVideoReservation> {
  const { data, error } = await supabaseAdmin.rpc('reserve_director_video_batch_item', {
    p_item_id: itemId, p_lease_token: leaseToken, p_args: input as unknown as Json,
  })
  if (error) throw error
  const reservation = data?.[0]
  if (!reservation) throw new Error('Batch reservation returned no job')
  return reservation
}
