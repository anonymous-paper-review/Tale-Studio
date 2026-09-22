import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { validateAppearancePatch } from '@/lib/artist/appearance-patch'
import { appearanceI18nFields } from '@/lib/writer/i18n/derive-en'
import { parseArtistSourceSnapshot } from '@/lib/artist/source-snapshot'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const body = (await req.json()) as {
      projectId?: string
      characterId?: string
      appearance?: unknown
      sourceSnapshot?: unknown
    }
    const { projectId, characterId } = body
    if (!projectId || !characterId) {
      return NextResponse.json({ error: 'Invalid request: projectId, characterId required' }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const result = validateAppearancePatch(body)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    const source = parseArtistSourceSnapshot(body.sourceSnapshot, ['character_appearances', 'props'])
    if (!source.ok) return NextResponse.json({ error: source.error }, { status: 400 })
    const snapshot = source.snapshot

    const [personAppearances, person, prop] = await Promise.all([
      supabaseAdmin
        .from('character_appearances')
        .select('appearance_key')
        .eq('project_id', projectId)
        .eq('character_id', characterId)
        .eq('is_default', true),
      supabaseAdmin
        .from('characters')
        .select('entity_type')
        .eq('project_id', projectId)
        .eq('character_id', characterId)
        .maybeSingle(),
      supabaseAdmin
        .from('props')
        .select('prop_id')
        .eq('project_id', projectId)
        .eq('prop_id', characterId)
        .maybeSingle(),
    ])
    if (personAppearances.error) throw personAppearances.error
    if (person.error) throw person.error
    if (prop.error) throw prop.error
    if (
      personAppearances.data.length > 1 ||
      (personAppearances.data.length === 1 &&
        (!person.data || person.data.entity_type !== 'person' || prop.data))
    ) {
      return NextResponse.json({ error: 'Ambiguous character entity' }, { status: 409 })
    }
    if (personAppearances.data.length === 0 && !prop.data) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }
    if (snapshot && snapshot.table !== (personAppearances.data.length === 1 ? 'character_appearances' : 'props')) {
      return NextResponse.json({ error: 'The target changed. Read it again before editing.' }, { status: 409 })
    }

    const i18n = await appearanceI18nFields(characterId, result.appearance)
    if (personAppearances.data.length === 1) {
      let query = supabaseAdmin
        .from('character_appearances')
        .update({
          appearance: i18n.appearance,
          appearance_native: i18n.appearance_native,
          i18n_provenance: i18n.i18n_provenance,
        })
        .eq('project_id', projectId)
        .eq('character_id', characterId)
        .eq('appearance_key', personAppearances.data[0].appearance_key)
      if (snapshot) {
        for (const [field, value] of Object.entries(snapshot.values)) {
          query = value === null ? query.is(field, null) : query.eq(field, value)
        }
        const { data, error } = await query.select('appearance_key')
        if (error) throw error
        if (data?.length !== 1) {
          return NextResponse.json({ error: 'The target changed. Read it again before editing.' }, { status: 409 })
        }
      } else {
        const { error } = await query
        if (error) throw error
      }
    } else {
      let query = supabaseAdmin
        .from('props')
        .update({
          appearance: i18n.appearance,
          appearance_native: i18n.appearance_native,
        })
        .eq('project_id', projectId)
        .eq('prop_id', characterId)
      if (snapshot) {
        for (const [field, value] of Object.entries(snapshot.values)) {
          query = value === null ? query.is(field, null) : query.eq(field, value)
        }
        const { data, error } = await query.select('prop_id')
        if (error) throw error
        if (data?.length !== 1) {
          return NextResponse.json({ error: 'The target changed. Read it again before editing.' }, { status: 409 })
        }
      } else {
        const { error } = await query
        if (error) throw error
      }
    }

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
