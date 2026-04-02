import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { fal } from '@fal-ai/client'

fal.config({ credentials: () => process.env.FAL_KEY ?? '' })

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

    /* ── Local provider: taskId is the output_path, video is already done ── */
    if (provider === 'local') {
      const baseUrl = process.env.TAILSCALE_VIDEO_API_URL
      if (!baseUrl) {
        return NextResponse.json(
          { status: 'failed', error: 'TAILSCALE_VIDEO_API_URL not configured' },
        )
      }

      // Convert server output_path to downloadable URL
      // e.g. /data/hunyuan/outputs/api/hunyuan_xxx.mp4 → /outputs/api/hunyuan_xxx.mp4
      const outputPath = taskId
      const relativePath = outputPath.replace(/^\/data\/hunyuan\/outputs\//, '')
      const videoUrl = `${baseUrl}/outputs/${relativePath}`

      return NextResponse.json({ status: 'completed', url: videoUrl })
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
        return NextResponse.json({ status: 'completed', url: videoUrl })
      }
      return NextResponse.json({
        status: 'failed',
        error: 'No video URL in result',
      })
    }

    if (queueStatus === 'FAILED') {
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
