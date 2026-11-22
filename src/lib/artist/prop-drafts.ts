// 소품 그림 서버 첫 그림(D7 · 리드 결정 2, 2026-11-22) — [만들기]의 인물 · 배경 첫 그림(draft-trigger) 다음에 그림 없는 소품을 그린다.
//   빈칸만(멱등): 그림이 있거나 · 그리는 중이거나 · 같은 소품 실패가 상한에 닿았으면 건너뛴다. 자리가 없으면 건너뛰고 기록을 남긴다 —
//   화면이 인물 · 배경을 다 그린 뒤 이어 그린다(artist-store continueMissingProps). 각 소품의 실패는 흡수한다(자동 재시도 없음).
//   service-role 전용. 약속: tests/artist/prop-drafts.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import { countFailedJobsForTarget, AUTO_GENERATION_GIVE_UP_THRESHOLD } from '@/lib/generation-jobs'
import { resolveStyleAnchor } from '@/lib/style-anchor'
import { styleDrawsWithoutReference } from '@/lib/style-facets/reference-image'
import { assertUserTextAllowed } from '@/lib/moderation/creem'
import { recordWriterObservabilityEvent } from '@/lib/writer/debug-events'
import { styleIdOf } from '@/lib/series/snapshot'
import { propImageStamp } from '@/lib/artist/prop-image'
import { planPropImageSubmit } from '@/lib/artist/prop-image-plan'
import { hasQueuedPropImageJob, submitPropImageJob } from '@/lib/artist/prop-jobs'

export interface PropDraftResult {
  submitted: number
  skipped: number
  failed: number
}

export async function triggerPropDrafts(projectId: string): Promise<PropDraftResult> {
  const result: PropDraftResult = { submitted: 0, skipped: 0, failed: 0 }
  try {
    const [{ data: props }, { data: project }] = await Promise.all([
      supabaseAdmin.from('props').select('prop_id, name, appearance, image_url').eq('project_id', projectId).is('image_url', null),
      supabaseAdmin.from('projects').select('workspace_id, style_anchor_key, custom_style_anchor, settings').eq('id', projectId).maybeSingle(),
    ])
    const rows = ((props ?? []) as Array<{ prop_id: string; name: string; appearance: string | null; image_url: string | null }>).filter((row) => !row.image_url)
    if (!rows.length || !project) return result
    const anchor = await resolveStyleAnchor(project as Parameters<typeof resolveStyleAnchor>[0])
    const styleWithoutReference = !anchor && (await styleDrawsWithoutReference(project as Parameters<typeof styleDrawsWithoutReference>[0]))
    const styleId = styleIdOf(project as { style_anchor_key?: string | null; custom_style_anchor?: unknown })
    const workspaceId = (project as { workspace_id: string }).workspace_id
    for (const row of rows) {
      if (await hasQueuedPropImageJob(projectId, row.prop_id)) {
        result.skipped++
        continue
      }
      if ((await countFailedJobsForTarget(projectId, 'prop_image', { propId: row.prop_id })) >= AUTO_GENERATION_GIVE_UP_THRESHOLD) {
        result.skipped++
        continue
      }
      try {
        const appearance = row.appearance ?? ''
        const plan = planPropImageSubmit({ name: row.name, appearance, anchor, styleWithoutReference })
        const moderation = await assertUserTextAllowed([row.name, appearance], { projectId, kind: 'prop_image', userId: null })
        try {
          const job = await submitPropImageJob({
            projectId,
            propId: row.prop_id,
            plan,
            stamp: propImageStamp(appearance, styleId),
            actor: 'writer',
            userId: null,
            workspaceId,
            styleAnchorKey: anchor?.key ?? null,
            safeMode: false,
            chatTraceId: null,
            moderation,
          })
          await recordWriterObservabilityEvent(projectId, 'fal_submit_accepted', { source: 'writer_v2_design', kind: 'prop_image', propId: row.prop_id, model: job.model, requestId: job.request_id }, { generationJobId: job.id })
          result.submitted++
        } catch (error) {
          if (error instanceof Error && error.name === 'GenerationCapacityError') {
            // 자리가 없어 예약이 거절됐다 — 이 소품은 건너뛰고 다른 소품은 계속한다(화면이 나중에 이어 그린다).
            const capacity = error as Error & { axis?: string; queued?: number; limit?: number }
            result.skipped++
            await recordWriterObservabilityEvent(projectId, 'asset_trigger_blocked', { source: 'writer_v2_design', reason: 'capacity', axis: capacity.axis, queued: capacity.queued, limit: capacity.limit, kind: 'prop_image', propId: row.prop_id })
            continue
          }
          throw error
        }
      } catch (error) {
        result.failed++
        await recordWriterObservabilityEvent(projectId, 'route_failed', { source: 'writer_v2_design', kind: 'prop_image', propId: row.prop_id, error: error instanceof Error ? error.message : String(error) })
        console.error(`[prop-drafts] ${projectId}/${row.prop_id} submit failed:`, error instanceof Error ? error.message : error)
      }
    }
  } catch (error) {
    console.error(`[prop-drafts] ${projectId} failed:`, error instanceof Error ? error.message : error)
  }
  return result
}
