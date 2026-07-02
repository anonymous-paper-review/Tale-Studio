// 새 캐릭터 영속 — Artist 카드 (+버튼) / 채팅 createCharacter 에서 만든 캐릭터를
// characters 테이블에 insert. 이미지(view_*)는 비워둠 — 이후 generate-sheet 가 채운다.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { appearanceI18nFields } from '@/lib/writer/i18n/derive-en'

export const runtime = 'nodejs'

const VALID_ROLES = new Set(['protagonist', 'antagonist', 'supporting'])
const VALID_ENTITY_TYPES = new Set(['person', 'object'])

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      projectId,
      characterId,
      name,
      role,
      entity_type,
      description,
      appearance,
    } = (await req.json()) as {
      projectId?: string
      characterId?: string
      name?: string
      role?: string
      entity_type?: string
      description?: string
      appearance?: string
    }

    if (!projectId || !characterId || !name?.trim()) {
      return NextResponse.json(
        { error: 'projectId, characterId, name required' },
        { status: 400 },
      )
    }

    const safeRole = role && VALID_ROLES.has(role) ? role : 'supporting'
    const safeEntityType =
      entity_type && VALID_ENTITY_TYPES.has(entity_type) ? entity_type : 'person'

    // 언어 경계(S2c): 입력 외형(native) → appearance_native 보존 + EN base 파생 → appearance. description 은 별개(유저 입력).
    const i18n = await appearanceI18nFields(characterId, appearance)
    const { data, error } = await supabaseAdmin
      .from('characters')
      .insert({
        project_id: projectId,
        character_id: characterId,
        name: name.trim(),
        role: safeRole,
        entity_type: safeEntityType,
        description: description?.trim() || null,
        appearance: i18n.appearance,
        appearance_native: i18n.appearance_native,
        i18n_provenance: i18n.i18n_provenance,
      })
      .select('character_id')
      .single()

    if (error) {
      console.error('[artist/character] insert failed:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ characterId: data.character_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[artist/character]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 기존 캐릭터 메타 수정 — 카드 인라인 편집(이름/역할/설정/외형)에서 호출.
// 전달된 필드만 부분 갱신. 외형은 언어 경계(S2c) i18n 파생을 거친다.
export async function PATCH(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId, characterId, name, role, description, appearance } =
      (await req.json()) as {
        projectId?: string
        characterId?: string
        name?: string
        role?: string
        description?: string
        appearance?: string
      }

    if (!projectId || !characterId) {
      return NextResponse.json(
        { error: 'projectId, characterId required' },
        { status: 400 },
      )
    }

    const patch: Record<string, unknown> = {}
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      }
      patch.name = name.trim()
    }
    if (role !== undefined && VALID_ROLES.has(role)) patch.role = role
    if (description !== undefined) patch.description = description.trim() || null
    if (appearance !== undefined) {
      const i18n = await appearanceI18nFields(characterId, appearance)
      patch.appearance = i18n.appearance
      patch.appearance_native = i18n.appearance_native
      patch.i18n_provenance = i18n.i18n_provenance
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true })
    }

    const { error } = await supabaseAdmin
      .from('characters')
      .update(patch)
      .eq('project_id', projectId)
      .eq('character_id', characterId)

    if (error) {
      console.error('[artist/character PATCH] update failed:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[artist/character PATCH]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
