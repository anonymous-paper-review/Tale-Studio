import { NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/api/guard'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  recordWriterObservabilityEvent,
  WRITER_OBSERVABILITY_EVENTS,
  type WriterObservabilityEvent,
} from '@/lib/writer/debug-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROJECT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200
const EVENT_SET = new Set<string>(WRITER_OBSERVABILITY_EVENTS)

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const projectId = params.get('projectId') ?? ''
  if (!PROJECT_UUID_RE.test(projectId)) {
    return NextResponse.json(
      { ok: false, error: { code: 'bad_request', message: 'invalid projectId' } },
      { status: 400 },
    )
  }

  const parsedLimit = Number.parseInt(params.get('limit') ?? '', 10)
  const limit =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT

  const access = await requireProjectAccess(req, projectId, { allowShare: false })
  if (!access.ok) return access.response

  try {
    const { data, error } = await supabaseAdmin
      .from('writer_observability_events')
      .select('id, project_id, run_id, generation_job_id, event, payload, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error

    return NextResponse.json({ ok: true, data: { events: data ?? [] } })
  } catch (error) {
    console.error(
      '[writer/debug-events]',
      error instanceof Error ? error.message : String(error),
    )
    return NextResponse.json(
      { ok: false, error: { code: 'internal', message: 'failed to load debug events' } },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    projectId?: unknown
    event?: unknown
    payload?: unknown
    runId?: unknown
    generationJobId?: unknown
  } | null
  const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
  const event = typeof body?.event === 'string' ? body.event : ''
  const runId = typeof body?.runId === 'string' ? body.runId : null
  const generationJobId =
    typeof body?.generationJobId === 'string' ? body.generationJobId : null
  if (
    !PROJECT_UUID_RE.test(projectId) ||
    !EVENT_SET.has(event) ||
    (runId !== null && !PROJECT_UUID_RE.test(runId)) ||
    (generationJobId !== null && !PROJECT_UUID_RE.test(generationJobId)) ||
    (body?.payload !== undefined &&
      (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)))
  ) {
    return NextResponse.json(
      { ok: false, error: { code: 'bad_request', message: 'invalid observability event' } },
      { status: 400 },
    )
  }

  const access = await requireProjectAccess(req, projectId, { allowShare: false })
  if (!access.ok) return access.response

  await recordWriterObservabilityEvent(
    projectId,
    event as WriterObservabilityEvent,
    body?.payload as Record<string, unknown> | undefined,
    {
      runId,
      generationJobId,
    },
  )
  return NextResponse.json({ ok: true })
}
