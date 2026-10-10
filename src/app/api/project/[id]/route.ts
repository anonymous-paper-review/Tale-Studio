import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { deleteProjectDeep } from '@/lib/project/delete-project'
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

    // 보관함 파일 + 자식 14테이블 + 본체를 함께 지운다(개인정보 처리방침 §1 — 프로젝트를 지우면
    // 그 자료도 지운다). 규칙은 src/lib/project/delete-project.ts 한 곳에 있고, 계정 삭제
    // (/api/account/delete)가 같은 함수를 사용자의 모든 프로젝트에 반복한다.
    const result = await deleteProjectDeep({ projectId: id, userId: user.id })

    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (result.status === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/delete]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
