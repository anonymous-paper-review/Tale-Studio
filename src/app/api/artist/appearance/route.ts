// 캐릭터 canonical 외형(원천) 변경 커밋 — C3 F6 승인 경로 전용(AC10/11).
//
// cc 자동경로(applyUpdates)로는 절대 진입하지 못한다(validateUpdates 화이트리스트 밖). 이 라우트는
//   pending-proposal('artistSourceAppearancePatch') 사용자 승인 후에만 호출되어 characters.appearance 를 커밋한다.
//   외형 변경 시 그 캐릭터의 모든 파생 이미지는 provenance(source_hash)상 자동 stale 이 된다 — 추가 무효화/재생성
//   코드 없음(#57: 자동 무효화/자동 재생성 금지). 이후 cc 가 재생성을 *제안*(자동 실행 아님).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import { validateAppearancePatch } from '@/lib/artist/appearance-patch'
import { appearanceI18nFields } from '@/lib/writer/i18n/derive-en'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      projectId?: string
      characterId?: string
      appearance?: unknown
    }
    const { projectId, characterId } = body
    if (!projectId || !characterId) {
      return NextResponse.json({ error: 'projectId, characterId required' }, { status: 400 })
    }

    // 소유권: project → workspace → user.
    const owns = await userOwnsProject(projectId, user.id)
    if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 필드 화이트리스트 + 길이 검증(순수 함수, 단위 검증).
    const result = validateAppearancePatch(body)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    // 언어 경계(S2c): 패치는 유저 언어(native) → appearance_native 보존 + EN base 파생 → appearance.
    //   description 은 표시 미러라 native 유지. 파생 실패 시 native 폴백(오염 아님).
    const i18n = await appearanceI18nFields(characterId, result.appearance)
    const { error } = await supabaseAdmin
      .from('characters')
      .update({
        appearance: i18n.appearance,
        appearance_native: i18n.appearance_native,
        description: result.appearance,
        i18n_provenance: i18n.i18n_provenance,
      })
      .eq('project_id', projectId)
      .eq('character_id', characterId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      characterId,
      appearance: i18n.appearance,
      appearanceNative: i18n.appearance_native,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/appearance]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
