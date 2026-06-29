// GET /api/artist/generation-status?projectId=... — 아티스트 캐릭터 생성 상태(실패/대기) 조회 창구.
//
// generation_jobs 는 RLS(ENABLE+policy 없음)로 클라 직접 접근 불가 → service-role 서버 라우트만 노출.
//   loadData 가 1회 호출해 per-character/per-view 실패(reload-survivable)와 queued main 잡을 받는다.
//   queued main 은 클라가 /api/generation-jobs/[id] 로 reconcile 해 마무리한다(단일 경로).
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import {
  listFailedCharacterViewJobs,
  listQueuedMainJobs,
  userOwnsProject,
} from '@/lib/generation-jobs'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }
  if (!(await userOwnsProject(projectId, user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const [failures, queuedMain] = await Promise.all([
    listFailedCharacterViewJobs(projectId),
    listQueuedMainJobs(projectId),
  ])
  return NextResponse.json({ failures, queuedMain })
}
