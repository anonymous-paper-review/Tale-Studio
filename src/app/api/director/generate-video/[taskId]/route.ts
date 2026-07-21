import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import {
  getGenerationJobByRequestId,
  userOwnsProject,
} from '@/lib/generation-jobs'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'


export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    let job = await getGenerationJobByRequestId(taskId)
    if (!job) return NextResponse.json({ error: 'Video job not found' }, { status: 404 })
    if (!(await userOwnsProject(job.project_id, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (job.status === 'queued') job = await reconcileJobFromFal(job)

    if (job.status === 'completed') {
      return NextResponse.json({ status: 'completed', url: job.result_url })
    }
    if (job.status === 'failed') {
      return NextResponse.json({ status: 'failed', error: job.error ?? 'Video generation failed' })
    }
    return NextResponse.json({ status: 'generating' })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/generate-video/poll]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
