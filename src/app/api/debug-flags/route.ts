// GET /api/debug-flags?projectId= — 디버그 표면 노출 플래그(#debug-prompts 2026-08-06).
//   debugPrompts: 요청자가 관리자이고 그 관리자가 이 프로젝트의 소유자(workspace owner)일 때만 true.
//   판정 근거(이메일·소유 체인)는 서버에 남고 클라이언트는 boolean 만 받는다.
import { NextResponse } from 'next/server'
import { isAdminOwnedProject } from '@/lib/admin'
import { getUser } from '@/lib/supabase/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get('projectId') ?? ''
    if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
      return NextResponse.json({ debugPrompts: false })
    }
    const user = await getUser()
    if (!user) return NextResponse.json({ debugPrompts: false })
    // debugPrompts = "관리자 소유 프로젝트" 플래그 — 디버그 프롬프트 + 정합 검사(#adherence)가 공유.
    return NextResponse.json({ debugPrompts: await isAdminOwnedProject(user, projectId) })
  } catch {
    return NextResponse.json({ debugPrompts: false })
  }
}
