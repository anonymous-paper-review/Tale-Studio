import { randomUUID } from 'node:crypto'
import { canUseReference, getPlanLimit } from '@/lib/plan-limits'
import {
  copyReferenceAssets,
  prepareReferenceImport,
  ReferenceImportValidationError,
  type ReferenceImportWarning,
  type ReferenceImportSource,
} from '@/lib/reference-import'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
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
    const referenceProjectId =
      typeof body?.referenceProjectId === 'string'
        ? body.referenceProjectId.trim()
        : ''
    const includeLastShotFrame = body?.includeLastShotFrame === true

    // Find workspace for this user
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('id, plan, owner_id')
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

    const isAdmin = isAdminWorkspaceOwner(user, workspace.owner_id)
    const limit = getPlanLimit(workspace.plan)

    if (includeLastShotFrame && !referenceProjectId) {
      return NextResponse.json(
        { error: 'reference_project_required' },
        { status: 400 },
      )
    }
    if (referenceProjectId && !canUseReference(workspace.plan)) {
      return NextResponse.json(
        { error: 'reference_unavailable', plan: workspace.plan },
        { status: 403 },
      )
    }

    const projectId = randomUUID()
    let referenceSource: ReferenceImportSource | null = null
    if (referenceProjectId) {
      referenceSource = await prepareReferenceImport({
        userId: user.id,
        destinationWorkspaceId: workspace.id,
        referenceProjectId,
        destinationProjectId: projectId,
      })
    }

    // Create new project.
    //   locale (#i18n-s5): 생성 시점의 사용자 언어 설정을 콘텐츠 언어로 박는다 —
    //   파이프라인 출력 강제·공유 뷰 표시가 이 값을 따른다.
    //   잠금(#chat-locale-follow 2026-08-31): 계정에 설정이 있을 때만 잠근다. 설정 없는 계정의
    //   'en' 은 선택이 아니라 폴백이다 — 이걸 잠그면 한국어로 말 거는 사용자의 채팅이 영어로
    //   고착된다(실사고). unlocked 로 두면 producer 채팅의 발화 언어 추종과 writer/start 의
    //   스토리 감지가 사용자 실제 언어로 확정한다.
    const userLocale = parseAppLocale(user.user_metadata?.locale)
    const locale = userLocale ?? 'en'
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
        p_locale_locked: userLocale !== null,
        p_reference_project_id: referenceProjectId || null,
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

    let warnings: ReferenceImportWarning[] = []
    if (referenceSource) {
      const copied = await copyReferenceAssets({
        source: referenceSource,
        destinationProjectId: projectId,
        destinationWorkspaceId: workspace.id,
        includeLastShotFrame,
      })
      warnings = copied.warnings
    }

    return NextResponse.json({
      workspaceId: workspace.id,
      projectId,
      project,
      warnings,
    })
  } catch (err) {
    if (err instanceof ReferenceImportValidationError) {
      return NextResponse.json(
        { error: err.code },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/new]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
