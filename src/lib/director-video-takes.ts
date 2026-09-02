import { supabaseAdmin } from '@/lib/supabase/admin'
import { classifyJobError } from '@/lib/generation-jobs'
import { releaseTakesForJob } from '@/lib/billing/take-hold'
import type { Json, Tables } from '@/types/database'
export {
  compareDirectorVideoTakeOrder,
  selectHandoffTake,
  selectLatestAttempt,
  selectNewestSuccessfulTake,
  type VideoTakeSelectionRecord,
} from '@/lib/director-video-take-selection'

export type DirectorVideoTake = Tables<'video_clips'>
export type DirectorVideoReservation = {
  video_clip_id: string
  job_id: string
  take_number: number
  replayed: boolean
}

type ReservationInput = {
  projectId: string
  model: string
  target: Json
  idempotencyKey: string
  inputSnapshot?: Json
  userId?: string | null
  workspaceId?: string | null
  provider?: string | null
  actor?: string | null
  takeLabel?: string | null
  override?: Json
  canvasPosition?: Json | null
}


function reservationInputSnapshot(value: Json | undefined): Json {
  if (value === undefined) return {}
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error('director video input snapshot must be a plain JSON object')
  }
  return value
}

async function rpcReservation(
  name: 'reserve_director_video_take' | 'reserve_director_video_regeneration',
  args: Record<string, unknown>,
): Promise<DirectorVideoReservation> {
  const { data, error } = await supabaseAdmin.rpc(name, args)
  if (error) throw error
  const reservation = (data as DirectorVideoReservation[] | null)?.[0]
  if (!reservation) throw new Error('Video take reservation returned no row')
  return reservation
}

export function reserveDirectorVideoTake(input: ReservationInput & { shotId: string }): Promise<DirectorVideoReservation> {
  return rpcReservation('reserve_director_video_take', {
    p_project_id: input.projectId,
    p_shot_id: input.shotId,
    p_model: input.model,
    p_target: input.target,
    p_idempotency_key: input.idempotencyKey,
    p_input_snapshot: reservationInputSnapshot(input.inputSnapshot),
    p_user_id: input.userId ?? null,
    p_workspace_id: input.workspaceId ?? null,
    p_provider: input.provider ?? null,
    p_actor: input.actor ?? null,
    p_take_label: input.takeLabel ?? null,
    p_override: input.override ?? {},
    p_canvas_position: input.canvasPosition ?? null,
  })
}

export function reserveDirectorVideoRegeneration(input: ReservationInput & { videoClipId: string }): Promise<DirectorVideoReservation> {
  return rpcReservation('reserve_director_video_regeneration', {
    p_project_id: input.projectId,
    p_video_clip_id: input.videoClipId,
    p_model: input.model,
    p_target: input.target,
    p_idempotency_key: input.idempotencyKey,
    p_input_snapshot: reservationInputSnapshot(input.inputSnapshot),
    p_user_id: input.userId ?? null,
    p_workspace_id: input.workspaceId ?? null,
    p_provider: input.provider ?? null,
    p_actor: input.actor ?? null,
  })
}

export async function refreshDirectorVideoProjection(projectId: string, shotId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('refresh_director_video_projection', { p_project_id: projectId, p_shot_id: shotId })
  if (error) throw error
}

export async function setDirectorVideoFinal(projectId: string, videoClipId: string, final: boolean): Promise<void> {
  const { error } = await supabaseAdmin.rpc('set_director_video_final', { p_project_id: projectId, p_video_clip_id: videoClipId, p_final: final })
  if (error) throw error
}

export async function softDeleteDirectorVideoTake(projectId: string, videoClipId: string): Promise<void> {
  // #payments-phase-2 #gen-quota-atomic-gate: 이 RPC 는 대기 중(queued)이던 잡을 SQL 안에서 직접
  //   status='failed' 로 마킹한다(삭제로 인한 취소) — 삭제 전 그 잡 중 취소 대상이 있을 수 있어 미리
  //   조회해 둘 수 없다. 삭제 후 hold 잔량을 잡 id 무관하게 반환 시도(멱등 RPC 이므로 해당
  //   키율에 hold 가 없었던 경우도 안전).
  const { data: cancelledJobs, error: cancelledJobsError } = await supabaseAdmin
    .from('generation_jobs')
    .select('id')
    .eq('project_id', projectId)
    .eq('video_clip_id', videoClipId)
    .eq('kind', 'shot_video')
    .eq('status', 'queued')
  if (cancelledJobsError) console.error('[director-video-takes] cancelled-job lookup failed:', cancelledJobsError.message)
  const { error } = await supabaseAdmin.rpc('soft_delete_director_video_take', { p_project_id: projectId, p_video_clip_id: videoClipId })
  if (error) throw error
  for (const { id } of cancelledJobs ?? []) {
    try {
      await releaseTakesForJob(id)
    } catch (releaseError) {
      console.error('[director-video-takes] take release failed:', releaseError instanceof Error ? releaseError.message : releaseError)
    }
  }
}

