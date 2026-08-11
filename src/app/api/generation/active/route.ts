// GET /api/generation/active?projectId=... — 프로젝트에서 지금 도는 생성 잡 목록 (#queue-restore).
//
// generation_jobs 는 RLS(ENABLE + policy 없음)라 클라 직접 접근 불가 → service-role 라우트만 창구.
//   소비자는 lib/generation-queue 의 단일 폴러(구독자 여럿이 공유). 스테이지 뷰들이 각자
//   "생성 중" 플래그를 들고 있다가 unmount 에 잃어버리는 대신, 다들 이 진실을 pull 한다.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { listActiveGenerationJobs, userOwnsProject } from '@/lib/generation-jobs'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } },
      { status: 401 },
    )
  }
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: { code: 'bad_request', message: 'projectId required' } },
      { status: 400 },
    )
  }
  if (!(await userOwnsProject(projectId, user.id))) {
    return NextResponse.json(
      { ok: false, error: { code: 'forbidden', message: 'forbidden' } },
      { status: 403 },
    )
  }

  const jobs = await listActiveGenerationJobs(projectId)
  return NextResponse.json({ ok: true, data: { jobs } })
}
