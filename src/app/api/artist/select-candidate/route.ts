// 캐릭터 후보 이미지 선택본 교체 — character_image_candidates에서 선택본 flip + character_appearances 미러.
//   오너 요청(#owner-keep-prev, 2026-08-31): 재생성해도 finalize 가 슬롯당 최근 N장을 보관하므로
//   (image-provenance.selectCandidatesToEvict) 이 라우트로 직전 이미지를 되돌릴 수 있다.
//   #g4(모습) 이후 슬롯 키가 (character_id, appearance_key, view) — 예전(#d4b4247 삭제분)엔
//   appearance_key 가 없었다. 컬럼 미러 대상도 characters.view_* 가 아니라 character_appearances.sheet_url.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { CHARACTER_VIEW_KEYS, type CharacterViewKey } from '@/types/asset'
import { viewKeyToCandidateView } from '@/lib/image-provenance'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const { projectId, characterId, appearanceKey, view, candidateId } = (await req.json()) as {
      projectId?: string
      characterId?: string
      appearanceKey?: string
      view?: CharacterViewKey
      candidateId?: string
    }

    if (!projectId || !characterId || !appearanceKey || !view || !candidateId) {
      return NextResponse.json(
        { error: 'projectId, characterId, appearanceKey, view, candidateId required' },
        { status: 400 },
      )
    }
    if (!CHARACTER_VIEW_KEYS.includes(view)) {
      return NextResponse.json({ error: `invalid view: ${view}` }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    // 대상 후보 로드 (project + character + appearance + view + id 조건 — 슬롯 밖 후보는 절대 선택 불가).
    const candidateView = viewKeyToCandidateView(view)
    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from('character_image_candidates')
      .select('id, url')
      .eq('id', candidateId)
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
      .eq('view', candidateView)
      .maybeSingle()
    if (candidateError) throw candidateError
    if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 })

    // 슬롯(project_id + character_id + appearance_key + view)의 기존 is_selected 해제 → 대상만 true.
    const { error: clearError } = await supabaseAdmin
      .from('character_image_candidates')
      .update({ is_selected: false })
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
      .eq('view', candidateView)
      .eq('is_selected', true)
    if (clearError) throw clearError

    const { error: selectError } = await supabaseAdmin
      .from('character_image_candidates')
      .update({ is_selected: true })
      .eq('id', candidateId)
    if (selectError) throw selectError

    // main 뷰만 character_appearances.sheet_url 을 소유한다(finalizeCharacterViewJob 과 대칭).
    //   방향 뷰는 후보 이력만 있고 미러 컬럼이 없다 — 선택 flip 으로 충분.
    if (view === 'main') {
      const { error: mirrorError } = await supabaseAdmin
        .from('character_appearances')
        .update({ sheet_url: candidate.url })
        .eq('project_id', projectId)
        .eq('character_id', characterId)
        .eq('appearance_key', appearanceKey)
      if (mirrorError) throw mirrorError
    }

    return NextResponse.json({ ok: true, url: candidate.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/select-candidate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
