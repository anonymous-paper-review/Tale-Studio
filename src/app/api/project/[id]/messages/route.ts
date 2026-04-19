import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'

// GET: Load messages for a project + stage
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { searchParams } = new URL(req.url)
    const stage = searchParams.get('stage')

    let query = supabaseAdmin
      .from('messages')
      .select('stage, role, content')
      .eq('project_id', id)
      .order('created_at')

    if (stage) query = query.eq('stage', stage)

    const { data } = await query

    return NextResponse.json({ messages: data ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Save a new message
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { stage, role, content } = await req.json()

    if (!stage || !role || !content) {
      return NextResponse.json({ error: 'stage, role, content are required' }, { status: 400 })
    }

    await supabaseAdmin
      .from('messages')
      .insert({ project_id: id, stage, role, content })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
