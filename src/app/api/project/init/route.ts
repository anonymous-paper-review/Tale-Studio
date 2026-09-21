import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ensureWorkspace } from '@/lib/supabase/workspace'
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

    const { id: workspaceId } = await ensureWorkspace(user)

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
