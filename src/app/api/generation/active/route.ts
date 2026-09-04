// GET /api/generation/active?projectId=... — 프로젝트에서 지금 도는 생성 잡 목록 (#queue-restore).
//
// generation_jobs 는 RLS(ENABLE + policy 없음)라 클라 직접 접근 불가 → service-role 라우트만 창구.
//   소비자는 lib/generation-queue 의 단일 폴러(구독자 여럿이 공유). 스테이지 뷰들이 각자
//   "생성 중" 플래그를 들고 있다가 unmount 에 잃어버리는 대신, 다들 이 진실을 pull 한다.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { listActiveGenerationJobs, listRecentGenerationJobRows, userOwnsProject } from '@/lib/generation-jobs'
import { completionsOf, summarizeGenerationBatches } from '@/lib/generation-batches'
import { VIDEO_JOB_KINDS } from '@/lib/generation-quota'
import { PROJECT_VIDEO_GENERATION_LIMIT } from '@/lib/plan-limits'
import { reconcileGhostQueuedJobs } from '@/lib/fal/reconcile'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
const RECENT_COMPLETED_MS = 15 * 60_000

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

  // 유령 queued 잡(STALE 초과·폴러 사망) 회수 — 숨기기 전에 fal 진실로 종결 시도(#ghost-reconcile).
  //   프로젝트당 60s 스로틀 + 실패 무해라 4s 폴링 경로에 있어도 안전하다.
  await reconcileGhostQueuedJobs(projectId)

  const jobs = await listActiveGenerationJobs(projectId)
  // #f4: 프로젝트당 영상 생성 사용량 — 이 라우트는 이미 모든 탭이 공유 폴링하므로(4s/15s),
  //   여기 실어 보내면 사이드바 게이지가 추가 폴러 없이 실시간이 된다. count(head) 라 가볍다.
  const { count: videoUsed } = await supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('kind', VIDEO_JOB_KINDS as unknown as string[])
  const videoUsage = { used: videoUsed ?? 0, limit: PROJECT_VIDEO_GENERATION_LIMIT }
  // 약속 D(2026-09-04): 핀 "n/N"·왼쪽 탭 숫자·Director 버튼 숫자의 단일 근거 — 서버 큐에서 파생한 배치와 완료 기록.
  const recentRows = await listRecentGenerationJobRows(projectId)
  const batches = summarizeGenerationBatches(recentRows)
  const completions = completionsOf(recentRows)
  // 스테이지를 떠난 동안 완료된 잡은 클라의 prev active 목록에 한 번도 잡히지 않는다.
  // 복귀 마운트에서만 최근 완료·미반영 잡을 받아 DB 재수화 뒤 ui_reflected 를 찍는다.
  // 평상시 4초 active 폴링에는 쿼리 2개를 더하지 않도록 opt-in 이다(#a2-stage-away).
  if (new URL(req.url).searchParams.get('includeUnreflected') !== '1') {
    return NextResponse.json({ ok: true, data: { jobs, videoUsage, batches, completions } })
  }

  const cutoff = new Date(Date.now() - RECENT_COMPLETED_MS).toISOString()
  const { data: completed, error: completedError } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, kind, target, created_at')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .gte('updated_at', cutoff)
  if (completedError) throw completedError

  const completedIds = (completed ?? []).map((job) => job.id)
  const reflectedIds = new Set<string>()
  if (completedIds.length > 0) {
    const { data: reflected, error: reflectedError } = await supabaseAdmin
      .from('writer_observability_events')
      .select('generation_job_id')
      .eq('project_id', projectId)
      .eq('event', 'ui_reflected')
      .in('generation_job_id', completedIds)
    if (reflectedError) throw reflectedError
    for (const event of reflected ?? []) {
      if (event.generation_job_id) reflectedIds.add(event.generation_job_id)
    }
  }

  const unreflected = (completed ?? [])
    .filter((job) => !reflectedIds.has(job.id))
    .map((job) => ({
      id: job.id,
      kind: job.kind,
      target: job.target,
      startedAt: Date.parse(job.created_at),
    }))
  return NextResponse.json({ ok: true, data: { jobs, unreflected, videoUsage, batches, completions } })
}
