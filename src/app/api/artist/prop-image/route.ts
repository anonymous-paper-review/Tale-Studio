// PATCH /api/artist/prop-image — 사람이 올린 그림을 소품 그림으로 그대로 쓴다(D7, 2026-11-22).
//   그림은 먼저 /api/artist/breakdown-image 로 이 프로젝트 올림 폴더({작업 공간}/{프로젝트}/breakdown/)에 올라가 있어야 한다 —
//   그 밖의 주소(바깥 주소 · 다른 작업 공간 · 다른 프로젝트 · 생성 그림 폴더)는 받지 않는다. 지문(source_hash)은 비운다(바뀜 표시 없음).
//   약속: tests/artist/prop-upload.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { isOwnMediaUrl, mediaPathFromUrl } from '@/lib/storage/media-url'

export const runtime = 'nodejs'

export async function PATCH(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json().catch(() => ({}))) as { projectId?: unknown; propId?: unknown; url?: unknown }
    const projectId = typeof body.projectId === 'string' ? body.projectId : ''
    const propId = typeof body.propId === 'string' ? body.propId.trim() : ''
    if (!projectId || !propId || typeof body.url !== 'string') {
      return NextResponse.json({ error: 'Invalid request: projectId, propId, url required' }, { status: 400 })
    }
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response
    const url = body.url
    const [project, prop, person] = await Promise.all([
      supabaseAdmin.from('projects').select('id, workspace_id').eq('id', projectId).maybeSingle(),
      supabaseAdmin.from('props').select('prop_id').eq('project_id', projectId).eq('prop_id', propId).maybeSingle(),
      supabaseAdmin.from('characters').select('character_id').eq('project_id', projectId).eq('character_id', propId).maybeSingle(),
    ])
    const failed = project.error ?? prop.error ?? person.error
    if (failed) throw failed
    const parts = isOwnMediaUrl(url) ? (mediaPathFromUrl(url) ?? '').split('/') : []
    const workspaceId = (project.data as { workspace_id?: string } | null)?.workspace_id
    if (!workspaceId || parts[0] !== workspaceId || parts[1] !== projectId || parts[2] !== 'breakdown' || parts.length < 4) {
      return NextResponse.json({ error: 'Only a picture uploaded to this project can be used' }, { status: 400 })
    }
    if (!prop.data) return NextResponse.json({ error: 'Prop not found' }, { status: 404 })
    if (person.data) return NextResponse.json({ error: 'Ambiguous character entity' }, { status: 409 })
    const { error } = await supabaseAdmin.from('props').update({ image_url: url, source_hash: null }).eq('project_id', projectId).eq('prop_id', propId)
    if (error) throw error
    return NextResponse.json({ ok: true, imageUrl: url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/prop-image]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
