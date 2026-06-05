import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { fal } from '@fal-ai/client'
import {
  getGenerationJobByRequestId,
  failGenerationJob,
} from '@/lib/generation-jobs'
import { finalizeShotVideoJob } from '@/lib/fal/finalize'

fal.config({ credentials: () => process.env.FAL_KEY ?? '' })

// 이 polling 라우트는 webhook의 reconcile 백스톱을 겸한다 — webhook이 안 와도(로컬 터널 없음 등)
// 완료를 감지하면 매칭되는 generation_jobs 행을 finalize(shots.video_url 갱신 + 완료)한다.
// taskId === fal request_id. 실패해도 client 응답엔 영향 없도록 best-effort.
async function reconcileVideoJob(
  requestId: string,
  outcome: { url: string } | { error: string },
): Promise<void> {
  try {
    const job = await getGenerationJobByRequestId(requestId)
    if (!job || job.status !== 'queued') return
    if ('url' in outcome) {
      await finalizeShotVideoJob(job, outcome.url)
    } else {
      await failGenerationJob(job.id, outcome.error)
    }
  } catch (e) {
    console.error(
      '[director/generate-video/poll] job reconcile failed:',
      e instanceof Error ? e.message : e,
    )
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const { searchParams } = new URL(req.url)
    const provider = searchParams.get('provider') ?? 'fal'
    const model = searchParams.get('model') ?? 'fal-ai/kling-video/v2.1/master/text-to-video'

    /* ── Local provider: taskId is already the full video URL ── */
    if (provider === 'local') {
      return NextResponse.json({ status: 'completed', url: taskId })
    }

    /* ── FAL provider: poll queue status ── */
    const status = await fal.queue.status(model, {
      requestId: taskId,
      logs: false,
    })

    const queueStatus = status.status as string

    if (queueStatus === 'COMPLETED') {
      const result = await fal.queue.result(model, {
        requestId: taskId,
      })

      const videoUrl = (result.data as { video?: { url?: string } })?.video?.url

      if (videoUrl) {
        await reconcileVideoJob(taskId, { url: videoUrl })
        return NextResponse.json({ status: 'completed', url: videoUrl })
      }
      await reconcileVideoJob(taskId, { error: 'No video URL in result' })
      return NextResponse.json({
        status: 'failed',
        error: 'No video URL in result',
      })
    }

    if (queueStatus === 'FAILED') {
      await reconcileVideoJob(taskId, { error: 'Video generation failed' })
      return NextResponse.json({
        status: 'failed',
        error: 'Video generation failed',
      })
    }

    // IN_QUEUE or IN_PROGRESS
    return NextResponse.json({ status: 'generating' })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/generate-video/poll]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
