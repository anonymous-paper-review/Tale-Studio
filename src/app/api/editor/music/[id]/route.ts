// DELETE /api/editor/music/[id]?projectId= — 만든 곡 [빼기](2026-11-26 m1126 E1).
//   곡 행에 뺀 시각(deleted_at)만 찍는다 — 파일은 지우지 않는다(이미 타임라인에 놓은 조각이 그 주소를 쓴다).
//   만드는 중인 곡은 뺄 수 없다(409) — Take 를 묶었고 서버가 만들고 있다. 약속: tests/job/editor-music-job.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'

export const runtime = 'nodejs'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const { id } = await params
    const access = await requireProjectAccess(req, new URL(req.url).searchParams.get('projectId'))
    if (!access.ok) return access.response
    const { data: row, error } = await supabaseAdmin
      .from('editor_music')
      .select('id, status, deleted_at')
      .eq('id', id)
      .eq('project_id', access.projectId)
      .maybeSingle()
    if (error) throw error
    if (!row || row.deleted_at) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (row.status === 'queued') return NextResponse.json({ error: 'still_making' }, { status: 409 })
    const { error: updateError } = await supabaseAdmin
      .from('editor_music')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('project_id', access.projectId)
    if (updateError) throw updateError
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[editor/music DELETE]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
