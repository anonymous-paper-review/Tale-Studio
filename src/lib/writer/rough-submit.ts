import { supabaseAdmin } from '@/lib/supabase/admin'
import { falImageSubmit, type FalImageOptions } from '@/lib/writer/llm/fal'
import { recordWriterObservabilityEvent } from '@/lib/writer/debug-events'

type Reservation = { job_id: string | null; shot_ids: string[]; state: 'reserved' | 'existing' | 'exists'; confirmation_pending?: boolean }
export type RoughSubmission = { shotId: string; jobId: string; confirmationPending?: boolean }

/** 명시적인 접수 거절만 실패로 해제한다. 통신 오류·5xx는 이미 접수됐을 수 있다. */
function definiteRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const failure = error as { status?: unknown; cause?: unknown }
  if (typeof failure.status === 'number') return failure.status >= 400 && failure.status < 500 && ![408, 425, 429].includes(failure.status)
  return failure.cause ? definiteRejection(failure.cause) : false
}

async function patchReservation(projectId: string, jobId: string, patch: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabaseAdmin.from('generation_jobs').update(patch)
    .eq('id', jobId).eq('project_id', projectId).eq('kind', 'shot_rough_storyboard')
    .eq('status', 'queued').eq('request_id', `reserved:${jobId}`).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Rough reservation changed before receipt was saved')
}

export async function submitRoughStoryboardGrid(input: {
  projectId: string
  workspaceId: string
  userId: string
  shotIds: string[]
  gridVariant: 'grid4' | 'strip1'
  force?: boolean
  snapshot: Record<string, unknown>
  options: FalImageOptions & { model: string }
}): Promise<{ submitted: RoughSubmission[]; exists: string[] }> {
  const { data, error } = await supabaseAdmin.rpc('reserve_rough_storyboard_grid', {
    p_project_id: input.projectId, p_workspace_id: input.workspaceId, p_user_id: input.userId,
    p_shot_ids: input.shotIds, p_grid_variant: input.gridVariant, p_model: input.options.model,
    p_input_snapshot: input.snapshot, p_force: input.force ?? false,
  })
  if (error) throw error
  const reservations = data as Reservation[] | null
  if (!reservations?.length) throw new Error('Rough reservation returned no target')
  const submitted: RoughSubmission[] = []
  const exists: string[] = []
  for (const reservation of reservations) {
    if (reservation.state === 'exists') { exists.push(...reservation.shot_ids); continue }
    const jobId = reservation.job_id
    if (!jobId) throw new Error('Rough reservation returned no job ID')
    if (reservation.state === 'existing') {
      submitted.push(...reservation.shot_ids.map((shotId) => ({ shotId, jobId, ...(reservation.confirmation_pending ? { confirmationPending: true } : {}) })))
      continue
    }
    if (reservation.state !== 'reserved') throw new Error('Unknown rough reservation state')
    await recordWriterObservabilityEvent(input.projectId, 'fal_submit_started', { jobId, shotCount: reservation.shot_ids.length })
    let confirmationPending = false
    try {
      // 외부 접수는 한 번뿐이다. 응답을 잃은 호출을 SDK 재시도로 복제하지 않는다.
      const receipt = await falImageSubmit(input.options, { retry: false })
      await recordWriterObservabilityEvent(input.projectId, 'fal_submit_accepted', {
        jobId, requestId: receipt.request_id, model: receipt.model, shotCount: reservation.shot_ids.length,
      })
      try {
        await patchReservation(input.projectId, jobId, {
          request_id: receipt.request_id, model: receipt.model, fal_key_id: receipt.fal_key_id,
          submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(), attempts: 1,
          input_snapshot: { ...input.snapshot, rough_submit_state: 'submitted' },
        })
      } catch (error) {
        confirmationPending = true
        // 이미 접수됐다. 연결 저장 실패는 새 번호로 다시 발주할 근거가 아니다.
        console.error('[rough-submit] accepted receipt could not be saved:', jobId, error instanceof Error ? error.message : String(error))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const rejected = definiteRejection(error)
      await recordWriterObservabilityEvent(input.projectId, 'fal_submit_failed', {
        jobId, shotCount: reservation.shot_ids.length, error: message, confirmationPending: !rejected,
      })
      if (rejected) {
        await patchReservation(input.projectId, jobId, {
          status: 'failed', error: message, last_error: message, completed_at: new Date().toISOString(),
          input_snapshot: { ...input.snapshot, rough_submit_state: 'rejected' },
        })
        throw error
      }
      confirmationPending = true
      try {
        await patchReservation(input.projectId, jobId, {
          last_error: message, input_snapshot: { ...input.snapshot, rough_submit_state: 'confirmation_pending' },
        })
      } catch { /* 예약 자체는 남아 중복 접수를 막는다. */ }
    }
    submitted.push(...reservation.shot_ids.map((shotId) => ({ shotId, jobId, ...(confirmationPending ? { confirmationPending: true } : {}) })))
  }
  return { submitted, exists }
}
