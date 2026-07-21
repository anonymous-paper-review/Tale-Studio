// GET /api/generation-jobs/[id] — 인증된 작업 상태 조회 (프론트 polling 경로).
//
// 보안: getUser() + 소유권(project→workspace.owner) 확인. generation_jobs는 RLS로 클라 직접 접근
//       불가하므로 이 라우트(service-role)만 노출 창구다.
// 견고성: 아직 queued면 FAL 큐를 직접 reconcile — webhook이 안 왔어도(로컬 터널 없음 등) 결과를 즉시 영속화.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { getGenerationJobById, userOwnsProject } from '@/lib/generation-jobs'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } },
      { status: 401 },
    )
  }

  const { id } = await params
  let job = await getGenerationJobById(id)
  if (!job) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_found', message: 'job not found' } },
      { status: 404 },
    )
  }

  if (!(await userOwnsProject(job.project_id, user.id))) {
    return NextResponse.json(
      { ok: false, error: { code: 'forbidden', message: 'forbidden' } },
      { status: 403 },
    )
  }

  if (job.status === 'queued') job = await reconcileJobFromFal(job)

  return NextResponse.json({
    ok: true,
    data: {
      status: job.status,
      resultUrl: job.result_url,
      error: job.error,
      kind: job.kind,
      videoClipId: job.video_clip_id,
    },
  })
}
