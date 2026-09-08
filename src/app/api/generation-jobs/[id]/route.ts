// GET /api/generation-jobs/[id] — 인증된 작업 상태 조회 (프론트 polling 경로).
//
// 보안: getUser() + 소유권(project→workspace.owner) 확인. generation_jobs는 RLS로 클라 직접 접근
//       불가하므로 이 라우트(service-role)만 노출 창구다.
// 견고성: 아직 queued면 FAL 큐를 직접 reconcile — webhook이 안 왔어도(로컬 터널 없음 등) 결과를 즉시 영속화.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import {
  deleteGenerationJobById,
  getGenerationJobById,
  userOwnsProject,
} from '@/lib/generation-jobs'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'
import { releaseTakesForJob } from '@/lib/billing/take-hold'

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

  // 확인 중 터진 예외를 화면으로 흘리지 않는다(#poll-keeps-queued 2026-09-08).
  //   finalize 는 일시적 저장 실패에 DirectorVideoCompletionPersistenceError 를 던진다 —
  //   "queued 로 두고 나중에 다시 하자" 는 신호다(reconcile.ts 주석: retaining queued attempt).
  //   그걸 안 받고 보내면 프레임워크가 500 을 만들고, 화면은 res.ok 가 아니면 status:'failed' 로
  //   굳히고 폴링을 끝낸다(generation-jobs-client.ts) — 서버 의도("기다려")와 정반대 결과다.
  //   나중에 webhook 이 정상 처리해도 그 화면은 갱신되지 않는다.
  //   알 수 없는 오류도 같이 삼킨다 — 확인 한 번 실패했다고 진행 중인 생성을 죽일 이유가 없고,
  //   다음 폴링·webhook·유령 청소부가 다시 묻는다. DB 상태(queued)를 그대로 돌려준다.
  if (job.status === 'queued') {
    try {
      job = await reconcileJobFromFal(job)
    } catch (err) {
      console.error('[generation-jobs] reconcile failed; keeping queued:', id, err instanceof Error ? err.message : err)
    }
  }

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

// DELETE — 큐 콘솔의 좀비(queued)·실패 잡 정리 (#queue-console 2026-08-18).
//   completed 는 활동 로그·산출 이력의 재료라 지우지 않는다(409). 소유권 가드는 GET 과 동일.
export async function DELETE(
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
  const job = await getGenerationJobById(id)
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
  if (job.status === 'completed') {
    return NextResponse.json(
      { ok: false, error: { code: 'completed_job', message: 'completed jobs are kept as history' } },
      { status: 409 },
    )
  }

  // 지우기 전에 잡아둔 Take 를 돌려준다(#queue-delete-release 2026-09-08) — 행이 사라지면
  //   take_ledger.ref_id 가 가리키던 잡을 다시 찾을 길이 없어 hold 가 고아로 남는다.
  //   RPC 는 hold 가 없으면 0 을 돌려주므로(20260902150000:133) kind 무관 무조건 불러도 안전하다.
  //   되돌리기가 실패하면 지우지 않는다 — 다음 시도에 다시 돌려받을 근거를 남긴다.
  try {
    await releaseTakesForJob(id)
  } catch (err) {
    console.error('[generation-jobs] release before delete failed:', id, err)
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'release_failed',
          message: 'could not return held takes — job kept so it can be retried',
        },
      },
      { status: 500 },
    )
  }
  await deleteGenerationJobById(id)
  return NextResponse.json({ ok: true, data: { deleted: id } })
}
