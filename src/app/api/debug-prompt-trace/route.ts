// GET /api/debug-prompt-trace?projectId=&shotId= — 최종 전송 프롬프트 조회(#debug-prompts 확장).
//   generation_jobs.input_snapshot 에서 샷의 kind 별 최신 잡 프롬프트를 돌려준다.
//   관리자 소유 프로젝트 한정 — 비관리자/미인증은 빈 목록(200, UI 는 조용히 미표시).
import { NextResponse } from 'next/server'
import { isAdminOwnedProject } from '@/lib/admin'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { PROMPT_TRACE_KINDS, selectPromptTrace, type PromptTraceJobRow } from '@/lib/prompt-trace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId') ?? ''
    const shotId = url.searchParams.get('shotId') ?? ''
    if (!/^[0-9a-f-]{36}$/i.test(projectId) || !shotId || shotId.length > 64) {
      return NextResponse.json({ items: [] })
    }
    const user = await getUser()
    if (!user || !(await isAdminOwnedProject(user, projectId))) {
      return NextResponse.json({ items: [] })
    }
    const { data } = await supabaseAdmin
      .from('generation_jobs')
      .select('kind, status, created_at, input_snapshot, target')
      .eq('project_id', projectId)
      .in('kind', [...PROMPT_TRACE_KINDS])
      .order('created_at', { ascending: false })
      .limit(80)
    return NextResponse.json({ items: selectPromptTrace((data ?? []) as PromptTraceJobRow[], shotId) })
  } catch (e) {
    console.error('[debug-prompt-trace]', e instanceof Error ? e.message : e)
    return NextResponse.json({ items: [] })
  }
}
