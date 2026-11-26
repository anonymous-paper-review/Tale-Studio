// 소품의 모습 변형 — m1126 A3(오너 2026-11-26 "소품 모습 추가 버튼 만들기", 리드 R3). 배경 location-appearance 라우트와 같은 계약.
//   기본 모습은 props 행(키 'default')이라 여기서는 다른 모습만 만들고 · 설명을 고치고 · 지운다. 그림은 /api/artist/generate-prop 에 appearanceKey 로.
//   모습을 지우면 그 모습의 지난 그림 기록(prop_image_candidates)도 함께 지운다. 쓰기는 service role 만(표 정책 = 소유자 읽기만).
//   약속: tests/artist/prop-appearance-route.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { appearanceI18nFields } from '@/lib/writer/i18n/derive-en'
import { slugifyIdentifier } from '@/lib/cast-slug'
import { DEFAULT_PROP_APPEARANCE_KEY } from '@/lib/artist/props'

export const runtime = 'nodejs'

const VALID_NARRATIVE_TIMES = new Set(['present', 'past', 'future'])
const MAX_DESCRIPTION_CHARS = 2000

function ok(v: unknown): v is string {
  return typeof v === 'string' && !!v.trim()
}

/** 설명(화면 말) 검사 — 비었거나 길면 거절 응답. */
function descriptionError(value: unknown): NextResponse | null {
  const description = typeof value === 'string' ? value.trim() : ''
  if (!description) return NextResponse.json({ error: 'Invalid request: appearance cannot be empty' }, { status: 400 })
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return NextResponse.json({ error: `Invalid request: appearance must be ${MAX_DESCRIPTION_CHARS} characters or fewer` }, { status: 400 })
  }
  return null
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json()) as { projectId?: string; propId?: string; label?: string; narrativeTime?: unknown; appearance?: unknown }
    const { projectId, propId, label, narrativeTime } = body
    if (!ok(projectId) || !ok(propId) || !ok(label)) {
      return NextResponse.json({ error: 'Invalid request: projectId, propId, label required' }, { status: 400 })
    }
    if (narrativeTime !== undefined && narrativeTime !== null && !VALID_NARRATIVE_TIMES.has(narrativeTime as string)) {
      return NextResponse.json({ error: 'Invalid request: narrativeTime must be present, past, or future' }, { status: 400 })
    }
    const invalid = descriptionError(body.appearance)
    if (invalid) return invalid
    const description = (body.appearance as string).trim()
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data: prop, error: propError } = await supabaseAdmin
      .from('props')
      .select('prop_id')
      .eq('project_id', projectId)
      .eq('prop_id', propId)
      .maybeSingle()
    if (propError) throw propError
    if (!prop) return NextResponse.json({ error: 'Prop not found' }, { status: 404 })

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('prop_appearances')
      .select('appearance_key')
      .eq('project_id', projectId)
      .eq('prop_id', propId)
    if (existingError) throw existingError
    // 열쇠는 이름에서 — 'default' 는 기본 모습(props 행) 몫이라 쓰지 않고, 겹치면 뒤에 번호를 붙인다(배경 모습과 같다).
    const used = new Set([DEFAULT_PROP_APPEARANCE_KEY, ...((existing ?? []) as Array<{ appearance_key: string }>).map((r) => r.appearance_key)])
    const base = slugifyIdentifier(label, 'appearance')
    let appearanceKey = base === DEFAULT_PROP_APPEARANCE_KEY ? `${base}_2` : base
    let n = 2
    while (used.has(appearanceKey)) appearanceKey = `${base}_${n++}`

    const i18n = await appearanceI18nFields(`${propId}:${appearanceKey}`, description)
    const { error: insertError } = await supabaseAdmin.from('prop_appearances').insert({
      project_id: projectId,
      prop_id: propId,
      appearance_key: appearanceKey,
      label: label.trim(),
      narrative_time: (narrativeTime as string | undefined) ?? null,
      appearance: i18n.appearance,
      appearance_native: i18n.appearance_native,
      i18n_provenance: i18n.i18n_provenance,
    })
    if (insertError) throw insertError
    return NextResponse.json({
      ok: true,
      propId,
      appearanceKey,
      label: label.trim(),
      narrativeTime: (narrativeTime as string | undefined) ?? null,
      appearance: i18n.appearance,
      appearanceNative: i18n.appearance_native,
      imageUrl: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/prop-appearance POST]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** 모습 설명(생김새) 고치기 — 그림은 그대로 둔다(다시 그리기 전까지 "설명 바뀜"). */
export async function PATCH(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json()) as { projectId?: string; propId?: string; appearanceKey?: string; appearance?: unknown }
    const { projectId, propId, appearanceKey } = body
    if (!ok(projectId) || !ok(propId) || !ok(appearanceKey)) {
      return NextResponse.json({ error: 'Invalid request: projectId, propId, appearanceKey required' }, { status: 400 })
    }
    if (appearanceKey === DEFAULT_PROP_APPEARANCE_KEY) {
      return NextResponse.json({ error: 'The default appearance is the prop itself. Use /api/artist/appearance for it.' }, { status: 400 })
    }
    const invalid = descriptionError(body.appearance)
    if (invalid) return invalid
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response
    const i18n = await appearanceI18nFields(`${propId}:${appearanceKey}`, (body.appearance as string).trim())
    const { data, error } = await supabaseAdmin
      .from('prop_appearances')
      .update({ appearance: i18n.appearance, appearance_native: i18n.appearance_native, i18n_provenance: i18n.i18n_provenance })
      .eq('project_id', projectId)
      .eq('prop_id', propId)
      .eq('appearance_key', appearanceKey)
      .select('appearance_key')
    if (error) throw error
    if (!data || data.length !== 1) return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
    return NextResponse.json({ ok: true, propId, appearanceKey, appearance: i18n.appearance, appearanceNative: i18n.appearance_native })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/prop-appearance PATCH]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const { projectId, propId, appearanceKey } = (await req.json()) as { projectId?: string; propId?: string; appearanceKey?: string }
    if (!ok(projectId) || !ok(propId) || !ok(appearanceKey)) {
      return NextResponse.json({ error: 'Invalid request: projectId, propId, appearanceKey required' }, { status: 400 })
    }
    if (appearanceKey === DEFAULT_PROP_APPEARANCE_KEY) {
      return NextResponse.json({ error: 'The default appearance cannot be deleted.', code: 'default_appearance' }, { status: 409 })
    }
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    // 그 모습의 지난 그림 기록 먼저 — 모습 행이 지워진 뒤 남은 기록이 아무 칸도 가리키지 않게.
    const { error: candError } = await supabaseAdmin
      .from('prop_image_candidates')
      .delete()
      .eq('project_id', projectId)
      .eq('prop_id', propId)
      .eq('appearance_key', appearanceKey)
    if (candError) throw candError
    const { data, error } = await supabaseAdmin
      .from('prop_appearances')
      .delete()
      .eq('project_id', projectId)
      .eq('prop_id', propId)
      .eq('appearance_key', appearanceKey)
      .select('appearance_key')
    if (error) throw error
    if (!data || data.length !== 1) return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
    return NextResponse.json({ ok: true, propId, appearanceKey })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[artist/prop-appearance DELETE]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
