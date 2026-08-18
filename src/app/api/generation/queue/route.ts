// /api/generation/queue — 큐 콘솔 (#queue-console 2026-08-18).
//
// GET          오너 전 프로젝트 잡 목록 (queued·failed 전부 + 최근 completed 100).
// GET ?id=     잡 1건 상세 — 콘솔 상세 패널용 input_snapshot·result 포함(목록엔 무거워 뺀다).
// POST         queued reconcile: body.ids 지정분, 없으면 오너의 stale queued 전부(상한).
//              reconcile 은 이미 지불한 fal 결과의 회수(무과금·멱등)다 — 재생성이 아니다.
//
// generation_jobs 는 RLS 로 클라 직접 접근 불가 → service-role 라우트만 창구(기존 규약).
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import {
  getGenerationJobById,
  listQueueConsoleJobs,
  userOwnsProject,
  STALE_QUEUED_MS,
} from '@/lib/generation-jobs'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'

export const runtime = 'nodejs'
export const maxDuration = 60

const unauthorized = () =>
  NextResponse.json(
    { ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } },
    { status: 401 },
  )

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) return unauthorized()

  const id = new URL(req.url).searchParams.get('id')
  if (id) {
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
    return NextResponse.json({ ok: true, data: { job } })
  }

  const data = await listQueueConsoleJobs(user.id)
  return NextResponse.json({ ok: true, data })
}

// 한 번에 회수하는 최대치 — reconcile 은 잡당 fal 조회 + (완료 시) finalize 연쇄라 무겁다.
//   Hobby 함수 시간(60s) 안에서 안전한 폭. 남은 좀비는 다음 클릭/일일 워치독이 잇는다.
const RECONCILE_CAP = 10

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown }
  let targets: string[]
  if (Array.isArray(body.ids)) {
    targets = body.ids.filter((v): v is string => typeof v === 'string').slice(0, RECONCILE_CAP)
  } else {
    // 소유권 경계를 목록 lib 한 곳에 두기 위해 같은 조회를 재사용한다.
    const { jobs } = await listQueueConsoleJobs(user.id)
    const cutoff = Date.now() - STALE_QUEUED_MS
    targets = jobs
      .filter((j) => j.status === 'queued' && Date.parse(j.created_at) < cutoff)
      .map((j) => j.id)
      .slice(0, RECONCILE_CAP)
  }

  let checked = 0
  let settled = 0
  for (const id of targets) {
    try {
      const job = await getGenerationJobById(id)
      if (!job || job.status !== 'queued') continue
      if (!(await userOwnsProject(job.project_id, user.id))) continue
      checked += 1
      const after = await reconcileJobFromFal(job)
      if (after.status !== 'queued') settled += 1
    } catch (e) {
      // 잡 하나의 회수 실패가 스윕을 죽이면 안 된다 — 다음 시도(클릭/워치독)가 잇는다.
      console.error('[generation/queue] reconcile failed:', id, e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ ok: true, data: { checked, settled } })
}
