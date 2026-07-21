import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import {
  listLiveDirectorVideoTakes,
  setDirectorVideoFinal,
  softDeleteDirectorVideoTake,
  updateDirectorVideoTakeMetadata,
} from '@/lib/director-video-takes'

export const runtime = 'nodejs'
function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isCanvasPosition(value: unknown): value is { x: number; y: number } {
  return isPlainJsonObject(value) &&
    Object.keys(value).length === 2 &&
    Object.prototype.hasOwnProperty.call(value, 'x') &&
    Object.prototype.hasOwnProperty.call(value, 'y') &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
}


type Context = { params: Promise<{ clipId: string }> }
type Authorization = { projectId: string } | { error: NextResponse }


async function authorize(projectId: unknown): Promise<Authorization> {
  if (typeof projectId !== 'string' || !projectId) return { error: NextResponse.json({ error: 'projectId is required' }, { status: 400 }) }
  const user = await getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await userOwnsProject(projectId, user.id))) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { projectId }
}

async function liveTake(projectId: string, clipId: string) {
  return (await listLiveDirectorVideoTakes(projectId)).find(take => take.id === clipId) ?? null
}
const COMPATIBILITY_CONFLICT_MESSAGES = new Set([
  'live clip does not belong to project',
  'live clip with URL does not belong to project',
  'clip already has a queued attempt',
])

function isStateConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { status, statusCode, code, message } = error as {
    status?: unknown
    statusCode?: unknown
    code?: unknown
    message?: unknown
  }
  if (status === 409 || statusCode === 409 || code === 409 || code === '409') return true
  return typeof message === 'string' && COMPATIBILITY_CONFLICT_MESSAGES.has(message)
}

export async function PATCH(req: Request, { params }: Context) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const authorized = await authorize(body.projectId)
  if ('error' in authorized) return authorized.error
  const { clipId } = await params
  const allowed = new Set(['projectId', 'take_label', 'override', 'canvas_position', 'is_final'])
  if (Object.keys(body).some(key => !allowed.has(key))) {
    return NextResponse.json({ error: 'Only take_label, override, canvas_position, and is_final may be changed' }, { status: 400 })
  }
  if (!Object.keys(body).some(key => key !== 'projectId')) {
    return NextResponse.json({ error: 'No mutable fields supplied' }, { status: 400 })
  }
  const final = body.is_final
  if ('is_final' in body && typeof final !== 'boolean') {
    return NextResponse.json({ error: 'is_final must be a boolean' }, { status: 400 })
  }

  const metadata = {
    ...(Object.prototype.hasOwnProperty.call(body, 'take_label') ? { take_label: body.take_label as string | null } : {}),
    ...(Object.prototype.hasOwnProperty.call(body, 'override') ? { override: body.override as never } : {}),
    ...(Object.prototype.hasOwnProperty.call(body, 'canvas_position') ? { canvas_position: body.canvas_position as never } : {}),
  }
  if ('is_final' in body && Object.keys(metadata).length) {
    return NextResponse.json({ error: 'is_final cannot be changed with take metadata' }, { status: 400 })
  }
  if ('take_label' in metadata && metadata.take_label !== null && typeof metadata.take_label !== 'string') {
    return NextResponse.json({ error: 'take_label must be a string or null' }, { status: 400 })
  }
  if ('override' in metadata && metadata.override !== null && !isPlainJsonObject(metadata.override)) {
    return NextResponse.json({ error: 'override must be a plain JSON object or null' }, { status: 400 })
  }
  if ('canvas_position' in metadata && metadata.canvas_position !== null && !isCanvasPosition(metadata.canvas_position)) {
    return NextResponse.json({ error: 'canvas_position must be null or a finite {x,y} object' }, { status: 400 })
  }

  try {
    if (!(await liveTake(authorized.projectId, clipId))) {
      return NextResponse.json({ error: 'Video take not found' }, { status: 404 })
    }
    if (Object.keys(metadata).length) await updateDirectorVideoTakeMetadata(authorized.projectId, clipId, metadata)
    if (typeof final === 'boolean') await setDirectorVideoFinal(authorized.projectId, clipId, final)
    const take = await liveTake(authorized.projectId, clipId)
    if (!take) return NextResponse.json({ error: 'Video take not found' }, { status: 404 })
    return NextResponse.json({ take })
  } catch (error) {
    console.error('[director/video-takes]', error)
    const conflict = isStateConflict(error)
    return NextResponse.json(
      { error: conflict ? 'Video take update conflicts with current state' : 'Unable to update video take' },
      { status: conflict ? 409 : 500 },
    )
  }
}

export async function DELETE(req: Request, { params }: Context) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!isPlainJsonObject(body) || Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'projectId')) {
    return NextResponse.json({ error: 'DELETE body must contain only projectId' }, { status: 400 })
  }
  const authorized = await authorize(body.projectId)
  if ('error' in authorized) return authorized.error
  const { clipId } = await params

  try {
    const take = await liveTake(authorized.projectId, clipId)
    if (!take) return NextResponse.json({ error: 'Video take not found' }, { status: 404 })
    await softDeleteDirectorVideoTake(authorized.projectId, clipId)
    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('[director/video-takes]', error)
    const conflict = isStateConflict(error)
    return NextResponse.json(
      { error: conflict ? 'Video take deletion conflicts with current state' : 'Unable to delete video take' },
      { status: conflict ? 409 : 500 },
    )
  }
}
