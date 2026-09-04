import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { validateAppearancePatch } from '@/lib/artist/appearance-patch'
import { appearanceI18nFields } from '@/lib/writer/i18n/derive-en'
import { slugifyIdentifier } from '@/lib/cast-slug'

export const runtime = 'nodejs'

const VALID_NARRATIVE_TIMES = new Set(['present', 'past', 'future'])

/**
 * 채팅 createAppearance(#g4-chat 2026-08-31)가 부르는 신규 모습 생성 — 무과금(이미지 미트리거).
 *   기존 PATCH(appearance 텍스트만 갱신)와 달리 appearance_key/label 이 없는 상태에서 행 자체를 만든다.
 *   is_default 는 이 경로로 절대 true 를 못 만든다 — 기본 모습 교체는 changeAppearance 승인 경로 전용(F6).
 */
export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const body = (await req.json()) as {
      projectId?: string
      characterId?: string
      label?: string
      appearance?: unknown
      narrativeTime?: unknown
    }
    const { projectId, characterId, label, narrativeTime } = body
    if (
      typeof projectId !== 'string' ||
      !projectId.trim() ||
      typeof characterId !== 'string' ||
      !characterId.trim() ||
      typeof label !== 'string' ||
      !label.trim()
    ) {
      return NextResponse.json(
        { error: 'Invalid request: projectId, characterId, label required' },
        { status: 400 },
      )
    }
    if (narrativeTime !== undefined && narrativeTime !== null && !VALID_NARRATIVE_TIMES.has(narrativeTime as string)) {
      return NextResponse.json({ error: 'Invalid request: narrativeTime must be present, past, or future' }, { status: 400 })
    }
    const appearanceResult = validateAppearancePatch(body)
    if (!appearanceResult.ok) {
      return NextResponse.json({ error: appearanceResult.error }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data: person, error: personError } = await supabaseAdmin
      .from('characters')
      .select('entity_type')
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .maybeSingle()
    if (personError) throw personError
    if (!person || person.entity_type !== 'person') {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // appearance_key = label 슬러그, 그 캐릭터 안에서 유일 — 부분 유니크 인덱스(project_id, character_id, appearance_key)와
    //   정합. 충돌 시 _2, _3… suffix(cast-slug 와 동일 규약).
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('character_appearances')
      .select('appearance_key')
      .eq('project_id', projectId)
      .eq('character_id', characterId)
    if (existingError) throw existingError
    const usedKeys = new Set((existing ?? []).map((row) => row.appearance_key as string))
    const base = slugifyIdentifier(label, 'appearance')
    let appearanceKey = base
    let n = 2
    while (usedKeys.has(appearanceKey)) appearanceKey = `${base}_${n++}`

    const i18n = await appearanceI18nFields(characterId, appearanceResult.appearance)
    const { error: insertError } = await supabaseAdmin.from('character_appearances').insert({
      project_id: projectId,
      character_id: characterId,
      appearance_key: appearanceKey,
      label: label.trim(),
      is_default: false,
      narrative_time: (narrativeTime as string | undefined) ?? null,
      appearance: i18n.appearance,
      appearance_native: i18n.appearance_native,
      i18n_provenance: i18n.i18n_provenance,
    })
    if (insertError) throw insertError

    return NextResponse.json({
      ok: true,
      characterId,
      appearanceKey,
      label: label.trim(),
      narrativeTime: (narrativeTime as string | undefined) ?? null,
      appearance: i18n.appearance,
      appearanceNative: i18n.appearance_native,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/character-appearance POST]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const body = (await req.json()) as {
      projectId?: string
      characterId?: string
      appearanceKey?: string
      appearance?: unknown
    }
    const { projectId, characterId, appearanceKey } = body
    if (
      typeof projectId !== 'string' ||
      !projectId.trim() ||
      typeof characterId !== 'string' ||
      !characterId.trim() ||
      typeof appearanceKey !== 'string' ||
      !appearanceKey.trim()
    ) {
      return NextResponse.json(
        { error: 'Invalid request: projectId, characterId, appearanceKey required' },
        { status: 400 },
      )
    }
    const appearance = validateAppearancePatch(body)
    if (!appearance.ok) {
      return NextResponse.json({ error: appearance.error }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const i18n = await appearanceI18nFields(characterId, appearance.appearance)
    const { data, error } = await supabaseAdmin
      .from('character_appearances')
      .update({
        appearance: i18n.appearance,
        appearance_native: i18n.appearance_native,
        i18n_provenance: i18n.i18n_provenance,
      })
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
      .select('appearance_key')

    if (error) throw error
    if (!data || data.length !== 1) {
      return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      characterId,
      appearanceKey,
      appearance: i18n.appearance,
      appearanceNative: i18n.appearance_native,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/character-appearance PATCH]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
