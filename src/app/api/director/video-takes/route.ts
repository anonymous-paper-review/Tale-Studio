import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import { listLiveDirectorVideoTakes } from '@/lib/director-video-takes'

export const runtime = 'nodejs'

function hydratedStatus(status: string | null): string | null {
  if (!status) return null
  return status === 'queued' || status === 'processing' ? 'generating' : status
}

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await userOwnsProject(projectId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const takes = await listLiveDirectorVideoTakes(projectId)
    return NextResponse.json({ takes: takes.map(take => ({
      ...take,
      updated_at: take.updated_at ?? take.created_at ?? null,
      latestJobId: take.last_attempt_job_id ?? null,
      latestJobStatus: hydratedStatus(take.last_attempt_status ?? null),
      latestJobError: take.last_attempt_error ?? null,
      latestAttemptAt: take.last_attempt_at ?? null,
    })) })
  } catch (error) {
    console.error('[director/video-takes]', error)
    return NextResponse.json({ error: 'Unable to load video takes' }, { status: 500 })
  }
}
