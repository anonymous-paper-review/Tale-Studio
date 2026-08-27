import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import { isChatTraceId, type ChatTrace } from '@/lib/chat-trace'
import {
  getChatTrace,
  patchChatTrace,
  upsertChatTrace,
  type ChatTracePatch,
} from '@/lib/chat-trace-server'

const PATCH_FIELDS = [
  'durationMs',
  'inputTokens',
  'outputTokens',
  'cacheReadInputTokens',
  'cacheCreationInputTokens',
  'stopReason',
  'parseStatus',
  'rawUpdateCount',
  'validUpdateCount',
  'appliedCount',
  'skippedCount',
  'pendingProposal',
  'choicesMarkerFound',
  'choicesCount',
  'generationHttpStatus',
  'jobId',
  'generationStatus',
  'requestStatus',
  'error',
] as const

function pickPatch(value: unknown): ChatTracePatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const key of PATCH_FIELDS) {
    if (source[key] !== undefined) patch[key] = source[key]
  }
  return patch as ChatTracePatch
}

async function assertProjectAccess(projectId: unknown) {
  const user = await getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return { response: NextResponse.json({ error: 'projectId is required' }, { status: 400 }) }
  }
  if (!(await userOwnsProject(projectId, user.id))) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, projectId }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const access = await assertProjectAccess(searchParams.get('projectId'))
    if ('response' in access) return access.response
    const traceId = searchParams.get('traceId')
    if (traceId && !isChatTraceId(traceId)) {
      return NextResponse.json({ error: 'traceId must be a UUID' }, { status: 400 })
    }
    const trace = await getChatTrace(access.projectId, traceId)
    return NextResponse.json({ trace })
  } catch (error) {
    console.error('[chat/trace] GET failed:', error)
    return NextResponse.json({ error: 'Unable to load chat trace' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: unknown
      trace?: unknown
      traceId?: unknown
      patch?: unknown
    }
    const access = await assertProjectAccess(body.projectId)
    if ('response' in access) return access.response

    if (body.trace !== undefined) {
      if (!body.trace || typeof body.trace !== 'object' || Array.isArray(body.trace)) {
        return NextResponse.json({ error: 'trace must be an object' }, { status: 400 })
      }
      const trace = body.trace as ChatTrace
      if (!isChatTraceId(trace.traceId)) {
        return NextResponse.json({ error: 'trace.traceId must be a UUID' }, { status: 400 })
      }
      await upsertChatTrace(access.projectId, trace)
      return NextResponse.json({ ok: true })
    }

    if (!isChatTraceId(body.traceId)) {
      return NextResponse.json({ error: 'traceId must be a UUID' }, { status: 400 })
    }
    const patch = pickPatch(body.patch)
    if (!patch) return NextResponse.json({ error: 'patch must be an object' }, { status: 400 })
    await patchChatTrace(access.projectId, body.traceId, patch)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[chat/trace] POST failed:', error)
    return NextResponse.json({ error: 'Unable to save chat trace' }, { status: 500 })
  }
}
