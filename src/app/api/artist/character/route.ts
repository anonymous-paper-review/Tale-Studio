import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { appearanceI18nFields } from '@/lib/writer/i18n/derive-en'

export const runtime = 'nodejs'

const VALID_ROLES = new Set(['protagonist', 'antagonist', 'supporting'])
const VALID_ENTITY_TYPES = new Set(['person', 'object'])

type CharacterBody = {
  projectId?: string
  characterId?: string
  name?: string
  role?: string
  entity_type?: string
  description?: string
  appearance?: string
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const body = (await req.json()) as CharacterBody
    const { projectId, characterId, name, role, entity_type, description, appearance } = body
    if (!projectId || !characterId || !name?.trim()) {
      return NextResponse.json(
        { error: 'Invalid request: projectId, characterId, name required' },
        { status: 400 },
      )
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const safeRole = role && VALID_ROLES.has(role) ? role : 'supporting'
    const safeEntityType =
      entity_type && VALID_ENTITY_TYPES.has(entity_type) ? entity_type : 'person'
    const i18n = await appearanceI18nFields(characterId, appearance)

    if (safeEntityType === 'object') {
      const { data, error } = await supabaseAdmin
        .from('props')
        .insert({
          project_id: projectId,
          prop_id: characterId,
          name: name.trim(),
          description: description?.trim() || null,
          appearance: i18n.appearance,
          appearance_native: i18n.appearance_native,
          image_url: null,
          origin: 'user',
        })
        .select('prop_id')
        .single()
      if (error) throw error
      return NextResponse.json({ characterId: data.prop_id })
    }

    const { data, error } = await supabaseAdmin.rpc(
      'create_person_with_default_appearance',
      {
        p_project_id: projectId,
        p_person: {
          character_id: characterId,
          name: name.trim(),
          role: safeRole,
          description: description?.trim() || null,
          arc: null,
          motivation: null,
          origin: 'user',
          appearance: i18n.appearance,
          appearance_native: i18n.appearance_native,
          costume: null,
          i18n_provenance: i18n.i18n_provenance,
        },
      },
    )
    if (error) throw error

    return NextResponse.json({ characterId: data?.character_id ?? characterId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[artist/character POST]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const body = (await req.json()) as CharacterBody
    const { projectId, characterId, name, role, description, appearance } = body
    if (!projectId || !characterId) {
      return NextResponse.json(
        { error: 'Invalid request: projectId, characterId required' },
        { status: 400 },
      )
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const [personResult, propResult] = await Promise.all([
      supabaseAdmin
        .from('characters')
        .select('character_id, entity_type')
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
    if (personResult.error) throw personResult.error
    if (propResult.error) throw propResult.error
    if (!personResult.data && !propResult.data) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }
    if (
      (personResult.data && personResult.data.entity_type !== 'person') ||
      (personResult.data && propResult.data)
    ) {
      return NextResponse.json({ error: 'Ambiguous character entity' }, { status: 409 })
    }

    const identityPatch: Record<string, unknown> = {}
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Invalid request: name cannot be empty' }, { status: 400 })
      }
      identityPatch.name = name.trim()
    }
    if (role !== undefined && VALID_ROLES.has(role)) identityPatch.role = role
    if (description !== undefined) identityPatch.description = description.trim() || null

    const i18n = appearance === undefined
      ? null
      : await appearanceI18nFields(characterId, appearance)
    const appearancePatch = i18n
      ? {
          appearance: i18n.appearance,
          appearance_native: i18n.appearance_native,
          i18n_provenance: i18n.i18n_provenance,
        }
      : {}

    if (Object.keys(identityPatch).length === 0 && Object.keys(appearancePatch).length === 0) {
      return NextResponse.json({ ok: true })
    }

    if (personResult.data) {
      const { error } = await supabaseAdmin.rpc(
        'update_person_with_default_appearance',
        {
          p_project_id: projectId,
          p_character_id: characterId,
          p_identity_patch: identityPatch,
          p_appearance_patch: appearancePatch,
        },
      )
      if (error) throw error
    } else {
      const patch: Record<string, unknown> = { ...identityPatch, ...appearancePatch }
      delete patch.role
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ ok: true })
      }
      const { error } = await supabaseAdmin
        .from('props')
        .update(patch)
        .eq('project_id', projectId)
        .eq('prop_id', characterId)
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[artist/character PATCH]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
