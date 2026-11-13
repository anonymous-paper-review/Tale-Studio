import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 })
    }

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data, error } = await supabaseAdmin
      .from('editor_states')
      .select('state, updated_at')
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) throw error

    // 저장 시각도 돌려준다 — 화면이 이 브라우저가 마지막으로 본 시각과 견줘 다른 곳에서 더 나중에 고쳤는지 안다(E2b, 2026-11-14).
    return NextResponse.json({ state: data?.state ?? null, updatedAt: data?.updated_at ?? null })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/state GET]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { projectId, state } = await req.json()

    if (!projectId) {
      return NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 })
    }

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const updatedAt = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('editor_states')
      .upsert(
        { project_id: projectId, state, updated_at: updatedAt },
        { onConflict: 'project_id' }
      )
      .select('updated_at')
      .maybeSingle()

    if (error) {
      // FK 위반(23503) = 프로젝트가 삭제된 뒤에도 열린 에디터가 자동저장을 계속 쏘는 경우 —
      //   서버 장애가 아니라 만료된 클라이언트다. 410으로 구분해 클라이언트가 재시도를 멈추게 한다.
      if ((error as { code?: string }).code === '23503') {
        return NextResponse.json(
          { error: 'Project no longer exists' },
          { status: 410 },
        )
      }
      throw error
    }

    // 서버가 실제로 적은 저장 시각 — 화면이 이 브라우저에 적어 두고 다음에 열 때 견준다(E2b, 2026-11-14).
    return NextResponse.json({ ok: true, updatedAt: (data as { updated_at?: string } | null)?.updated_at ?? updatedAt })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/state PUT]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
