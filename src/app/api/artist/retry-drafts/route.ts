import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { triggerAssetDrafts } from '@/lib/artist/draft-trigger'
import {
  STALE_QUEUED_MS,
  countQueuedJobsByUser,
  userOwnsProject,
} from '@/lib/generation-jobs'
import { MAX_QUEUED_JOBS_PER_USER, quotaExceededBody } from '@/lib/generation-quota'

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

async function countQueuedJobsForQuota(userId: string): Promise<number> {
  try {
    return await countQueuedJobsByUser(userId)
  } catch {
    // Match checkUserQuota's fail-open convention: quota telemetry failure must not block recovery.
    return 0
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid body' }, { status: 400 })
    }

    const parsed = BodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const { projectId } = parsed.data

    if (!(await userOwnsProject(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const queuedForUser = await countQueuedJobsForQuota(user.id)
    if (queuedForUser >= MAX_QUEUED_JOBS_PER_USER) {
      return NextResponse.json(
        quotaExceededBody({ ok: false, queued: queuedForUser, limit: MAX_QUEUED_JOBS_PER_USER }),
        { status: 429 },
      )
    }

    const queuedDrafts = await countFreshQueuedDraftJobs(projectId)
    if (queuedDrafts > 0) {
      return NextResponse.json(
        {
          error: 'draft image generation already queued',
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
