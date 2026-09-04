// 배경 설명(원천) 편집 — 약속 B3·B6(2026-09-04). 캐릭터 character-appearance PATCH 와 같은 계약:
//   유저 언어 원문은 visual_description_native 에, 생성용 영어 base 는 visual_description 에(파생 실패 시 원문 폴백).
//   팝업의 프롬프트 편집과 채팅 승인(artistSourceLocationPatch)이 둘 다 이 라우트로 커밋한다.
//   Writer 씬은 locations.visual_description 을 읽으므로 여기 저장이 곧 Writer 반영이다.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { locationI18nFields } from '@/lib/writer/i18n/derive-en'

export const runtime = 'nodejs'

const MAX_DESCRIPTION_CHARS = 2000

export async function PATCH(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const body = (await req.json()) as {
      projectId?: string
      locationId?: string
      visualDescription?: unknown
    }
    const { projectId, locationId } = body
    if (typeof projectId !== 'string' || !projectId.trim() || typeof locationId !== 'string' || !locationId.trim()) {
      return NextResponse.json({ error: 'Invalid request: projectId, locationId required' }, { status: 400 })
    }
    const visualDescription = typeof body.visualDescription === 'string' ? body.visualDescription.trim() : ''
    if (!visualDescription) {
      return NextResponse.json({ error: 'Invalid request: visualDescription cannot be empty' }, { status: 400 })
    }
    if (visualDescription.length > MAX_DESCRIPTION_CHARS) {
      return NextResponse.json(
        { error: `Invalid request: visualDescription must be ${MAX_DESCRIPTION_CHARS} characters or fewer` },
        { status: 400 },
      )
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const i18n = await locationI18nFields(locationId, visualDescription)
    const { data, error } = await supabaseAdmin
      .from('locations')
      .update({
        visual_description: i18n.visual_description,
        visual_description_native: i18n.visual_description_native,
        i18n_provenance: i18n.i18n_provenance,
        user_edited: true,
      })
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .select('location_id')
    if (error) throw error
    if (!data || data.length !== 1) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      locationId,
      visualDescription: i18n.visual_description,
      visualDescriptionNative: i18n.visual_description_native,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/location PATCH]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
