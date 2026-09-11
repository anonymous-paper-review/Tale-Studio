import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Json, Tables } from '@/types/database'
import { getGenerationJobById } from '@/lib/generation-jobs'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'
import { continueVideoBatch } from '@/lib/director/batch-continue'
import { reserveVideoBatchItem } from '@/lib/director/batch-store'
import {
  submitPreparedDirectorVideo,
  type PreparedDirectorVideoSubmission,
} from '@/lib/director/video-submit'

async function readPages<T>(
  page: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  while (true) {
    const { data, error } = await page(rows.length)
    if (error) throw new Error(error.message)
    if (!data?.length) return rows
    rows.push(...data)
  }
}

/** #batch-resume: 웹훅 유실과 첫 실행 유실을 모두 회수한다. 중단한 묶음의 접수분도 수집한다. */
export async function recoverVideoBatches() {
  const [running, queued] = await Promise.all([
    readPages((offset) => supabaseAdmin.from('director_video_batches').select('id')
      .eq('status', 'running').order('id').range(offset, offset + 499)),
    readPages((offset) => supabaseAdmin.from('generation_jobs').select('id, batch_id')
      .eq('kind', 'shot_video').eq('status', 'queued').not('batch_id', 'is', null)
      .order('id').range(offset, offset + 499)),
  ])
  const ids = new Set(running.map((row) => row.id))
  const jobsByBatch = new Map<string, string[]>()
  for (const row of queued) {
    if (!row.batch_id) continue
    ids.add(row.batch_id)
    const jobs = jobsByBatch.get(row.batch_id) ?? []
    jobs.push(row.id)
    jobsByBatch.set(row.batch_id, jobs)
  }
  const result = { checked: 0, submitted: 0, failed: 0 }
  if (!ids.size) return result

  // 아직 실행 중이거나 접수한 영상이 남은 묶음만 순환한다. 오래된 중단 기록이 앞을 막지 않는다.
  const batchIds = [...ids]
  const batches: Array<Pick<Tables<'director_video_batches'>, 'id' | 'project_id' | 'user_id' | 'status' | 'updated_at'>> = []
  for (let start = 0; start < batchIds.length; start += 100) {
    const { data, error } = await supabaseAdmin.from('director_video_batches')
      .select('id, project_id, user_id, status, updated_at').in('id', batchIds.slice(start, start + 100))
    if (error) throw new Error(error.message)
    batches.push(...data ?? [])
  }
  batches.sort((a, b) => a.updated_at.localeCompare(b.updated_at))
  for (const batch of batches.slice(0, 50)) {
    result.checked += 1
    for (const jobId of jobsByBatch.get(batch.id) ?? []) {
      try {
        let job = await getGenerationJobById(jobId)
        if (!job || job.status !== 'queued' || job.batch_id !== batch.id) continue
        if (job.request_id.startsWith('reserved:')) {
          const { data: item, error: itemError } = await supabaseAdmin.from('director_video_batch_items')
            .select('id, job_id, status, prepared, submission_response')
            .eq('batch_id', batch.id).eq('job_id', job.id).maybeSingle()
          if (itemError) throw new Error(itemError.message)
          const response = item?.submission_response
          const receipt = response && typeof response === 'object' && !Array.isArray(response)
            ? response.recoveryReceipt : null
          if (item && item.status === 'submitted' && typeof receipt === 'string') {
            const prepared = item.prepared
            if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)
              || prepared.projectId !== job.project_id || prepared.idempotencyKey !== item.id
              || prepared.ownerId !== batch.user_id || prepared.videoClipId != null || prepared.standalone === true) {
              throw new Error('Stored batch recovery input does not match its job')
            }
            const recovered = await submitPreparedDirectorVideo(
              prepared as unknown as PreparedDirectorVideoSubmission,
              {
                recoveryReceipt: receipt,
                batchRecoveryId: batch.id,
                reserve: (input) => reserveVideoBatchItem(item.id, crypto.randomUUID(), input),
              },
            )
            if (!recovered.ok) {
              const detail: unknown = await recovered.json().catch(() => null)
              if (detail && typeof detail === 'object' && !Array.isArray(detail)
                && 'recoveryReceipt' in detail && typeof detail.recoveryReceipt === 'string') {
                const { error: saveError } = await supabaseAdmin.from('director_video_batch_items').update({
                  submission_response: { ...response as object, ...detail } as Json,
                }).eq('id', item.id).eq('job_id', job.id)
                if (saveError) throw new Error(saveError.message)
              }
              result.failed += 1
              continue
            }
            job = await getGenerationJobById(jobId)
            if (!job || job.status !== 'queued') continue
          }
        }
        // 나이를 기준으로 하는 유령 청소가 아니다. 방금 제출 중인 예약을 실패로 만들면 안 된다.
        await reconcileJobFromFal(job, { settleStaleReserved: false })
      } catch (error) {
        result.failed += 1
        console.error('[video-batches] job recovery failed:', jobId, error instanceof Error ? error.message : error)
      }
    }
    try {
      if (batch.status === 'running') {
        const next = await continueVideoBatch({ batchId: batch.id, projectId: batch.project_id })
        result.submitted += next.submitted
      }
    } catch (error) {
      result.failed += 1
      console.error('[video-batches] batch recovery failed:', batch.id, error instanceof Error ? error.message : error)
    }
    const { error: touchedError } = await supabaseAdmin.from('director_video_batches')
      .update({ updated_at: new Date().toISOString() }).eq('id', batch.id)
    if (touchedError) {
      result.failed += 1
      console.error('[video-batches] recovery timestamp failed:', touchedError.message)
    }
  }
  return result
}
