import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { isAdminOwnedProject } from '@/lib/admin'
import { getActiveRun, saveRunState } from '@/lib/writer/run-store'
import type { PipelineInput } from '@/lib/writer/types/pipeline'
import type { WriterRunStateBase } from '@/lib/writer/run-store'
import type { WriterV2Package } from '@/lib/writer/v2/semantic-unit'

export const runtime = 'nodejs'

type ReviewAction = 'accept' | 'hold'

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      projectId?: string
      action?: ReviewAction
    }
    const projectId = body.projectId
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }
    if (body.action !== 'accept' && body.action !== 'hold') {
      return NextResponse.json({ error: 'action must be accept or hold' }, { status: 400 })
    }
    if (!(await isAdminOwnedProject(user, projectId))) {
      return NextResponse.json({ error: 'Writer V2 is admin-only' }, { status: 403 })
    }

    const run = await getActiveRun(projectId)
    const state = run?.state as
      | (WriterRunStateBase & {
          input?: PipelineInput
          v2Package?: WriterV2Package
        })
      | undefined
    const pkg = state?.v2Package
    if (!run || !state || !pkg) {
      return NextResponse.json({ error: 'V2 preview package not found' }, { status: 404 })
    }
    if (pkg.status !== 'review' || !pkg.user_review.required) {
      return NextResponse.json({ error: 'V2 package is not awaiting review' }, { status: 409 })
    }

    const current = pkg.attempts.find(
      (attempt) => attempt.attempt === pkg.current_attempt,
    )
    if (!current?.draft?.units?.length) {
      return NextResponse.json(
        { error: 'The current review attempt has no usable semantic units' },
        { status: 409 },
      )
    }

    const decidedAt = new Date().toISOString()
    const nextPackage: WriterV2Package = {
      ...pkg,
      status: body.action === 'accept' ? 'ready' : 'review',
      user_review: {
        ...pkg.user_review,
        status: body.action === 'accept' ? 'accepted' : 'held',
        selected_attempt: body.action === 'accept' ? current.attempt : undefined,
        decided_at: decidedAt,
      },
    }
    const nextState = { ...state, v2Package: nextPackage }
    await saveRunState(
      run.id,
      nextState,
      {
        completed_units: run.completed_units,
        current_stage: run.current_stage,
      },
    )

    return NextResponse.json({
      ok: true,
      action: body.action,
      status: nextPackage.status,
      selectedAttempt: nextPackage.user_review.selected_attempt ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[writer/v2/review]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
