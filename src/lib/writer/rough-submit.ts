import { supabaseAdmin } from '@/lib/supabase/admin'
import { falImageSubmit, type FalImageOptions } from '@/lib/writer/llm/fal'
import { recordWriterObservabilityEvent } from '@/lib/writer/debug-events'
import { isDefiniteSubmitRejection } from '@/lib/fal/submit-rejection'
import { getGenerationJobById } from '@/lib/generation-jobs'
import { syncFalKeyLimits } from '@/lib/generation-quota'
import { moderatedSubmitInput, type ModerationReceipt } from '@/lib/moderation/creem'
import { recordModerationPass } from '@/lib/api/moderation'

type Reservation = { job_id: string | null; shot_ids: string[]; state: 'reserved' | 'existing' | 'exists'; confirmation_pending?: boolean }
export type RoughSubmission = { shotId: string; jobId: string; confirmationPending?: boolean }

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
  /** Creem 검사 통과 영수증(#creem-moderation 2026-10-11) — 호출부가 예약 RPC 전에 샷 설명만 검사해 받아 넣는다. */
  moderation: ModerationReceipt
}): Promise<{ submitted: RoughSubmission[]; exists: string[] }> {
  await syncFalKeyLimits()
  const snapshot = input.snapshot
  const { data, error } = await supabaseAdmin.rpc('reserve_rough_storyboard_grid', {
    p_project_id: input.projectId, p_workspace_id: input.workspaceId, p_user_id: input.userId,
    p_shot_ids: input.shotIds, p_grid_variant: input.gridVariant, p_model: input.options.model,
    p_input_snapshot: snapshot, p_force: input.force ?? false,
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
    const reservedJob = await getGenerationJobById(jobId)
    if (!reservedJob || reservedJob.project_id !== input.projectId) {
      throw new Error('Rough reservation job not found for project')
    }
    const falKeyId = reservedJob.fal_key_id
    if (typeof falKeyId !== 'string' || !falKeyId.trim()) {
      throw new Error('Rough reservation job has no final fal key')
    }
    await recordWriterObservabilityEvent(input.projectId, 'fal_submit_started', { jobId, shotCount: reservation.shot_ids.length })
    // #creem-moderation(2026-10-11): 통과한 검사는 작업 기록(관측 이벤트)에만 남긴다 — 예약 스냅샷은
    //   같은 요구면 같은 내용이어야 해서 시각·검사 id 를 넣지 않는다.
    recordModerationPass(input.moderation, {
      projectId: input.projectId, kind: 'shot_rough_storyboard', userId: input.userId, jobId,
    })
    let confirmationPending = false
    try {
      // 외부 접수는 한 번뿐이다. 응답을 잃은 호출을 SDK 재시도로 복제하지 않는다.
      const receipt = await falImageSubmit(
        moderatedSubmitInput(input.options, input.moderation),
        { retry: false, falKeyId },
      )
      await recordWriterObservabilityEvent(input.projectId, 'fal_submit_accepted', {
        jobId, requestId: receipt.request_id, model: receipt.model, shotCount: reservation.shot_ids.length,
      })
      try {
        await patchReservation(input.projectId, jobId, {
          request_id: receipt.request_id, model: receipt.model, fal_key_id: receipt.fal_key_id,
          submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(), attempts: 1,
          input_snapshot: { ...snapshot, rough_submit_state: 'submitted' },
        })
      } catch (error) {
        confirmationPending = true
        // 이미 접수됐다. 연결 저장 실패는 새 번호로 다시 발주할 근거가 아니다.
        console.error('[rough-submit] accepted receipt could not be saved:', jobId, error instanceof Error ? error.message : String(error))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const rejected = isDefiniteSubmitRejection(error)
      await recordWriterObservabilityEvent(input.projectId, 'fal_submit_failed', {
        jobId, shotCount: reservation.shot_ids.length, error: message, confirmationPending: !rejected,
      })
      if (rejected) {
        await patchReservation(input.projectId, jobId, {
          status: 'failed', error: message, last_error: message, completed_at: new Date().toISOString(),
          input_snapshot: { ...snapshot, rough_submit_state: 'rejected' },
        })
        throw error
      }
      confirmationPending = true
      try {
        await patchReservation(input.projectId, jobId, {
          last_error: message, input_snapshot: { ...snapshot, rough_submit_state: 'confirmation_pending' },
        })
      } catch { /* 예약 자체는 남아 중복 접수를 막는다. */ }
    }
    submitted.push(...reservation.shot_ids.map((shotId) => ({ shotId, jobId, ...(confirmationPending ? { confirmationPending: true } : {}) })))
  }
  return { submitted, exists }
}
