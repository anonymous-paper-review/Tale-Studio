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
        : current?.status === 'paused'
          ? (current.stopReason === 'global_at_capacity' ? 'global_at_capacity' : 'insufficient_takes')
          : 'at_capacity'
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
      // 자리 부족은 두 축이다(2026-09-11 오너 결정 (가)). 개인 축(내 영상 3개가 도는 중)은 남이 못 끼어드는
      //   내 자리라 내 영상이 끝나면 완료 알림이 이어간다. 전역 축(모두의 68칸이 찼다)은 서버가 빈자리를 노리며
      //   두드리지 않는다 — 묶음을 멈추고 사용자가 다시 누른다. scope 가 없는 quota_exceeded 는 개인 축으로 본다
      //   (이어가는 쪽이 보수적이다 — 잘못 멈추면 사용자가 다시 눌러야 하고, 잘못 이어가면 다음 예약이 또 거절될 뿐이다).
      const scope = typeof body.scope === 'string' ? body.scope : null
      const globalAtCapacity = code === 'quota_exceeded' && scope === 'global'
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
      if (globalAtCapacity) {
        // 남은 샷은 pending 으로 보관된다. 임대 RPC 가 running 만 돌려주므로 완료 알림·정기 확인은 이 묶음을
        //   다시 내지 못한다. 사용자가 다시 누르면 새 묶음이 같은 샷을 낸다(예약 RPC 는 도는 잡만 busy 로 본다).
        const { error: pauseError } = await supabaseAdmin.from('director_video_batches').update({
          status: 'paused', stop_reason: 'global_at_capacity',
          lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString(),
        }).eq('id', batch.id).eq('project_id', input.projectId).eq('status', 'running')
        if (pauseError) throw new Error(pauseError.message)
        result.stopReason = 'global_at_capacity'
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
