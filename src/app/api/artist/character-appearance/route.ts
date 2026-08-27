import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { validateAppearancePatch } from '@/lib/artist/appearance-patch'

export const runtime = 'nodejs'

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
        { error: 'projectId, characterId, appearanceKey required' },
        { status: 400 },
      )
    }
    const appearance = validateAppearancePatch(body)
    if (!appearance.ok) {
      return NextResponse.json({ error: appearance.error }, { status: 400 })
    }

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data, error } = await supabaseAdmin
      .from('character_appearances')
      .update({ appearance: appearance.appearance })
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
      .select('appearance_key')

    if (error) throw error
    if (!data || data.length !== 1) {
      return NextResponse.json({ error: 'appearance not found' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      characterId,
      appearanceKey,
      appearance: appearance.appearance,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/character-appearance PATCH]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
