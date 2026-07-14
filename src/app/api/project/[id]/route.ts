import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

// 이 프로젝트가 요청 유저 소유(workspace owner)인지 확인. 아니면 4xx 응답 반환.
async function assertOwnership(projectId: string, userId: string) {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, workspace_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const { data: workspace } = await supabaseAdmin
    .from('workspaces')
    .select('owner_id')
    .eq('id', project.workspace_id)
    .maybeSingle()
  if (workspace?.owner_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const forbidden = await assertOwnership(id, user.id)
    if (forbidden) return forbidden

    const { title } = await req.json()
    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .update({ title: title.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ project: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/patch]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const forbidden = await assertOwnership(id, user.id)
    if (forbidden) return forbidden

    // FK-safe 전체 삭제 (CASCADE 없음) — scripts/reset-to-producer.mjs 의 wipe 순서를
    // 프로젝트 전체 삭제로 확장한 것. 순서 근거:
    //   projects.last_writer_run_id → writer_runs FK 를 먼저 끊고, leaf 자식부터 지운 뒤
    //   locations(→writer_runs FK) 다음에 writer_runs, 마지막에 projects.
    //   Storage 파일(버킷 이미지/영상)은 남는다 — 경로가 projectId 기반이라 재사용 충돌 없음.
    await supabaseAdmin
      .from('projects')
      .update({ last_writer_run_id: null })
      .eq('id', id)

    const childTables = [
      'character_image_candidates',
      'location_image_candidates',
      'editor_states',
      'video_clips',
      'subtext_notes',
      'generation_jobs',
      'camera_light_presets',
      'shots',
      'scenes',
      'locations',
      'character_relationships',
      'characters',
      'writer_runs',
      'messages',
    ]
    for (const table of childTables) {
      const { error: childErr } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('project_id', id)
      if (childErr) {
        return NextResponse.json(
          { error: `${table}: ${childErr.message}` },
          { status: 500 },
        )
      }
    }

    const { error } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/delete]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
