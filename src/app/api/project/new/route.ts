import { randomUUID } from 'node:crypto'
import { getPlanLimit } from '@/lib/plan-limits'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ensureWorkspace } from '@/lib/supabase/workspace'
import { parseAppLocale } from '@/lib/locale'
import { isAdminWorkspaceOwner } from '@/lib/admin'
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
    // 앞 화에 이어진 프로젝트는 [다음 화 만들기](api/project/next-episode)만 만든다. 옛 참고 프로젝트 값은 받지 않는다(2026-10-26).
    // 리뉴얼 1차(2026-10-19): 새 흐름은 Producer 시작 화면(id entry)에서 시작하고, 채팅 · 대사 언어는 사이트 언어를 따른다.
    //   두 값을 보내지 않는 기존 호출은 지금처럼(계정 언어 · 기본 단계) 동작한다.
    const startAtEntry = body?.startAtEntry === true
    const uiLocale = parseAppLocale(body?.uiLocale)

    const workspace = await ensureWorkspace(user)

    const isAdmin = isAdminWorkspaceOwner(user, workspace.owner_id)
    const limit = getPlanLimit(workspace.plan)
    const projectId = randomUUID()

    // Create new project.
    //   locale (#i18n-s5): 생성 시점의 사용자 언어 설정을 콘텐츠 언어로 박는다 —
    //   파이프라인 출력 강제·공유 뷰 표시가 이 값을 따른다.
    //   잠금(#chat-locale-follow 2026-08-31): 계정에 설정이 있을 때만 잠근다. 설정 없는 계정의
    //   'en' 은 선택이 아니라 폴백이다 — 이걸 잠그면 한국어로 말 거는 사용자의 채팅이 영어로
    //   고착된다(실사고). unlocked 로 두면 producer 채팅의 발화 언어 추종과 writer/start 의
    //   스토리 감지가 사용자 실제 언어로 확정한다.
    const userLocale = parseAppLocale(user.user_metadata?.locale)
    const locale = uiLocale ?? userLocale ?? 'en'
    // 슬롯 카운트+삽입을 DB 함수 하나로 원자화(#project-lifecycle-rpc 2026-09-01) —
    // 왕복 1회 제거 + 동시 생성이 카운트 게이트를 우회하는 경쟁 봉쇄(워크스페이스 행 잠금).
    // 요금제→한도 매핑은 plan-limits.ts 가 진실원이라 여기서 계산해 넘긴다(null=무제한).
    // RPC 실패·빈 응답은 기존 count 실패와 동일하게 fail-closed.
    const { data: creationData, error } = await supabaseAdmin.rpc(
      'create_project_slotted',
      {
        p_project_id: projectId,
        p_workspace_id: workspace.id,
        p_title: title,
        p_locale: locale,
        p_locale_locked: uiLocale !== null || userLocale !== null,
        p_reference_project_id: null,
        p_slot_limit: isAdmin ? null : limit,
      },
    )
    const creation = creationData as
      | { status?: string; project?: Record<string, unknown> }
      | null

    if (error || !creation || typeof creation !== 'object') {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to create project' },
        { status: 500 },
      )
    }
    if (creation.status === 'slot_limit') {
      return NextResponse.json(
        { error: 'slot_limit', limit, plan: workspace.plan },
        { status: 403 },
      )
    }
    const project = creation.status === 'ok' ? creation.project : null
    if (!project) {
      return NextResponse.json(
        { error: `Failed to create project (${String(creation.status)})` },
        { status: 500 },
      )
    }
    if (startAtEntry) {
      const { error: stageError } = await supabaseAdmin
        .from('projects')
        .update({ current_stage: 'entry' })
        .eq('id', projectId)
      if (stageError) {
        return NextResponse.json({ error: stageError.message }, { status: 500 })
      }
      project.current_stage = 'entry'
    }

    return NextResponse.json({
      workspaceId: workspace.id,
      projectId,
      project,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/new]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
