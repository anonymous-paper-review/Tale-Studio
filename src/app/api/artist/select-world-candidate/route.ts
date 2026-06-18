// 월드 후보 이미지 선택본 교체 — location_image_candidates 선택본 flip + locations 컬럼 미러(C4 AC18, 캐릭터 대칭).
//   인증: getUser() 필수. 소유권: project → workspace → user (assertWorkspaceAccess).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { assertWorkspaceAccess } from '@/lib/inventory'

export const runtime = 'nodejs'

// 클라 view 키('wideShot'|'establishingShot') / DB view·locations 컬럼('wide_shot'|'establishing_shot') 양쪽 수용.
const WORLD_VIEW_COLUMN: Record<string, 'wide_shot' | 'establishing_shot'> = {
  wideShot: 'wide_shot',
  establishingShot: 'establishing_shot',
  wide_shot: 'wide_shot',
  establishing_shot: 'establishing_shot',
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, locationId, view, candidateId } = (await req.json()) as {
      projectId?: string
      locationId?: string
      view?: string
      candidateId?: string
    }
    if (!projectId || !locationId || !view || !candidateId) {
      return NextResponse.json(
        { error: 'projectId, locationId, view, candidateId required' },
        { status: 400 },
      )
    }
    const column = WORLD_VIEW_COLUMN[view]
    if (!column) return NextResponse.json({ error: `invalid view: ${view}` }, { status: 400 })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .single()
    if (!project?.workspace_id) {
      return NextResponse.json({ error: 'project not found' }, { status: 404 })
    }
    const allowed = await assertWorkspaceAccess(project.workspace_id as string, user.id)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: candidate } = await supabaseAdmin
      .from('location_image_candidates')
      .select('id, url')
      .eq('id', candidateId)
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .eq('view', column)
      .maybeSingle()
    if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 })

    // 슬롯의 기존 선택본 해제 → 대상만 선택.
    const { error: clearError } = await supabaseAdmin
      .from('location_image_candidates')
      .update({ is_selected: false })
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .eq('view', column)
      .eq('is_selected', true)
    if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 })

    const { error: selectError } = await supabaseAdmin
      .from('location_image_candidates')
      .update({ is_selected: true })
      .eq('id', candidateId)
    if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 })

    // locations 컬럼 미러.
    const { error: mirrorError } = await supabaseAdmin
      .from('locations')
      .update({ [column]: candidate.url })
      .eq('project_id', projectId)
      .eq('location_id', locationId)
    if (mirrorError) return NextResponse.json({ error: mirrorError.message }, { status: 500 })

    return NextResponse.json({ ok: true, url: candidate.url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/select-world-candidate]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
