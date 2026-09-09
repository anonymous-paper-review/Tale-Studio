import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Json, Tables } from '@/types/database'
import type { BatchStopReason } from '@/lib/director/batch-next'
import { getVideoBatchSummary, reserveVideoBatchItem } from '@/lib/director/batch-store'
import { submitPreparedDirectorVideo, type PreparedDirectorVideoSubmission } from '@/lib/director/video-submit'

export interface ContinueBatchInput {
  batchId: string
  projectId: string
}

export interface ContinueBatchResult {
  submitted: number
  stopReason: BatchStopReason | null
}

/** #batch-resume: 고정 목록을 임대한 실행만 제출한다. 한도·중복·중단의 최종 방어선은 예약 RPC다. */
export async function continueVideoBatch(input: ContinueBatchInput): Promise<ContinueBatchResult> {
  const result: ContinueBatchResult = { submitted: 0, stopReason: null }
  const { data, error } = await supabaseAdmin.rpc('claim_director_video_batch', {
    p_batch_id: input.batchId, p_token: crypto.randomUUID(),
  })
  if (error) throw new Error(error.message)
  const batch = data?.[0]
  if (!batch) {
    const current = await getVideoBatchSummary(input.batchId, input.projectId)
    result.stopReason = current?.status === 'cancelled' ? 'cancelled'
      : current?.status === 'completed' ? 'complete'
        : current?.status === 'paused' ? 'insufficient_takes' : 'at_capacity'
    return result
  }
  if (batch.project_id !== input.projectId) throw new Error('Batch does not belong to project')
  if (batch.status !== 'running') return { submitted: 0, stopReason: batch.status === 'cancelled' ? 'cancelled' : 'complete' }
  const token = batch.lease_token
  if (!token) throw new Error('Claimed batch has no lease')

  const updateOwnedBatch = async (patch: Partial<Tables<'director_video_batches'>>) => {
    const { error } = await supabaseAdmin.from('director_video_batches')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', batch.id).eq('project_id', input.projectId).eq('status', 'running')
      .eq('lease_token', token).gt('lease_expires_at', new Date().toISOString())
    if (error) throw new Error(error.message)
  }
  const start = Date.now()
  try {
    const { data: items, error: itemError } = await supabaseAdmin.from('director_video_batch_items')
      .select('*').eq('batch_id', batch.id).eq('status', 'pending').order('position', { ascending: true })
    if (itemError) throw new Error(itemError.message)
    for (const item of items ?? []) {
      // 긴 provider 응답 뒤 새 제출을 시작하지 않는다. 다음 웹훅·점검이 남은 항목을 맡는다.
      if (result.submitted >= 3 || Date.now() - start > 120_000) break
      const { data: current, error: currentError } = await supabaseAdmin.from('director_video_batches')
        .select('status, lease_token, lease_expires_at').eq('id', batch.id).maybeSingle()
      if (currentError) throw new Error(currentError.message)
      if (!current || current.status !== 'running') {
        result.stopReason = current?.status === 'cancelled' ? 'cancelled' : 'complete'
        return result
      }
      if (current.lease_token !== token || !current.lease_expires_at || Date.parse(current.lease_expires_at) <= Date.now()) {
        result.stopReason = 'at_capacity'
        return result
      }

      let reservedJobId: string | null = null
      let body: Record<string, Json | undefined>
      let status: number
      try {
        const prepared = item.prepared
        if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)
          || prepared.projectId !== batch.project_id || prepared.ownerId !== batch.user_id
          || prepared.idempotencyKey !== item.id || prepared.writerShotId !== item.shot_id
          || prepared.videoClipId != null || prepared.standalone === true) {
          throw new Error('Stored batch input does not match its item')
        }
        const response = await submitPreparedDirectorVideo(prepared as unknown as PreparedDirectorVideoSubmission, {
          reserve: async (args) => {
            const reservation = await reserveVideoBatchItem(item.id, token, args)
            reservedJobId = reservation.job_id
            return reservation
          },
        })
        status = response.status
        const responseBody: unknown = await response.json()
        if (!responseBody || typeof responseBody !== 'object' || Array.isArray(responseBody)) {
          throw new Error('Video submission returned an invalid response')
        }
        body = responseBody as Record<string, Json | undefined>
      } catch (error) {
        status = 500
        body = { error: error instanceof Error ? error.message : 'Video submission failed' }
      }
      const message = typeof body.error === 'string' ? body.error : null
      const code = typeof body.code === 'string' ? body.code : message
      const jobId = typeof body.jobId === 'string' ? body.jobId : reservedJobId
      const atCapacity = code === 'quota_exceeded' || code?.includes('batch_user_at_capacity') || code?.includes('video_user_at_capacity')
      const busy = code?.includes('batch_shot_busy')
      const alreadyDone = code?.includes('batch_shot_already_completed')
      const stopped = code?.includes('batch is not running') || code?.includes('batch lease is invalid or expired')
      const insufficient = status === 402 || code === 'video_budget_exceeded'
      const state = jobId ? 'submitted' : alreadyDone ? 'skipped'
        : atCapacity || busy || stopped || insufficient ? 'pending' : 'failed'
      const { error: saveError } = await supabaseAdmin.from('director_video_batch_items').update({
        status: state, error: message, submission_response: body as Json,
        ...(jobId ? { job_id: jobId } : {}),
      }).eq('id', item.id).eq('batch_id', batch.id)
      if (saveError) throw new Error(saveError.message)
      if (jobId) result.submitted += 1
      if (insufficient || status === 401 || status === 403) {
        // 잔액·권한 거절은 묶음 전체의 중단 사유다. 응답이 늦어 임대가 바뀌어도
        // 남기되, 사용자가 이미 중단하거나 끝난 묶음은 덮지 않는다.
        const { error: pauseError } = await supabaseAdmin.from('director_video_batches').update({
          status: 'paused', stop_reason: code ?? 'submission_forbidden',
          lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString(),
        }).eq('id', batch.id).eq('project_id', input.projectId).eq('status', 'running')
        if (pauseError) throw new Error(pauseError.message)
        result.stopReason = 'insufficient_takes'
        return result
      }
      if (stopped) {
        result.stopReason = 'cancelled'
        return result
      }
      if (atCapacity) {
        result.stopReason = 'at_capacity'
        return result
      }
      // busy는 나중에 다시 본다. 단일 샷 오류도 뒤에 있는 다른 샷을 막지 않는다.
    }
    const summary = await getVideoBatchSummary(batch.id, input.projectId)
    if (summary && summary.pending === 0 && summary.active === 0) {
      await updateOwnedBatch({ status: 'completed', stop_reason: null, lease_token: null, lease_expires_at: null })
      result.stopReason = 'complete'
    }
    return result
  } finally {
    try {
      await updateOwnedBatch({ lease_token: null, lease_expires_at: null })
    } catch (error) {
      console.error('[video-batches] lease release failed:', batch.id, error instanceof Error ? error.message : error)
    }
  }
}
