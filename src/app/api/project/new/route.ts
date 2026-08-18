import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { parseAppLocale } from '@/lib/locale'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 이름 지정 팝업(#a1)이 title을 보낸다. body 없는 기존 호출은 'Untitled' 유지.
    const body = await req.json().catch(() => null)
    const title =
      (typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '') ||
      'Untitled'

    // Find workspace for this user
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 },
      )
    }

    // Create new project.
    //   locale (#i18n-s5): 생성 시점의 사용자 언어 설정(기본 en)을 콘텐츠 언어로 박아 잠근다 —
    //   파이프라인 출력 강제·공유 뷰 표시가 이 값을 따른다. locked 라 writer/start 의
    //   스토리 감지는 이 프로젝트에 손대지 않는다(감지는 설정 이전 레거시 전용 폴백).
    const locale = parseAppLocale(user.user_metadata?.locale) ?? 'en'
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .insert({ workspace_id: workspace.id, title, locale, locale_locked: true })
      .select()
      .single()

    if (error || !project) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to create project' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      workspaceId: workspace.id,
      projectId: project.id,
      project,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/new]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
