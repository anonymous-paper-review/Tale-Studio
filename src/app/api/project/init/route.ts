import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    // 1. Get default workspace
    const { data: workspace, error: wsErr } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('slug', 'default')
      .single()

    if (wsErr || !workspace) {
      return NextResponse.json(
        { error: 'Default workspace not found' },
        { status: 500 },
      )
    }

    // 2. Get latest project in workspace, or create one
    const { data: existing } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json({
        workspaceId: workspace.id,
        projectId: existing.id,
        project: existing,
      })
    }

    const { data: created, error: createErr } = await supabaseAdmin
      .from('projects')
      .insert({ workspace_id: workspace.id, title: 'Untitled' })
      .select()
      .single()

    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message ?? 'Failed to create project' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      workspaceId: workspace.id,
      projectId: created.id,
      project: created,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/init]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
