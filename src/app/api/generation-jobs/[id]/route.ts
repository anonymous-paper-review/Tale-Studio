// GET /api/generation-jobs/[id] — 인증된 작업 상태 조회 (프론트 polling 경로).
//
// 보안: getUser() + 소유권(project→workspace.owner) 확인. generation_jobs는 RLS로 클라 직접 접근
//       불가하므로 이 라우트(service-role)만 노출 창구다.
// 견고성: 아직 queued면 FAL 큐를 직접 reconcile — webhook이 안 왔어도(로컬 터널 없음 등) 결과를 즉시 영속화.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import {
  getGenerationJobById,
  failGenerationJob,
  userOwnsProject,
  type GenerationJob,
} from '@/lib/generation-jobs'
import { falImageFetch, falVideoFetch } from '@/lib/writer/llm/fal'
import {
  finalizeCharacterViewJob,
  finalizeWorldShotJob,
  finalizeShotStoryboardJob,
  finalizeShotVideoJob,
} from '@/lib/fal/finalize'

export const runtime = 'nodejs'
export const maxDuration = 60

/** queued 상태면 FAL을 직접 확인해 완료/실패를 반영 (webhook 누락 대비 안전망). */
async function reconcile(job: GenerationJob): Promise<GenerationJob> {
  try {
    if (job.kind === 'shot_video') {
      const r = await falVideoFetch(job.model, job.request_id)
      if (r.status === 'COMPLETED') {
        const url = await finalizeShotVideoJob(job, r.url)
        return { ...job, status: 'completed', result_url: url }
      }
      if (r.status === 'FAILED') {
        await failGenerationJob(job.id, r.error)
        return { ...job, status: 'failed', error: r.error }
      }
    } else {
      // 이미지 계열 (character_view / world_shot / shot_storyboard)
      const r = await falImageFetch(job.model, job.request_id)
      if (r.status === 'COMPLETED') {
        let url: string
        if (job.kind === 'character_view') url = await finalizeCharacterViewJob(job, r.url)
        else if (job.kind === 'world_shot') url = await finalizeWorldShotJob(job, r.url)
        else url = await finalizeShotStoryboardJob(job, r.url)
        return { ...job, status: 'completed', result_url: url }
      }
      if (r.status === 'FAILED') {
        await failGenerationJob(job.id, r.error)
        return { ...job, status: 'failed', error: r.error }
      }
    }
  } catch (e) {
    // 일시 오류 → queued 유지, 다음 polling에서 재시도
    console.error(
      '[generation-jobs] reconcile failed:',
      e instanceof Error ? e.message : e,
    )
  }
  return job
}

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

  if (job.status === 'queued') job = await reconcile(job)

  return NextResponse.json({
    ok: true,
    data: {
      status: job.status,
      resultUrl: job.result_url,
      error: job.error,
      kind: job.kind,
    },
  })
}
