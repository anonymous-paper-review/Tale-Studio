import { supabaseAdmin } from '@/lib/supabase/admin'
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
  const { error } = await supabaseAdmin.rpc('soft_delete_director_video_take', { p_project_id: projectId, p_video_clip_id: videoClipId })
  if (error) throw error
}

export async function updateDirectorVideoTakeMetadata(
  projectId: string,
  videoClipId: string,
  metadata: Pick<Partial<DirectorVideoTake>, 'take_label' | 'override' | 'canvas_position'>,
): Promise<DirectorVideoTake> {
  const { data, error } = await supabaseAdmin
    .from('video_clips')
    .update({
      ...(metadata.take_label !== undefined ? { take_label: metadata.take_label } : {}),
      ...(metadata.override !== undefined ? { override: metadata.override } : {}),
      ...(metadata.canvas_position !== undefined ? { canvas_position: metadata.canvas_position } : {}),
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

export async function attachProviderRequestToReservedVideoJob(
  projectId: string,
  jobId: string,
  providerRequestId: string,
  options: { provider?: string; model?: string } = {},
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('attach_director_video_provider_request', {
    p_project_id: projectId,
    p_job_id: jobId,
    p_provider_request_id: providerRequestId,
    p_provider: options.provider ?? null,
    p_model: options.model ?? null,
  })
  if (error) throw error
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
}
