// 소품 지난 그림 채택(오너 2026-11-26 A4 "과거 클릭 후 상세페이지로 들어가면 '채택' → 최종 버전으로 지정됨", 리드 승인 소품 기록 표) —
//   prop_image_candidates 에서 그 칸(소품 × 모습)의 선택본을 고른 그림으로 바꾸고, 소품 그림(기본 모습 = props, 다른 모습 = prop_appearances)과
//   그림 지문(source_hash)을 그 그림 것으로 미러한다 — 지문은 카드의 "설명 바뀜" · "그림체 바뀜"을 가르는 값이라 그림과 함께 옮긴다.
//   인물 select-candidate · 배경 select-location-candidate 와 같은 규칙: 칸 밖 후보는 못 고르고, 지금 작품 스타일과 다른 판에서 그린 그림은
//   받지 않는다(code other_style). 소품의 지금 그림은 모습마다 하나라(표 색인) 다른 모습의 지금 그림은 건드리지 않는다.
//   다시 그리지 않는다(Take · 생성 없음). 약속: tests/artist/prop-candidate-select.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { ARTIST_VERSION_CODES } from '@/lib/artist/style-versions'
import { candidateStyleAllowed } from '@/lib/artist/style-versions-server'

export const runtime = 'nodejs'

/** 기본 모습의 열쇠 — 소품 기록 표는 기본 모습도 비우지 않고 'default' 로 적는다. */
const DEFAULT_PROP_APPEARANCE_KEY = 'default'

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const body = (await req.json().catch(() => ({}))) as { projectId?: unknown; propId?: unknown; appearanceKey?: unknown; candidateId?: unknown }
    const projectId = typeof body.projectId === 'string' ? body.projectId : ''
    const propId = typeof body.propId === 'string' ? body.propId.trim() : ''
    const appearanceKey = typeof body.appearanceKey === 'string' ? body.appearanceKey.trim() : ''
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : ''
    if (!projectId || !propId || !appearanceKey || !candidateId) {
      return NextResponse.json({ error: 'Invalid request: projectId, propId, appearanceKey, candidateId required' }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    // 그 칸(project + 소품 + 모습) 안의 후보만 고를 수 있다.
    const { data, error: candidateError } = await supabaseAdmin
      .from('prop_image_candidates')
      .select('id, url, source_hash, generated_at')
      .eq('id', candidateId)
      .eq('project_id', projectId)
      .eq('prop_id', propId)
      .eq('appearance_key', appearanceKey)
      .maybeSingle()
    if (candidateError) throw candidateError
    const candidate = data as { id: string; url: string; source_hash?: string | null; generated_at?: string | null } | null
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    if (!(await candidateStyleAllowed(projectId, candidate.generated_at))) {
      return NextResponse.json({ error: 'This image is in another style', code: ARTIST_VERSION_CODES.otherStyle }, { status: 409 })
    }

    // 그 칸의 선택본을 내리고(칸마다 하나 — 색인) 고른 것만 올린다.
    const { error: clearError } = await supabaseAdmin
      .from('prop_image_candidates')
      .update({ is_selected: false })
      .eq('project_id', projectId)
      .eq('prop_id', propId)
      .eq('appearance_key', appearanceKey)
      .eq('is_selected', true)
    if (clearError) throw clearError
    const { error: selectError } = await supabaseAdmin
      .from('prop_image_candidates')
      .update({ is_selected: true })
      .eq('id', candidate.id)
    if (selectError) throw selectError

    // 미러 — 소품 그림 마무리(fal/finalize)와 같은 칸: 기본 모습은 props, 다른 모습은 prop_appearances.
    const mirror = { image_url: candidate.url, source_hash: candidate.source_hash ?? null }
    const { error: mirrorError } = appearanceKey === DEFAULT_PROP_APPEARANCE_KEY
      ? await supabaseAdmin.from('props').update(mirror).eq('project_id', projectId).eq('prop_id', propId)
      : await supabaseAdmin.from('prop_appearances').update(mirror).eq('project_id', projectId).eq('prop_id', propId).eq('appearance_key', appearanceKey)
    if (mirrorError) throw mirrorError

    return NextResponse.json({ ok: true, url: candidate.url, sourceHash: candidate.source_hash ?? null })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/select-prop-candidate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
