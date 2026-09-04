import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import {
  createStandaloneDirectorVideoTake,
  listLiveDirectorVideoTakes,
} from '@/lib/director-video-takes'
import {
  createDefaultStandaloneVideoConfig,
  createStandaloneVideoOwnerKey,
} from '@/lib/director/standalone-video'
import type { Json } from '@/types/database'

export const runtime = 'nodejs'

function hydratedStatus(status: string | null): string | null {
  if (!status) return null
  return status === 'queued' || status === 'processing' ? 'generating' : status
}

function isCanvasPosition(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const position = value as Record<string, unknown>
  return Object.keys(position).length === 2
    && Object.hasOwn(position, 'x')
    && Object.hasOwn(position, 'y')
    && typeof position.x === 'number'
    && Number.isFinite(position.x)
    && typeof position.y === 'number'
    && Number.isFinite(position.y)
}

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 })

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

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json() as { projectId?: unknown; canvasPosition?: unknown }
    if (
      !body
      || typeof body !== 'object'
      || Array.isArray(body)
      || typeof body.projectId !== 'string'
      || !body.projectId
      || !isCanvasPosition(body.canvasPosition)
    ) {
      return NextResponse.json({ error: 'Invalid request: projectId and finite canvasPosition {x, y} are required' }, { status: 400 })
    }
    if (!(await userOwnsProject(body.projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const take = await createStandaloneDirectorVideoTake({
      projectId: body.projectId,
      ownerKey: createStandaloneVideoOwnerKey(),
      override: createDefaultStandaloneVideoConfig() as unknown as Json,
      canvasPosition: body.canvasPosition as Json,
    })
    return NextResponse.json({ take })
  } catch (error) {
    console.error('[director/video-takes] standalone create failed', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Unable to create standalone video take' }, { status: 500 })
  }
}
