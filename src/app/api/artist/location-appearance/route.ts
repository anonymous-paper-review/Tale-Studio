// 배경의 모습(타임라인) 변형 — 약속 C10(2026-09-04). 캐릭터 character-appearance 라우트와 같은 계약.
//   기본 모습은 locations 행(키 'default')이라 여기서는 과거/현재/미래 변형만 만들고 고치고 지운다.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { locationI18nFields } from '@/lib/writer/i18n/derive-en'
import { slugifyIdentifier } from '@/lib/cast-slug'

export const runtime = 'nodejs'

const VALID_NARRATIVE_TIMES = new Set(['present', 'past', 'future'])
export const DEFAULT_LOCATION_APPEARANCE_KEY = 'default'
const MAX_DESCRIPTION_CHARS = 2000

function ok(v: unknown): v is string {
  return typeof v === 'string' && !!v.trim()
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json()) as {
      projectId?: string
      locationId?: string
      label?: string
      narrativeTime?: unknown
      visualDescription?: unknown
    }
    const { projectId, locationId, label, narrativeTime } = body
    if (!ok(projectId) || !ok(locationId) || !ok(label)) {
      return NextResponse.json({ error: 'Invalid request: projectId, locationId, label required' }, { status: 400 })
    }
    if (narrativeTime !== undefined && narrativeTime !== null && !VALID_NARRATIVE_TIMES.has(narrativeTime as string)) {
      return NextResponse.json({ error: 'Invalid request: narrativeTime must be present, past, or future' }, { status: 400 })
    }
    const description = typeof body.visualDescription === 'string' ? body.visualDescription.trim() : ''
    if (!description) return NextResponse.json({ error: 'Invalid request: visualDescription cannot be empty' }, { status: 400 })
    if (description.length > MAX_DESCRIPTION_CHARS) {
      return NextResponse.json({ error: `Invalid request: visualDescription must be ${MAX_DESCRIPTION_CHARS} characters or fewer` }, { status: 400 })
    }
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data: location, error: locError } = await supabaseAdmin
      .from('locations')
      .select('location_id')
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .maybeSingle()
    if (locError) throw locError
    if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('location_appearances')
      .select('appearance_key')
      .eq('project_id', projectId)
      .eq('location_id', locationId)
    if (existingError) throw existingError
    const used = new Set([DEFAULT_LOCATION_APPEARANCE_KEY, ...(existing ?? []).map((r) => r.appearance_key as string)])
    const base = slugifyIdentifier(label, 'appearance')
    let appearanceKey = base === DEFAULT_LOCATION_APPEARANCE_KEY ? `${base}_2` : base
    let n = 2
    while (used.has(appearanceKey)) appearanceKey = `${base}_${n++}`

    const i18n = await locationI18nFields(`${locationId}:${appearanceKey}`, description)
    const { error: insertError } = await supabaseAdmin.from('location_appearances').insert({
      project_id: projectId,
      location_id: locationId,
      appearance_key: appearanceKey,
      label: label.trim(),
      narrative_time: (narrativeTime as string | undefined) ?? null,
      visual_description: i18n.visual_description,
      visual_description_native: i18n.visual_description_native,
      i18n_provenance: i18n.i18n_provenance,
    })
    if (insertError) throw insertError
    return NextResponse.json({
      ok: true,
      locationId,
      appearanceKey,
      label: label.trim(),
      narrativeTime: (narrativeTime as string | undefined) ?? null,
      visualDescription: i18n.visual_description,
      visualDescriptionNative: i18n.visual_description_native,
      wideShot: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/location-appearance POST]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json()) as {
      projectId?: string
      locationId?: string
      appearanceKey?: string
      label?: unknown
      narrativeTime?: unknown
      visualDescription?: unknown
    }
    const { projectId, locationId, appearanceKey } = body
    if (!ok(projectId) || !ok(locationId) || !ok(appearanceKey)) {
      return NextResponse.json({ error: 'Invalid request: projectId, locationId, appearanceKey required' }, { status: 400 })
    }
    if (appearanceKey === DEFAULT_LOCATION_APPEARANCE_KEY) {
      return NextResponse.json({ error: 'The default appearance is the location itself. Use /api/artist/location for it.' }, { status: 400 })
    }
    const patch: Record<string, unknown> = {}
    if (body.label !== undefined) {
      if (!ok(body.label)) return NextResponse.json({ error: 'Invalid request: label cannot be empty' }, { status: 400 })
      patch.label = body.label.trim()
    }
    if (body.narrativeTime !== undefined) {
      if (body.narrativeTime !== null && !VALID_NARRATIVE_TIMES.has(body.narrativeTime as string)) {
        return NextResponse.json({ error: 'Invalid request: narrativeTime must be present, past, or future' }, { status: 400 })
      }
      patch.narrative_time = body.narrativeTime
    }
    let i18n: Awaited<ReturnType<typeof locationI18nFields>> | null = null
    if (body.visualDescription !== undefined) {
      const description = typeof body.visualDescription === 'string' ? body.visualDescription.trim() : ''
      if (!description) return NextResponse.json({ error: 'Invalid request: visualDescription cannot be empty' }, { status: 400 })
      if (description.length > MAX_DESCRIPTION_CHARS) {
        return NextResponse.json({ error: `Invalid request: visualDescription must be ${MAX_DESCRIPTION_CHARS} characters or fewer` }, { status: 400 })
      }
      i18n = await locationI18nFields(`${locationId}:${appearanceKey}`, description)
      patch.visual_description = i18n.visual_description
      patch.visual_description_native = i18n.visual_description_native
      patch.i18n_provenance = i18n.i18n_provenance
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Invalid request: nothing to update' }, { status: 400 })
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data, error } = await supabaseAdmin
      .from('location_appearances')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .eq('appearance_key', appearanceKey)
      .select('appearance_key, label, narrative_time, visual_description, visual_description_native')
    if (error) throw error
    if (!data || data.length !== 1) return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
    const row = data[0] as { label: string; narrative_time: string | null; visual_description: string | null; visual_description_native: string | null }
    return NextResponse.json({
      ok: true,
      locationId,
      appearanceKey,
      label: row.label,
      narrativeTime: row.narrative_time,
      visualDescription: row.visual_description,
      visualDescriptionNative: row.visual_description_native,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/location-appearance PATCH]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const { projectId, locationId, appearanceKey } = (await req.json()) as {
      projectId?: string
      locationId?: string
      appearanceKey?: string
    }
    if (!ok(projectId) || !ok(locationId) || !ok(appearanceKey)) {
      return NextResponse.json({ error: 'Invalid request: projectId, locationId, appearanceKey required' }, { status: 400 })
    }
    if (appearanceKey === DEFAULT_LOCATION_APPEARANCE_KEY) {
      return NextResponse.json({ error: 'The default appearance cannot be deleted.', code: 'default_appearance' }, { status: 409 })
    }
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { error: candError } = await supabaseAdmin
      .from('location_image_candidates')
      .delete()
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .eq('variant_key', appearanceKey)
    if (candError) throw candError
    const { data, error } = await supabaseAdmin
      .from('location_appearances')
      .delete()
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .eq('appearance_key', appearanceKey)
      .select('appearance_key')
    if (error) throw error
    if (!data || data.length !== 1) return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
    return NextResponse.json({ ok: true, locationId, appearanceKey })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/location-appearance DELETE]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
