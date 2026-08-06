// GET /api/debug-flags?projectId= — 디버그 표면 노출 플래그(#debug-prompts 2026-08-06).
//   debugPrompts: 요청자가 관리자이고 그 관리자가 이 프로젝트의 소유자(workspace owner)일 때만 true.
//   판정 근거(이메일·소유 체인)는 서버에 남고 클라이언트는 boolean 만 받는다.
import { NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/admin'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get('projectId') ?? ''
    if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
      return NextResponse.json({ debugPrompts: false })
    }
    const user = await getUser()
    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ debugPrompts: false })
    }
    // 소유 체인: projects.workspace_id → workspaces.owner_id (projects 에 user 컬럼 없음).
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .maybeSingle()
    if (!project?.workspace_id) return NextResponse.json({ debugPrompts: false })
    const { data: ws } = await supabaseAdmin
      .from('workspaces')
      .select('owner_id')
      .eq('id', project.workspace_id)
      .maybeSingle()
    return NextResponse.json({ debugPrompts: ws?.owner_id === user.id })
  } catch {
    return NextResponse.json({ debugPrompts: false })
  }
}