export async function updateDirectorVideoTakeMetadata(
  projectId: string,
  videoClipId: string,
  metadata: Pick<
    Partial<DirectorVideoTake>,
    'take_label' | 'override' | 'canvas_position' | 'frame_inputs' | 'video_chain'
  >,
): Promise<DirectorVideoTake> {
  const { data, error } = await supabaseAdmin
    .from('video_clips')
    .update({
      ...(metadata.take_label !== undefined ? { take_label: metadata.take_label } : {}),
      ...(metadata.override !== undefined ? { override: metadata.override } : {}),
      ...(metadata.canvas_position !== undefined ? { canvas_position: metadata.canvas_position } : {}),
      // #wiring-persistence: 수동 연결의 안정 참조 직렬화 결과 write-through.
      ...(metadata.frame_inputs !== undefined ? { frame_inputs: metadata.frame_inputs } : {}),
      ...(metadata.video_chain !== undefined ? { video_chain: metadata.video_chain } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', videoClipId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error) throw error
  return data as DirectorVideoTake
}

export async function listLiveDirectorVideoTakes(projectId: string): Promise<DirectorVideoTake[]> {
  const { data, error } = await supabaseAdmin
    .from('video_clips')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('shot_id', { ascending: true })
    .order('take_number', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return (data ?? []) as DirectorVideoTake[]
}

export async function createStandaloneDirectorVideoTake(input: {
  projectId: string
  ownerKey: string
  override: Json
  canvasPosition: Json
}): Promise<DirectorVideoTake> {
  const { data, error } = await supabaseAdmin
    .from('video_clips')
    .insert({
      project_id: input.projectId,
      shot_id: input.ownerKey,
      take_number: 1,
      take_label: 'Video',
      override: input.override,
      canvas_position: input.canvasPosition,
      status: 'pending',
      last_attempt_status: null,
      is_final: false,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as DirectorVideoTake
}

export async function attachProviderRequestToReservedVideoJob(
  projectId: string,
  jobId: string,
  providerRequestId: string,
  options: { provider?: string; model?: string; falKeyId?: string } = {},
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('attach_director_video_provider_request', {
    p_project_id: projectId,
    p_job_id: jobId,
    p_provider_request_id: providerRequestId,
    p_provider: options.provider ?? null,
    p_model: options.model ?? null,
  })
  if (error) throw error
  // #fal-key-pool: attach RPC 시그니처에 fal_key_id 가 없어 별도 업데이트로 기록한다(fal 제출일에만 해당,
  //   local 제출은 falKeyId 미지정 — 조용히 no-op). 실패는 치명적이지 않다 — 조회가 안 되면
  //   reconcile 이 FalUnknownKeyError 로 터미널 처리해 잡을 영원히 queued 로 남기지 않는다.
  if (options.falKeyId) {
    const { error: keyError } = await supabaseAdmin
      .from('generation_jobs')
      .update({ fal_key_id: options.falKeyId })
      .eq('id', jobId)
      .eq('project_id', projectId)
    if (keyError) console.error('[director-video-takes] fal_key_id attach failed:', keyError.message)
  }
}

export async function completeDirectorVideoAttempt(
  projectId: string,
  jobId: string,
  videoClipId: string,
  resultUrl: string,
  storagePath: string,
): Promise<void> {
  if (!resultUrl.trim()) throw new Error('director video result URL must be nonblank')
  if (!storagePath.trim()) throw new Error('director video storage path must be nonblank')
  const { error } = await supabaseAdmin.rpc('complete_director_video_attempt', {
    p_project_id: projectId,
    p_job_id: jobId,
    p_video_clip_id: videoClipId,
    p_result_url: resultUrl,
    p_storage_path: storagePath,
  })
  if (error) throw error
}

export async function markDirectorVideoAttemptFailed(projectId: string, jobId: string, message: string): Promise<void> {
  const errorMessage = message.trim().slice(0, 1000)
  if (!errorMessage) throw new Error('director video failure evidence must be nonblank')
  const { error } = await supabaseAdmin.rpc('fail_director_video_attempt', {
    p_project_id: projectId,
    p_job_id: jobId,
    p_error: errorMessage,
  })
  if (error) throw error
  // #error-class: RPC 는 error_class 를 모른다 — 종결 후 보강 태깅(best-effort, 집계 전용 필드).
  await supabaseAdmin
    .from('generation_jobs')
    .update({ error_class: classifyJobError(errorMessage) })
    .eq('id', jobId)
    .eq('status', 'failed')
  // #payments-phase-2 #gen-quota-atomic-gate: 터미널 실패 → hold 반환. 실패해도 잡 마킹은 이미
  //   끝났으니 삼키고 로그만 남긴다(release RPC 는 멱등 — 다음 reconcile/재시도가 마저 정리해도 안전).
  try {
    await releaseTakesForJob(jobId)
  } catch (releaseError) {
    console.error('[director-video-takes] take release failed:', releaseError instanceof Error ? releaseError.message : releaseError)
  }
}
