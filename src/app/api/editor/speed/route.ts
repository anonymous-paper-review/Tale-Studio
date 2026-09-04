import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'

export async function PATCH(req: Request) {
  try {
    const { projectId, shotId, speed } = await req.json()

    if (!shotId) {
      return NextResponse.json({ error: 'Invalid request: shotId is required' }, { status: 400 })
    }

    if (typeof speed !== 'number' || speed < 0.25 || speed > 4.0) {
      return NextResponse.json(
        { error: 'Invalid request: speed must be a number between 0.25 and 4.0' },
        { status: 400 },
      )
    }

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { error } = await supabaseAdmin
      .from('shots')
      .update({ speed })
      .eq('shot_id', shotId)
      .eq('project_id', access.projectId)

    if (error) throw error

    return NextResponse.json({ shotId, speed })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/speed]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
