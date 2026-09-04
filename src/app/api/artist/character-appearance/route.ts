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

/**
 * 모습 편집 — 외형 텍스트(appearance) 외에 약속 C8(2026-09-04): 이름(label)·시점(narrativeTime)·기본 모습 지정(isDefault).
 *   기본 모습은 캐릭터당 하나(부분 유니크 인덱스) — 먼저 다른 모습의 is_default 를 내리고 대상을 올린다.
 *   기본 모습은 narrative_time 이 있어야 한다(20260827200400 check) — 없으면 present 로 채운다.
 */
export async function PATCH(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const body = (await req.json()) as {
      projectId?: string
      characterId?: string
      appearanceKey?: string
      appearance?: unknown
      label?: unknown
      narrativeTime?: unknown
      isDefault?: unknown
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
    const hasAppearance = body.appearance !== undefined
    const hasLabel = body.label !== undefined
    const hasTime = body.narrativeTime !== undefined
    const hasDefault = body.isDefault !== undefined
    if (!hasAppearance && !hasLabel && !hasTime && !hasDefault) {
      return NextResponse.json({ error: 'Invalid request: nothing to update' }, { status: 400 })
    }
    const appearance = hasAppearance ? validateAppearancePatch(body) : null
    if (appearance && !appearance.ok) {
      return NextResponse.json({ error: appearance.error }, { status: 400 })
    }
    const label = hasLabel ? (typeof body.label === 'string' ? body.label.trim() : '') : null
    if (hasLabel && !label) {
      return NextResponse.json({ error: 'Invalid request: label cannot be empty' }, { status: 400 })
    }
    if (hasTime && body.narrativeTime !== null && !VALID_NARRATIVE_TIMES.has(body.narrativeTime as string)) {
      return NextResponse.json({ error: 'Invalid request: narrativeTime must be present, past, or future' }, { status: 400 })
    }
    if (hasDefault && body.isDefault !== true) {
      return NextResponse.json({ error: 'Invalid request: isDefault can only be set to true (pick another appearance to change the default)' }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data: current, error: currentError } = await supabaseAdmin
      .from('character_appearances')
      .select('appearance_key, is_default, narrative_time')
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
      .maybeSingle()
    if (currentError) throw currentError
    if (!current) return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })

    const patch: Record<string, unknown> = {}
    let i18n: Awaited<ReturnType<typeof appearanceI18nFields>> | null = null
    if (appearance && appearance.ok) {
      i18n = await appearanceI18nFields(characterId, appearance.appearance)
      patch.appearance = i18n.appearance
      patch.appearance_native = i18n.appearance_native
      patch.i18n_provenance = i18n.i18n_provenance
    }
    if (label) patch.label = label
    if (hasTime) patch.narrative_time = body.narrativeTime
    const becomesDefault = hasDefault && body.isDefault === true && !current.is_default
    if (becomesDefault) {
      patch.is_default = true
      const nextTime = hasTime ? body.narrativeTime : current.narrative_time
      if (!nextTime) patch.narrative_time = 'present'
      // 기본 모습은 하나뿐 — 먼저 내린다(부분 유니크 인덱스).
      const { error: clearError } = await supabaseAdmin
        .from('character_appearances')
        .update({ is_default: false })
        .eq('project_id', projectId)
        .eq('character_id', characterId)
        .eq('is_default', true)
      if (clearError) throw clearError
    }

    const { data, error } = await supabaseAdmin
      .from('character_appearances')
      .update(patch)
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
      .select('appearance_key, label, narrative_time, is_default')

    if (error) throw error
    if (!data || data.length !== 1) {
      return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
    }
    const row = data[0] as { label: string; narrative_time: string | null; is_default: boolean }

    return NextResponse.json({
      ok: true,
      characterId,
      appearanceKey,
      label: row.label,
      narrativeTime: row.narrative_time,
      isDefault: row.is_default,
      ...(i18n ? { appearance: i18n.appearance, appearanceNative: i18n.appearance_native } : {}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/character-appearance PATCH]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * 모습 삭제 — 약속 C8. 기본 모습은 지울 수 없다(먼저 다른 모습을 기본으로). 그 모습의 후보 이미지 행도 함께 지운다.
 *   스토리지 파일은 남긴다(다른 후보·시트가 참조할 수 있어 best-effort 청소는 주기 스크립트 몫).
 */
export async function DELETE(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const { projectId, characterId, appearanceKey } = (await req.json()) as {
      projectId?: string
      characterId?: string
      appearanceKey?: string
    }
    if (!projectId || !characterId || !appearanceKey) {
      return NextResponse.json(
        { error: 'Invalid request: projectId, characterId, appearanceKey required' },
        { status: 400 },
      )
    }
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data: current, error: currentError } = await supabaseAdmin
      .from('character_appearances')
      .select('appearance_key, is_default')
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
      .maybeSingle()
    if (currentError) throw currentError
    if (!current) return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
    if (current.is_default) {
      return NextResponse.json(
        { error: 'The default appearance cannot be deleted. Set another appearance as default first.', code: 'default_appearance' },
        { status: 409 },
      )
    }

    const { error: candError } = await supabaseAdmin
      .from('character_image_candidates')
      .delete()
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
    if (candError) throw candError

    const { error: delError } = await supabaseAdmin
      .from('character_appearances')
      .delete()
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
    if (delError) throw delError

    return NextResponse.json({ ok: true, characterId, appearanceKey })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/character-appearance DELETE]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
