import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)
      .single()

    if (!workspace) {
      return NextResponse.json({ projects: [] })
    }

    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, title, current_stage, updated_at')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false })

    return NextResponse.json({ projects: projects ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/list]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
