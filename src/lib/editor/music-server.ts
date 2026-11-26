// Editor 음악 만들기 서버 쪽(2026-11-26 m1126 E1) — 만든 곡 표(editor_music) 읽기 · 행을 화면 한 줄로 · 보관함 경로.
//   표는 서버(service role)만 읽고 쓴다(마이그레이션 20261126120000). 만드는 중인 곡의 끝 · 실패는 작업 장부(generation_jobs)가 진실이다 —
//   웹훅 · 폴링 · 유령 청소 어느 길로 실패해도 목록이 같도록, 목록을 읽을 때 작업 상태를 보고 실패를 곡 행에 옮겨 적는다.
//   약속: tests/job/editor-music-job.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getGenerationJobsByIds } from '@/lib/generation-jobs'
import { classifyJobError } from '@/lib/fal/failure-class'
import { STALE_QUEUED_VIDEO_MS } from '@/lib/generation-job-timing'
import { isMusicModelKey, musicTitle, DEFAULT_MUSIC_MODEL, type EditorMusicItem, type MusicFailureCode } from '@/lib/editor/music-models'

export { editorMusicPath } from '@/lib/editor/music-path'

export interface EditorMusicRow {
  id: string
  project_id: string
  job_id: string | null
  model: string
  prompt: string
  lyrics: string | null
  instrumental: boolean
  requested_duration_sec: number | string | null
  url: string | null
  status: string
  error: string | null
  created_at: string
}

export const EDITOR_MUSIC_COLUMNS = 'id, project_id, job_id, model, prompt, lyrics, instrumental, requested_duration_sec, url, status, error, created_at'
/** 목록에 싣는 곡 수 — 새것부터. */
export const EDITOR_MUSIC_LIST_LIMIT = 50

/** 작업 장부의 실패 글 → 화면이 고를 까닭. */
export function musicFailureCode(jobError: string | null | undefined): MusicFailureCode {
  const message = (jobError ?? '').trim()
  if (message === 'insufficient_takes') return 'insufficient_takes'
  const cls = classifyJobError(message)
  if (cls === 'moderation' || cls === 'moderation_soft') return 'content_policy'
  if (cls === 'infra') return 'timed_out'
  return 'generation_failed'
}

export function toMusicItem(row: EditorMusicRow): EditorMusicItem {
  const status = row.status === 'completed' || row.status === 'failed' ? row.status : 'queued'
  const requested = row.requested_duration_sec == null ? null : Number(row.requested_duration_sec)
  return {
    id: row.id,
    title: musicTitle(row.prompt),
    model: isMusicModelKey(row.model) ? row.model : DEFAULT_MUSIC_MODEL,
    prompt: row.prompt,
    lyrics: row.lyrics,
    instrumental: row.instrumental,
    requestedDurationSec: Number.isFinite(requested) ? requested : null,
    status,
    url: status === 'completed' ? row.url : null,
    error: status === 'failed' ? row.error ?? 'generation_failed' : null,
    jobId: row.job_id,
    createdAt: row.created_at,
  }
}

/** 곡을 실패로 적는다 — 만드는 중인 행만(끝난 곡을 늦은 실패가 덮지 않게). */
export async function markEditorMusicFailed(projectId: string, musicId: string, code: MusicFailureCode): Promise<void> {
  const { error } = await supabaseAdmin
    .from('editor_music')
    .update({ status: 'failed', error: code, completed_at: new Date().toISOString() })
    .eq('id', musicId)
    .eq('project_id', projectId)
    .eq('status', 'queued')
  if (error) console.error('[editor-music] mark failed:', musicId, error.message)
}

/**
 * 프로젝트의 만든 곡 — 뺀 곡 빼고 새것이 위. 만드는 중인 곡은 작업 장부를 보고 실패면 실패로 적어 보인다.
 *   작업 행이 없는데 영상 유령 기준(30분)보다 오래 만드는 중이면 너무 오래 걸린 것으로 본다.
 */
export async function listEditorMusic(projectId: string, now = Date.now()): Promise<EditorMusicItem[]> {
  const { data, error } = await supabaseAdmin
    .from('editor_music')
    .select(EDITOR_MUSIC_COLUMNS)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(EDITOR_MUSIC_LIST_LIMIT)
  if (error) throw error
  const rows = (data ?? []) as EditorMusicRow[]
  const queued = rows.filter((row) => row.status === 'queued')
  const jobIds = queued.map((row) => row.job_id).filter((id): id is string => typeof id === 'string' && !!id)
  const jobs = jobIds.length ? await getGenerationJobsByIds(jobIds) : []
  const jobById = new Map(jobs.map((job) => [job.id, job]))
  for (const row of queued) {
    const job = row.job_id ? jobById.get(row.job_id) : undefined
    // 마무리는 곡 행을 먼저 끝으로 적고 작업을 끝낸다 — 작업만 끝난 행은 손으로 고친 경우뿐이지만, 남겨 두면 화면이 끝난 작업을 다시 지켜보며
    //   목록을 끝없이 다시 읽는다. 작업의 결과 주소로 곡을 끝으로 옮겨 적는다.
    if (job?.status === 'completed' && job.result_url) {
      row.status = 'completed'
      row.url = job.result_url
      const { error: healError } = await supabaseAdmin
        .from('editor_music')
        .update({ status: 'completed', url: job.result_url, error: null, completed_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('project_id', projectId)
        .eq('status', 'queued')
      if (healError) console.error('[editor-music] mark completed:', row.id, healError.message)
      continue
    }
    let code: MusicFailureCode | null = null
    if (job?.status === 'failed') code = musicFailureCode(job.error)
    else if (!job && now - Date.parse(row.created_at) > STALE_QUEUED_VIDEO_MS) code = 'timed_out'
    if (!code) continue
    row.status = 'failed'
    row.error = code
    await markEditorMusicFailed(projectId, row.id, code)
  }
  return rows.map(toMusicItem)
}
