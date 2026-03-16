import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { createKlingToken, cameraToText, KLING_API_BASE } from '@/lib/kling'
import type { CameraConfig } from '@/types'

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { shotId, prompt, camera, durationSeconds, aspectRatio } =
      (await req.json()) as {
        shotId: string
        prompt: string
        camera?: CameraConfig
        durationSeconds?: number
        aspectRatio?: string
      }

    if (!shotId || !prompt) {
      return NextResponse.json(
        { error: 'shotId and prompt are required' },
        { status: 400 },
      )
    }

    const token = createKlingToken()

    // kling-v2-master: convert 6-axis camera values to natural language in prompt
    const cameraText = camera ? cameraToText(camera) : ''
    const fullPrompt = cameraText
      ? `${prompt}. ${cameraText}.`.slice(0, 500)
      : prompt.slice(0, 500)

    const body = {
      model_name: 'kling-v2-master',
      prompt: fullPrompt,
      negative_prompt: 'blurry, low quality, distorted, deformed',
      duration: String(Math.min(durationSeconds ?? 5, 10)),
      aspect_ratio: aspectRatio ?? '16:9',
      mode: 'std',
    }

    const res = await fetch(`${KLING_API_BASE}/videos/text2video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(
        errBody.message ?? errBody.error ?? `Kling API error: ${res.status}`,
      )
    }

    const data = await res.json()
    const taskId = data.data?.task_id

    if (!taskId) {
      throw new Error('No task_id returned from Kling API')
    }

    return NextResponse.json({
      shotId,
      taskId,
      status: 'generating',
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/generate-video]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
