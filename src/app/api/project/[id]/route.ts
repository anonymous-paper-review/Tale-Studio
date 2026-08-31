import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { parseAppLocale } from '@/lib/locale'
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

    const { title, locale } = await req.json()
    // locale (#chat-locale-follow 2026-08-31) — 보드의 채팅 언어 배지가 명시 전환으로 쓴다.
    //   명시 선택이므로 잠근다(발화 추종·스토리 감지가 더는 안 건드린다).
    const parsedLocale = locale === undefined ? null : parseAppLocale(locale)
    if (locale !== undefined && !parsedLocale) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
    }
    if (!title?.trim() && !parsedLocale) {
      return NextResponse.json({ error: 'Title or locale required' }, { status: 400 })
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (title?.trim()) patch.title = title.trim()
    if (parsedLocale) {
      patch.locale = parsedLocale
      patch.locale_locked = true
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .update(patch)
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
