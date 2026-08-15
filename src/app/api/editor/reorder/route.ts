import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'

export async function PATCH(req: Request) {
  try {
    const { projectId, sceneId, clipOrder } = await req.json()

    if (!sceneId || !Array.isArray(clipOrder)) {
      return NextResponse.json(
        { error: 'sceneId and clipOrder[] are required' },
        { status: 400 },
      )
    }

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    // Persist sort_order to shots table — project_id 스코프로 프로젝트 간 shot_id 충돌 방지
    await Promise.all(
      (clipOrder as string[]).map((shotId, index) =>
        supabaseAdmin
          .from('shots')
          .update({ sort_order: index })
          .eq('shot_id', shotId)
          .eq('project_id', access.projectId),
      ),
    )

    return NextResponse.json({ sceneId, clipOrder })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/reorder]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
