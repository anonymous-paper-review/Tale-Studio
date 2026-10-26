import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { appearanceI18nFields } from '@/lib/writer/i18n/derive-en'
import {
  characterUsage,
  isChatMadeCharacter,
  queuedJobDrawsCharacter,
  removeCharacterFromProducerDraft,
} from '@/lib/artist/character-delete'

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

    // RPC가 함께 만든 기본 모습을 반환한다. 생성 직후에도 재조회 없이 그 모습을 선택할 수 있다.
    // label·시점은 create_person_with_default_appearance의 신규 행과 동일하다.
    return NextResponse.json({
      characterId: data?.character_id ?? characterId,
      defaultAppearance: {
        appearanceKey: data.appearance_key,
        label: '현재', // i18n-ok: RPC가 저장한 기본 모습의 원본 label을 그대로 반환한다.
        isDefault: true,
        narrativeTime: 'present',
        appearance: i18n.appearance,
        appearanceNative: i18n.appearance_native,
        sheetUrl: null,
        portraitUrl: null,
        viewCandidates: {},
      },
    })
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

/**
 * 채팅으로 만들어진 인물 카드 지우기(2026-10-27 디자이너 QA 1차 #04 · 오너 "채팅 추가 막고 안내").
 *   산문에서 나온 인물(origin producer · writer)은 지우지 않는다(from_prose). 그림을 그리는 중(drawing)이거나
 *   씬 · 샷이 부르고 있으면(in_use) 까닭과 함께 거절한다. 모습 · 그림 후보는 FK cascade 로 함께 지워진다.
 *   산문 초안(producer_draft)에 접혀 들어간 같은 카드를 먼저 빼고 행을 지운다 — 다시 열어도 되살아나지 않게.
 *   스토리지 파일은 남긴다(모습 지우기와 같은 규칙).
 */
export async function DELETE(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const body = (await req.json().catch(() => ({}))) as { projectId?: unknown; characterId?: unknown }
    const projectId = typeof body.projectId === 'string' ? body.projectId : undefined
    const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : ''
    if (!projectId || !characterId) {
      return NextResponse.json({ error: 'Invalid request: projectId, characterId required' }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data: person, error: personError } = await supabaseAdmin
      .from('characters')
      .select('character_id, name, origin')
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .maybeSingle()
    if (personError) throw personError
    if (!person) return NextResponse.json({ error: 'Character not found', code: 'not_found' }, { status: 404 })
    if (!isChatMadeCharacter(person)) {
      return NextResponse.json({ error: 'This character comes from the prose, so it cannot be deleted', code: 'from_prose' }, { status: 409 })
    }

    const [jobs, scenes, shots, overrides] = await Promise.all([
      supabaseAdmin.from('generation_jobs').select('id, target').eq('project_id', projectId).eq('kind', 'character_view').eq('status', 'queued'),
      supabaseAdmin.from('scenes').select('scene_id, characters_present').eq('project_id', projectId),
      supabaseAdmin.from('shots').select('shot_id, characters, character_appearance_keys, dialogue_lines, director_refs').eq('project_id', projectId),
      supabaseAdmin.from('scene_character_appearance_overrides').select('scene_id, character_id').eq('project_id', projectId).eq('character_id', characterId),
    ])
    for (const result of [jobs, scenes, shots, overrides]) if (result.error) throw result.error
    if (queuedJobDrawsCharacter(jobs.data ?? [], characterId)) {
      return NextResponse.json({ error: 'This character is still being drawn', code: 'drawing' }, { status: 409 })
    }
    const usage = characterUsage(characterId, { scenes: scenes.data ?? [], shots: shots.data ?? [], overrides: overrides.data ?? [] })
    if (usage.scenes + usage.shots > 0) {
      return NextResponse.json({ error: 'This character is used in scenes or shots', code: 'in_use', usage }, { status: 409 })
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('producer_draft')
      .eq('id', projectId)
      .maybeSingle()
    if (projectError) throw projectError
    const cleaned = removeCharacterFromProducerDraft((project as { producer_draft?: unknown } | null)?.producer_draft ?? null, { characterId, name: person.name ?? '' })
    if (cleaned.changed) {
      const { error } = await supabaseAdmin.from('projects').update({ producer_draft: cleaned.draft }).eq('id', projectId)
      if (error) throw error
    }

    const { error: deleteError } = await supabaseAdmin
      .from('characters')
      .delete()
      .eq('project_id', projectId)
      .eq('character_id', characterId)
    if (deleteError) {
      // 지우지 못했으면 산문 목록에서 뺀 것도 되돌린다 — 카드는 남았는데 목록에서만 사라지지 않게(검토 지적 12).
      if (cleaned.changed) {
        await supabaseAdmin.from('projects').update({ producer_draft: (project as { producer_draft?: unknown } | null)?.producer_draft ?? null }).eq('id', projectId)
      }
      // 다른 표(관계 · 씬별 모습)가 아직 이 인물을 붙잡고 있다 — 쓰이는 인물과 같은 까닭으로 알린다.
      if ((deleteError as { code?: string }).code === '23503') {
        return NextResponse.json({ error: 'This character is used in scenes or shots', code: 'in_use' }, { status: 409 })
      }
      throw deleteError
    }
    return NextResponse.json({ ok: true, characterId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[artist/character DELETE]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
