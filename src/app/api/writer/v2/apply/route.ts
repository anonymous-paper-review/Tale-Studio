import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { isAdminOwnedProject } from '@/lib/admin'
import { getActiveRun } from '@/lib/writer/run-store'
import { applyWriterV2Package } from '@/lib/writer/v2/persist'
import type { PipelineInput } from '@/lib/writer/types/pipeline'
import type { WriterV2Package } from '@/lib/writer/v2/semantic-unit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as { projectId?: string }
    const projectId = body.projectId
    if (!projectId) {
      return NextResponse.json({ error: 'Invalid request: projectId required' }, { status: 400 })
    }
    if (!(await isAdminOwnedProject(user, projectId))) {
      return NextResponse.json({ error: 'Writer V2 is admin-only' }, { status: 403 })
    }

    const run = await getActiveRun(projectId)
    const state = run?.state as
      | { input?: PipelineInput; v2Package?: WriterV2Package }
      | undefined
    const pkg = state?.v2Package
    if (!pkg) {
      return NextResponse.json({ error: 'V2 preview package not found' }, { status: 404 })
    }
    if (
      pkg.status === 'review' ||
      (pkg.user_review.required && pkg.user_review.status !== 'accepted')
    ) {
      return NextResponse.json(
        { error: 'V2 User Review must be accepted before applying downstream' },
        { status: 409 },
      )
    }

    const applied = await applyWriterV2Package(
      projectId,
      pkg,
      state?.input ?? { story: '', writerEngine: 'v2' },
    )
    return NextResponse.json({ ok: true, engine: 'v2', ...applied })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[writer/v2/apply]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
