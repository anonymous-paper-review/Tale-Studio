import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from('editor_states')
      .select('state')
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ state: data?.state ?? null })
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
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabaseAdmin
      .from('editor_states')
      .upsert(
        { project_id: projectId, state, updated_at: new Date().toISOString() },
        { onConflict: 'project_id' }
      )

    if (error) {
      // FK 위반(23503) = 프로젝트가 삭제된 뒤에도 열린 에디터가 자동저장을 계속 쏘는 경우 —
      //   서버 장애가 아니라 만료된 클라이언트다. 410으로 구분해 클라이언트가 재시도를 멈추게 한다.
      if ((error as { code?: string }).code === '23503') {
        return NextResponse.json(
          { error: 'project no longer exists' },
          { status: 410 },
        )
      }
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/state PUT]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
