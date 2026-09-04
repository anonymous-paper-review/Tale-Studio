import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { triggerAssetDrafts } from '@/lib/artist/draft-trigger'
import {
  STALE_QUEUED_MS,
  userOwnsProject,
} from '@/lib/generation-jobs'
import { checkGenerationCapacity } from '@/lib/generation-quota'
import { quotaRejectionResponse } from '@/lib/api/quota'

export const runtime = 'nodejs'
export const maxDuration = 60

const BodySchema = z.object({ projectId: z.string().min(1) })

async function countFreshQueuedDraftJobs(projectId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_QUEUED_MS).toISOString()
  const { count, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('kind', ['character_view', 'world_shot'])
    .eq('status', 'queued')
    .gte('created_at', cutoff)

  if (error) throw new Error(error.message ?? 'queued draft query failed')
  return count ?? 0
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const parsed = BodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const { projectId } = parsed.data

    if (!(await userOwnsProject(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 유저 상한 + 전역 fal 슬롯(#global-semaphore). 집계 실패 시 fail-open 은 게이트 안에 있다.
    const quota = await checkGenerationCapacity(user.id, 'image')
    if (!quota.ok) {
      return quotaRejectionResponse(quota, { projectId, kind: 'artist_draft_retry', userId: user.id })
    }

    const queuedDrafts = await countFreshQueuedDraftJobs(projectId)
    if (queuedDrafts > 0) {
      return NextResponse.json(
        {
          error: 'Draft image generation already queued',
          code: 'drafts_already_queued',
          queued_count: queuedDrafts,
        },
        { status: 409 },
      )
    }

    const result = await triggerAssetDrafts(projectId)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/retry-drafts]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
