import { canUseReference, getPlanLimit } from '@/lib/plan-limits'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAdminWorkspaceOwner } from '@/lib/admin'
import { NextResponse } from 'next/server'
import { pickProjectThumbnails, type ThumbnailCharacterRow, type ThumbnailShotRow } from '@/lib/project-thumbnail'

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
      .select('id, plan, owner_id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!workspace) {
      return NextResponse.json({
        projects: [],
        plan: 'free',
        slotLimit: getPlanLimit(null),
        canUseReference: canUseReference(null),
      })
    }

    const plan = workspace.plan || 'free'
    const isAdmin = isAdminWorkspaceOwner(user, workspace.owner_id)
    const slotLimit = isAdmin ? null : getPlanLimit(plan)
    const referenceEnabled = canUseReference(plan)

    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, title, current_stage, updated_at')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false })

    // 대표 썸네일(#landing-v2b 2026-08-03) — 이름만으로는 프로젝트 구별이 어렵다.
    //   우선순위: 실사 스토리보드 > 러프 보드 start 프레임 > 캐릭터 대표 이미지 > null(카드가
    //   그라디언트 폴백). 배치 2쿼리(shots·characters) 후 프로젝트별 첫 장 선택 — 목록 규모
    //   (수십 프로젝트 × 샷 JSONB 포인터)에서 충분히 가볍다.
    const ids = (projects ?? []).map((p) => p.id)
    let thumbnails = new Map<string, string>()
    if (ids.length > 0) {
      // 인물 컬럼은 portrait(얼굴 크롭)다 — 2026-09-09 동업자 실측: 없는 컬럼 portrait_url 을 골라 PostgREST 가 undefined 를
      //   돌려주고 항상 설정 시트(view_main)로 떨어졌다(에러 없이). 고르는 규칙은 lib/project-thumbnail.ts(순수).
      const [{ data: shots }, { data: chars }] = await Promise.all([
        supabaseAdmin
          .from('shots')
          .select('project_id, sort_order, storyboard_image, rough_storyboard')
          .in('project_id', ids)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('characters')
          .select('project_id, portrait, view_main')
          .in('project_id', ids),
      ])
      thumbnails = pickProjectThumbnails(
        (shots ?? []) as ThumbnailShotRow[],
        (chars ?? []) as ThumbnailCharacterRow[],
      )
    }

    return NextResponse.json({
      projects: (projects ?? []).map((p) => ({
        ...p,
        thumbnail_url: thumbnails.get(p.id) ?? null,
      })),
      plan,
      slotLimit,
      unlimitedProjects: isAdmin,
      canUseReference: referenceEnabled,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/list]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
