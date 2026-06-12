// 캐릭터 후보 이미지 선택본 교체 — character_image_candidates에서 선택본 flip + characters 뷰 컬럼 미러.
//   인증: getUser() 필수. 소유권: project → workspace → user.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import {
  CHARACTER_VIEW_KEYS,
  CHARACTER_VIEW_COLUMNS,
  type CharacterViewKey,
} from '@/types/asset'
import { viewKeyToCandidateView } from '@/lib/image-provenance'
import { assertWorkspaceAccess } from '@/lib/inventory'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, characterId, view, candidateId } = (await req.json()) as {
      projectId?: string
      characterId?: string
      view?: CharacterViewKey
      candidateId?: string
    }

    if (!projectId || !characterId || !view || !candidateId) {
      return NextResponse.json(
        { error: 'projectId, characterId, view, candidateId required' },
        { status: 400 },
      )
    }
    if (!CHARACTER_VIEW_KEYS.includes(view)) {
      return NextResponse.json({ error: `invalid view: ${view}` }, { status: 400 })
    }

    // 소유권 확인: project → workspace.owner_id (null-owner Default workspace는 공용 허용).
    //   canonical 가드 재사용 — `eq('owner_id', userId)` 필터 금지(Default workspace 전원 차단됨).
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .single()
    if (!project?.workspace_id) return NextResponse.json({ error: 'project not found' }, { status: 404 })

    const allowed = await assertWorkspaceAccess(project.workspace_id as string, user.id)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 대상 후보 로드 (project + character + view + id 조건)
    const candidateView = viewKeyToCandidateView(view)
    const { data: candidate } = await supabaseAdmin
      .from('character_image_candidates')
      .select('id, url')
      .eq('id', candidateId)
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('view', candidateView)
      .maybeSingle()
    if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 })

    // 슬롯(project_id + character_id + view)의 기존 is_selected 해제 → 대상만 true
    const { error: clearError } = await supabaseAdmin
      .from('character_image_candidates')
      .update({ is_selected: false })
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('view', candidateView)
      .eq('is_selected', true)
    if (clearError) {
      console.error('[artist/select-candidate] clear is_selected failed:', clearError.message)
      return NextResponse.json({ error: clearError.message }, { status: 500 })
    }

    const { error: selectError } = await supabaseAdmin
      .from('character_image_candidates')
      .update({ is_selected: true })
      .eq('id', candidateId)
    if (selectError) {
      console.error('[artist/select-candidate] set is_selected failed:', selectError.message)
      return NextResponse.json({ error: selectError.message }, { status: 500 })
    }

    // characters 뷰 컬럼 미러 업데이트
    const column = CHARACTER_VIEW_COLUMNS[view]
    const { error: mirrorError } = await supabaseAdmin
      .from('characters')
      .update({ [column]: candidate.url })
      .eq('project_id', projectId)
      .eq('character_id', characterId)
    if (mirrorError) {
      console.error('[artist/select-candidate] mirror update failed:', mirrorError.message)
      return NextResponse.json({ error: mirrorError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, url: candidate.url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/select-candidate]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
