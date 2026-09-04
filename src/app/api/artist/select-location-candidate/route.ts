// 배경 후보 이미지 선택본 교체 — 약속 B4(2026-09-04), 캐릭터 select-candidate 와 대칭.
//   location_image_candidates 에서 선택본 flip + locations.wide_shot 미러. finalize 가 슬롯당 최근 5장을
//   보관하므로 이 라우트로 직전 이미지를 되돌릴 수 있다.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'

export const runtime = 'nodejs'

const VALID_VIEWS = new Set(['wide_shot'])

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const { projectId, locationId, view = 'wide_shot', candidateId } = (await req.json()) as {
      projectId?: string
      locationId?: string
      view?: string
      candidateId?: string
    }
    if (!projectId || !locationId || !candidateId) {
      return NextResponse.json(
        { error: 'Invalid request: projectId, locationId, candidateId required' },
        { status: 400 },
      )
    }
    if (!VALID_VIEWS.has(view)) {
      return NextResponse.json({ error: `Invalid view: ${view}` }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    // 슬롯(project + location + view) 안의 후보만 선택할 수 있다.
    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from('location_image_candidates')
      .select('id, url')
      .eq('id', candidateId)
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .eq('view', view)
      .maybeSingle()
    if (candidateError) throw candidateError
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

    const { error: clearError } = await supabaseAdmin
      .from('location_image_candidates')
      .update({ is_selected: false })
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .eq('view', view)
      .eq('is_selected', true)
    if (clearError) throw clearError

    const { error: selectError } = await supabaseAdmin
      .from('location_image_candidates')
      .update({ is_selected: true })
      .eq('id', candidateId)
    if (selectError) throw selectError

    // 미러 컬럼(locations.wide_shot) — finalizeWorldShotJob 과 대칭.
    const { error: mirrorError } = await supabaseAdmin
      .from('locations')
      .update({ [view]: candidate.url })
      .eq('project_id', projectId)
      .eq('location_id', locationId)
    if (mirrorError) throw mirrorError

    return NextResponse.json({ ok: true, url: candidate.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/select-location-candidate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
