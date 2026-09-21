import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import { parseInspection } from '@/lib/chat-tools/inspect'
import { loadProjectInspection } from '@/lib/chat-tools/inspect-server'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { stage, ...value } = await req.json()
    const input = parseInspection(value, stage)
    if (!input) return NextResponse.json({ error: 'Invalid inspection target' }, { status: 400 })
    if (!await userOwnsProject(id, user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { result } = await loadProjectInspection(id, input)
    // URLs and image bytes are resolved again on the server's model boundary.
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Project evidence could not be read. Its absence has not been established.' }, { status: 503 })
  }
}
