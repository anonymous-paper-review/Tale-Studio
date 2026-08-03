import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)
      .single()

    if (!workspace) {
      return NextResponse.json({ projects: [] })
    }

    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, title, current_stage, updated_at')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false })

    // 대표 썸네일(#landing-v2b 2026-08-03) — 이름만으로는 프로젝트 구별이 어렵다.
    //   우선순위: 실사 스토리보드 > 러프 보드 start 프레임 > 캐릭터 대표 이미지 > null(카드가
    //   그라디언트 폴백). 배치 2쿼리(shots·characters) 후 프로젝트별 첫 장 선택 — 목록 규모
    //   (수십 프로젝트 × 샷 JSONB 포인터)에서 충분히 가볍다.
    const ids = (projects ?? []).map((p) => p.id)
    const thumbnails = new Map<string, string>()
    if (ids.length > 0) {
      type ImageJson = { url?: string | null; status?: string | null; frames?: { start?: string | null } | null } | null
      const [{ data: shots }, { data: chars }] = await Promise.all([
        supabaseAdmin
          .from('shots')
          .select('project_id, sort_order, storyboard_image, rough_storyboard')
          .in('project_id', ids)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('characters')
          .select('project_id, portrait_url, view_main')
          .in('project_id', ids),
      ])
      const pick = (img: ImageJson, allowFrames: boolean): string | null => {
        if (!img || img.status !== 'completed') return null
        return (allowFrames ? img.frames?.start : null) ?? img.url ?? null
      }
      // 실사 패스 먼저 — 첫 샷의 러프가 뒤 샷의 실사를 이기지 않게(패스 분리).
      for (const s of shots ?? []) {
        if (thumbnails.has(s.project_id)) continue
        const url = pick(s.storyboard_image as ImageJson, true)
        if (url) thumbnails.set(s.project_id, url)
      }
      for (const s of shots ?? []) {
        if (thumbnails.has(s.project_id)) continue
        const url = pick(s.rough_storyboard as ImageJson, true)
        if (url) thumbnails.set(s.project_id, url)
      }
      for (const c of chars ?? []) {
        if (thumbnails.has(c.project_id)) continue
        const url = (c.portrait_url as string | null) ?? (c.view_main as string | null)
        if (url) thumbnails.set(c.project_id, url)
      }
    }

    return NextResponse.json({
      projects: (projects ?? []).map((p) => ({
        ...p,
        thumbnail_url: thumbnails.get(p.id) ?? null,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[project/list]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
