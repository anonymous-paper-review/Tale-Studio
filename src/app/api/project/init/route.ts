import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const requestedId = new URL(req.url).searchParams.get('projectId')

    // 1. Get authenticated user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Find or create workspace for this user
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    let workspaceId: string

    if (workspace) {
      workspaceId = workspace.id
    } else {
      const name = user.user_metadata?.full_name || user.email || 'My Studio'
      const slug = user.id.slice(0, 8)

      const { data: created, error: wsErr } = await supabaseAdmin
        .from('workspaces')
        .insert({ name, slug, owner_id: user.id })
        .select('id')
        .single()

      if (wsErr || !created) {
        return NextResponse.json(
          { error: wsErr?.message ?? 'Failed to create workspace' },
          { status: 500 },
        )
      }
      workspaceId = created.id
    }

    // 3a. URL ?projectId 힌트가 있으면 워크스페이스 범위로 그 프로젝트 복원
    if (requestedId) {
      const { data: requested } = await supabaseAdmin
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', requestedId)
        .maybeSingle()

      if (requested) {
        return NextResponse.json({
          workspaceId,
          projectId: requested.id,
          project: requested,
        })
      }
      // 없거나 권한 밖이면 아래 최신 fallback
    }

    // 3b. Find latest project in workspace, or create one
    const { data: existing } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json({
        workspaceId,
        projectId: existing.id,
        project: existing,
      })
    }

    const { data: created, error: createErr } = await supabaseAdmin
      .from('projects')
      .insert({ workspace_id: workspaceId, title: 'Untitled' })
      .select()
      .single()

    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message ?? 'Failed to create project' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      workspaceId,
      projectId: created.id,
      project: created,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/init]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
