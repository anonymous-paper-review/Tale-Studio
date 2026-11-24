// GET /api/generation-jobs?ids=a,b,c — 여러 작업 상태를 한 번에 조회 (화면 폴링 묶음 경로, 최대 50개).
//
// 단일 라우트([id])와 같은 보안·견고성 규칙을 따른다. 로그인 확인 1회, 소유 확인은 프로젝트당 1회.
// 내 것이 아니거나 없는 id 는 내용 없이 missing 에만 적는다(존재 여부를 흘리지 않는다).
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { getGenerationJobsByIds, userOwnsProject, type GenerationJob } from '@/lib/generation-jobs'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'
import { forgetProviderAsk, shouldAskProvider } from '@/lib/fal/poll-reconcile-gate'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_IDS = 50

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } },
      { status: 401 },
    )
  }

  const raw = new URL(req.url).searchParams.get('ids') ?? ''
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))]
  if (ids.length === 0 || ids.length > MAX_IDS) {
    return NextResponse.json(
      { ok: false, error: { code: 'bad_request', message: `ids must have 1 to ${MAX_IDS} entries` } },
      { status: 400 },
    )
  }

  const rows = await getGenerationJobsByIds(ids)
  const projectIds = [...new Set(rows.map((row) => row.project_id))]
  const ownership = await Promise.all(
    projectIds.map(async (projectId) => [projectId, await userOwnsProject(projectId, user.id)] as const),
  )
  const owned = new Set(ownership.filter(([, ok]) => ok).map(([projectId]) => projectId))
  const mine = rows.filter((row) => owned.has(row.project_id))

  // 확인 중 터진 예외는 queued 로 남긴다(단일 라우트와 같은 이유: 화면이 실패로 굳으면 안 된다).
  const webhookConfigured = resolveWebhookUrl() !== undefined
  const resolved = new Map<string, GenerationJob>(mine.map((job) => [job.id, job]))
  const toAsk = mine.filter((job) => job.status === 'queued' && shouldAskProvider(job, { webhookConfigured }))
  const settled = await Promise.allSettled(toAsk.map((job) => reconcileJobFromFal(job)))
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      resolved.set(toAsk[i].id, outcome.value)
    } else {
      const err = outcome.reason
      console.error('[generation-jobs] reconcile failed; keeping queued:', toAsk[i].id, err instanceof Error ? err.message : err)
    }
  })

  const jobs: Record<string, {
    status: string
    resultUrl: string | null
    error: string | null
    kind: string
    videoClipId: string | null
    confirmationPending?: true
  }> = {}
  for (const job of resolved.values()) {
    if (job.status !== 'queued') forgetProviderAsk(job.id)
    jobs[job.id] = {
      status: job.status,
      resultUrl: job.result_url,
      error: job.error,
      kind: job.kind,
      videoClipId: job.video_clip_id,
      ...(job.kind === 'shot_rough_storyboard' && job.status === 'queued' && job.request_id?.startsWith('reserved:') ? { confirmationPending: true as const } : {}),
    }
  }
  const missing = ids.filter((id) => !(id in jobs))

  return NextResponse.json({ ok: true, data: { jobs, missing } })
}
