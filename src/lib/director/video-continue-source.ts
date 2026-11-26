// ① 이어서의 출처 확인(오너 2026-11-27 N4a ① · dev fb1120-video 와 같은 규칙) — 서버가 진실. 화면이 보낸 이음 장면이 "같은 씬 바로 앞 샷의, Editor 로 가는 영상"에서
//   잡은 것일 때만 받는다. 앞 샷을 다시 만들어 그 영상이 바뀌었으면 옛 장면으로 잇지 않는다([다시 만들기]가 기록된 출처를 그대로 보낼 때).
//   Editor 로 가는 영상 = ★, 없으면 가장 새 완성(화면에서 멈춘 Take 는 빼고) — selectHandoffTake 와 같은 규칙.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { cancelledJobsById } from '@/lib/director/job-cancellations'
import { selectHandoffTake } from '@/lib/director-video-take-selection'
import { mediaPathFromUrl } from '@/lib/storage/media-url'
import { previousShotInScene, type ContinueFrom } from '@/lib/director/video-modes'

export type ContinueSourceCheck =
  | { ok: true; frameUrl: string; previousShotId: string }
  | { ok: false; status: 400 | 409; code: string; error: string }

/**
 * 이음 장면 주소가 그 앞 Take · 작업에서 잡은 우리 보관함 그림인가 — upload-image 의 chain_frame 이름
 *   (`<작업>_chain-frame.jpg` 또는 잡은 시각이 붙은 `<작업>_chain-frame-<밀리초>.jpg`). 생성처는 이 주소를 우리 대신 가져간다 — 넓히지 않는다.
 */
export function continueFramePathMatches(
  frameUrl: string,
  ids: { workspaceId: string; projectId: string; videoClipId: string; generationJobId: string },
): boolean {
  const path = mediaPathFromUrl(frameUrl)
  if (!path) return false
  const prefix = `${ids.workspaceId}/${ids.projectId}/videos/${ids.videoClipId}/${ids.generationJobId}_chain-frame`
  return path.startsWith(prefix) && /^(?:-\d{1,7})?\.jpg$/.test(path.slice(prefix.length))
}

export async function checkContinueSource(input: {
  projectId: string
  workspaceId: string
  shotId: string
  sceneId: string | null
  continueFrom: ContinueFrom
}): Promise<ContinueSourceCheck> {
  const { projectId, workspaceId, shotId, sceneId, continueFrom } = input
  if (!continueFramePathMatches(continueFrom.frameUrl, { workspaceId, projectId, ...continueFrom })) {
    return { ok: false, status: 400, code: 'invalid_continue_frame', error: 'Invalid request: continueFrom.frameUrl is not a frame captured from that video' }
  }
  const firstShot = { ok: false as const, status: 409 as const, code: 'continue_first_shot', error: 'This is the first shot of its scene, so there is no previous video to continue from.' }
  if (!sceneId) return firstShot
  const { data: sceneShots, error: shotsError } = await supabaseAdmin
    .from('shots')
    .select('shot_id, scene_id, sort_order')
    .eq('project_id', projectId)
    .eq('scene_id', sceneId)
  if (shotsError) throw shotsError
  const previousShotId = previousShotInScene(
    ((sceneShots ?? []) as Array<{ shot_id: string; scene_id: string | null; sort_order: number | null }>)
      .map((row) => ({ shotId: row.shot_id, sceneId: row.scene_id, sortOrder: row.sort_order })),
    shotId,
  )
  if (!previousShotId) return firstShot

  const { data: takes, error: takesError } = await supabaseAdmin
    .from('video_clips')
    .select('id, shot_id, url, storage_path, status, is_final, take_number, created_at, last_attempt_at, last_attempt_job_id, deleted_at')
    .eq('project_id', projectId)
    .eq('shot_id', previousShotId)
    .is('deleted_at', null)
  if (takesError) throw takesError
  const rows = (takes ?? []) as Array<{ id: string; storage_path: string | null; last_attempt_job_id: string | null } & Record<string, unknown>>
  const cancelled = await cancelledJobsById(rows.map((row) => row.last_attempt_job_id ?? '').filter(Boolean))
  const handoff = selectHandoffTake(rows.map((row) => ({ ...row, cancelled_at: cancelled.get(row.last_attempt_job_id ?? '') ?? null })))
  if (!handoff) {
    return { ok: false, status: 409, code: 'continue_previous_not_ready', error: 'The previous shot has no finished video to continue from yet.' }
  }
  const expectedPath = `${workspaceId}/${projectId}/videos/${continueFrom.videoClipId}/${continueFrom.generationJobId}.mp4`
  if (handoff.id !== continueFrom.videoClipId || handoff.storage_path !== expectedPath) {
    return {
      ok: false,
      status: 409,
      code: 'continue_source_changed',
      error: "The previous shot's video has changed. Choose Continue again to use its new last frame.",
    }
  }
  return { ok: true, frameUrl: continueFrom.frameUrl, previousShotId }
}
