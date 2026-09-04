import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'

// Editor 트림 write-through (#a3-state-loss 2026-08-26).
// speed(/api/editor/speed)와 같은 패턴 — shots.trim_start/trim_end 는 loadData 가 읽기만 하고
// 쓰는 경로가 없어, 트림 편집이 탭 이탈 → 재진입(loadData 재구성)에서 통째로 증발했다.
// synthetic 조각(shot_id 에 __c/__i)은 DB 에 행이 없으므로 호출자가 걸러 보낸다(editor_states 소관).
export async function PATCH(req: Request) {
  try {
    const { projectId, shotId, trimStart, trimEnd } = await req.json()

    if (!shotId) {
      return NextResponse.json({ error: 'Invalid request: shotId is required' }, { status: 400 })
    }

    if (
      typeof trimStart !== 'number' ||
      typeof trimEnd !== 'number' ||
      !Number.isFinite(trimStart) ||
      !Number.isFinite(trimEnd) ||
      trimStart < 0 ||
      trimEnd <= trimStart
    ) {
      return NextResponse.json(
        { error: 'Invalid request: trimStart/trimEnd must be finite numbers with 0 <= trimStart < trimEnd' },
        { status: 400 },
      )
    }

    // 소유자만 — speed 라우트와 동일 가드 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { error } = await supabaseAdmin
      .from('shots')
      .update({ trim_start: trimStart, trim_end: trimEnd })
      .eq('shot_id', shotId)
      .eq('project_id', access.projectId)

    if (error) throw error

    return NextResponse.json({ shotId, trimStart, trimEnd })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/trim]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
