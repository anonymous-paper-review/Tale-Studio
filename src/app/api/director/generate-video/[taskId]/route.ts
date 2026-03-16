import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { createKlingToken, KLING_API_BASE } from '@/lib/kling'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const token = createKlingToken()

    const res = await fetch(
      `${KLING_API_BASE}/videos/text2video/${taskId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(
        errBody.message ?? errBody.error ?? `Kling polling error: ${res.status}`,
      )
    }

    const data = await res.json()
    const taskStatus = data.data?.task_status
    const videos = data.data?.task_result?.videos

    if (taskStatus === 'succeed' && videos?.[0]?.url) {
      return NextResponse.json({
        status: 'completed',
        url: videos[0].url,
      })
    }

    if (taskStatus === 'failed') {
      return NextResponse.json({
        status: 'failed',
        error: data.data?.task_status_msg || 'Video generation failed',
      })
    }

    // Still processing
    return NextResponse.json({ status: 'generating' })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/generate-video/poll]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
