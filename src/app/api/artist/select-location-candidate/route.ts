// 배경 후보 이미지 선택본 교체 — 약속 B4(2026-09-04), 캐릭터 select-candidate 와 대칭.
//   location_image_candidates 에서 선택본 flip + locations.wide_shot 미러. finalize 가 슬롯당 최근 5장을
//   보관하므로 이 라우트로 직전 이미지를 되돌릴 수 있다.
//   "지금"은 배경(뷰) 한 곳에 하나 — 고르기 전에 그 배경의 선택을 모습과 상관없이 모두 내린다(운영 DB 색인 그대로,
//   2026-10-31 오너: 모습마다 따로 두는 바꾸기는 보류). 지금 작품 스타일과 다른 버전에서 그린 그림은 받지 않는다(code other_style).
//   약속: tests/artist/candidate-select.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { ARTIST_VERSION_CODES } from '@/lib/artist/style-versions'
import { candidateStyleAllowed } from '@/lib/artist/style-versions-server'

export const runtime = 'nodejs'

const VALID_VIEWS = new Set(['wide_shot'])

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const { projectId, locationId, view = 'wide_shot', candidateId, appearanceKey: appearanceKeyInput } = (await req.json()) as {
      projectId?: string
      locationId?: string
      view?: string
      candidateId?: string
      appearanceKey?: string | null // 약속 C10: 변형 키(없거나 'default' = 기본 모습)
    }
    const appearanceKey = typeof appearanceKeyInput === 'string' && appearanceKeyInput && appearanceKeyInput !== 'default' ? appearanceKeyInput : null
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
      .select('id, url, generated_at')
      .eq('id', candidateId)
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .eq('view', view)
      .maybeSingle()
    if (candidateError) throw candidateError
    const found = candidate as { id: string; url: string; generated_at?: string | null } | null
    if (!found) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    if (!(await candidateStyleAllowed(projectId, found.generated_at))) {
      return NextResponse.json({ error: 'This image is in another style', code: ARTIST_VERSION_CODES.otherStyle }, { status: 409 })
    }

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

    // 미러 컬럼 — finalizeWorldShotJob 과 대칭: 변형은 location_appearances, 기본 모습은 locations.
    const mirror = appearanceKey
      ? supabaseAdmin
          .from('location_appearances')
          .update({ [view]: found.url })
          .eq('project_id', projectId)
          .eq('location_id', locationId)
          .eq('appearance_key', appearanceKey)
      : supabaseAdmin
          .from('locations')
          .update({ [view]: found.url })
          .eq('project_id', projectId)
          .eq('location_id', locationId)
    const { error: mirrorError } = await mirror
    if (mirrorError) throw mirrorError

    return NextResponse.json({ ok: true, url: found.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/select-location-candidate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
