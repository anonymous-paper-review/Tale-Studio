// 캐릭터 후보 이미지 선택본 교체 — character_image_candidates에서 선택본 flip + character_appearances 미러.
//   오너 요청(#owner-keep-prev, 2026-08-31): 재생성해도 finalize 가 슬롯당 최근 N장을 보관하므로
//   (image-provenance.selectCandidatesToEvict) 이 라우트로 직전 이미지를 되돌릴 수 있다.
//   #g4(모습) 이후 슬롯 키가 (character_id, appearance_key, view) — 예전(#d4b4247 삭제분)엔
//   appearance_key 가 없었다. 컬럼 미러 대상도 characters.view_* 가 아니라 character_appearances.sheet_url.
//   2026-10-28(작품 스타일 기록): 대표 얼굴(portrait_url)도 고른 시트에서 다시 잘라 바꾸고(올린 원본이 있는 모습은 원본 그대로),
//   지금 작품 스타일과 다른 버전에서 그린 그림은 받지 않는다(code other_style). 약속: tests/artist/candidate-select.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { CHARACTER_VIEW_KEYS, type CharacterViewKey } from '@/types/asset'
import { viewKeyToCandidateView } from '@/lib/image-provenance'
import { keepsSourcePortrait } from '@/lib/artist/source-image'
import { portraitUrlForSheet, readSheetBytes } from '@/lib/artist/portrait-file'
import { ARTIST_VERSION_CODES } from '@/lib/artist/style-versions'
import { candidateStyleAllowed } from '@/lib/artist/style-versions-server'

export const runtime = 'nodejs'

/**
 * 고른 시트의 대표 얼굴 — 그림을 새로 그릴 때(finalize)와 같은 규칙: 사람 시트는 잘라 시트 옆 파일, 사물은 그림 그대로.
 *   올린 원본이 있는 모습은 그 원본이 대표 얼굴이라 null(바꾸지 않음). 자르다 실패해도 시트는 바꾼다(대표 얼굴만 그대로) — 최선.
 */
async function portraitForChosenSheet(projectId: string, characterId: string, appearanceKey: string, sheetUrl: string): Promise<string | null> {
  const [{ data: character }, { data: appearance }] = await Promise.all([
    supabaseAdmin.from('characters').select('entity_type').eq('project_id', projectId).eq('character_id', characterId).maybeSingle(),
    supabaseAdmin.from('character_appearances').select('derived_from_url').eq('project_id', projectId).eq('character_id', characterId).eq('appearance_key', appearanceKey).maybeSingle(),
  ])
  if (keepsSourcePortrait(appearance as { derived_from_url?: string | null } | null)) return null
  const entityType = (character as { entity_type?: string | null } | null)?.entity_type ?? null
  if (entityType === 'object') return sheetUrl
  try {
    const sheet = await readSheetBytes(sheetUrl)
    if (!sheet.path) return sheetUrl
    return await portraitUrlForSheet({ sheetPath: sheet.path, sheetBuf: sheet.bytes, sheetUrl, entityType })
  } catch (e) {
    console.warn('[artist/select-candidate] portrait crop skipped:', e instanceof Error ? e.message : e)
    return null
  }
}

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
        { error: 'Invalid request: projectId, characterId, appearanceKey, view, candidateId required' },
        { status: 400 },
      )
    }
    if (!CHARACTER_VIEW_KEYS.includes(view)) {
      return NextResponse.json({ error: `Invalid view: ${view}` }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    // 대상 후보 로드 (project + character + appearance + view + id 조건 — 슬롯 밖 후보는 절대 선택 불가).
    const candidateView = viewKeyToCandidateView(view)
    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from('character_image_candidates')
      .select('id, url, generated_at')
      .eq('id', candidateId)
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
      .eq('view', candidateView)
      .maybeSingle()
    if (candidateError) throw candidateError
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    // 작품 스타일은 하나 — 다른 스타일 버전에서 그린 그림을 카드 하나만 되돌리면 작품 안에 스타일이 섞인다(화면 단추도 꺼져 있다).
    if (!(await candidateStyleAllowed(projectId, (candidate as { generated_at?: string | null }).generated_at))) {
      return NextResponse.json({ error: 'This image is in another style', code: ARTIST_VERSION_CODES.otherStyle }, { status: 409 })
    }

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
    let portraitUrl: string | null = null
    if (view === 'main') {
      portraitUrl = await portraitForChosenSheet(projectId, characterId, appearanceKey, candidate.url as string)
      const { error: mirrorError } = await supabaseAdmin
        .from('character_appearances')
        .update({ sheet_url: candidate.url, ...(portraitUrl ? { portrait_url: portraitUrl } : {}) })
        .eq('project_id', projectId)
        .eq('character_id', characterId)
        .eq('appearance_key', appearanceKey)
      if (mirrorError) throw mirrorError
    }

    return NextResponse.json({ ok: true, url: candidate.url, ...(portraitUrl ? { portraitUrl } : {}) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/select-candidate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
