import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { fal } from '@fal-ai/client'
import { cameraToText } from '@/lib/kling'
import { findCameraMovement } from '@/lib/knowledge'
import type { CameraConfig } from '@/types'

fal.config({ credentials: () => process.env.FAL_KEY ?? '' })

const FAL_T2V_MODEL = 'fal-ai/kling-video/v2.1/master/text-to-video'
const FAL_I2V_MODEL = 'fal-ai/kling-video/v2.6/pro/image-to-video'

export const maxDuration = 300

type VideoProvider = 'fal' | 'local'
type GenerationMethod = 'T2V' | 'I2V'

/* ── FAL.ai T2V ── */
async function submitFalT2V(
  prompt: string,
  durationSeconds: number,
  aspectRatio: string,
) {
  const { request_id } = await fal.queue.submit(FAL_T2V_MODEL, {
    input: {
      prompt,
      negative_prompt: 'blurry, low quality, distorted, deformed',
      duration: durationSeconds >= 10 ? ('10' as const) : ('5' as const),
      aspect_ratio: (aspectRatio ?? '16:9') as '16:9',
    },
  })
  return { taskId: request_id, provider: 'fal' as const, model: FAL_T2V_MODEL }
}

/* ── FAL.ai I2V ── */
async function submitFalI2V(
  prompt: string,
  imageUrl: string,
  durationSeconds: number,
  aspectRatio: string,
) {
  const { request_id } = await fal.queue.submit(FAL_I2V_MODEL, {
    input: {
      prompt,
      image_url: imageUrl,
      negative_prompt: 'blurry, low quality, distorted, deformed',
      duration: durationSeconds >= 10 ? ('10' as const) : ('5' as const),
      aspect_ratio: (aspectRatio ?? '16:9') as '16:9',
    },
  })
  return { taskId: request_id, provider: 'fal' as const, model: FAL_I2V_MODEL }
}

/* ── Local (Hunyuan) T2V ── */
async function submitLocalT2V(prompt: string) {
  const baseUrl = process.env.TAILSCALE_VIDEO_API_URL
  if (!baseUrl) throw new Error('TAILSCALE_VIDEO_API_URL is not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 290_000) // 4min 50s (under maxDuration)

  const res = await fetch(`${baseUrl}/hunyuan/t2v`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      enable_step_distill: false,
    }),
    signal: controller.signal,
  })

  clearTimeout(timeout)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Local T2V error (${res.status}): ${text}`)
  }

  const data = await res.json() as { output_url?: string; output_path?: string }
  const outputUrl = data.output_url
  if (!outputUrl) throw new Error('output_url missing from server response')
  const videoUrl = new URL(outputUrl, baseUrl).toString()
  return { taskId: videoUrl, provider: 'local' as const, model: 'hunyuan-t2v' }
}

/* ── Local (Hunyuan) I2V ── */
async function submitLocalI2V(prompt: string, imageUrl: string) {
  const baseUrl = process.env.TAILSCALE_VIDEO_API_URL
  if (!baseUrl) throw new Error('TAILSCALE_VIDEO_API_URL is not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 290_000)

  const res = await fetch(`${baseUrl}/hunyuan/i2v`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_url: imageUrl }),
    signal: controller.signal,
  })

  clearTimeout(timeout)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Local I2V error (${res.status}): ${text}`)
  }

  const data = await res.json() as { output_url?: string; output_path?: string }
  const outputUrl = data.output_url
  if (!outputUrl) throw new Error('output_url missing from server response')
  const videoUrl = new URL(outputUrl, baseUrl).toString()
  return { taskId: videoUrl, provider: 'local' as const, model: 'hunyuan-i2v' }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      shotId,
      prompt,
      camera,
      durationSeconds,
      aspectRatio,
      generationMethod = 'T2V',
      provider = 'fal',
      referenceImageUrl,
      movementPreset,
    } = (await req.json()) as {
      shotId: string
      prompt: string
      camera?: CameraConfig
      durationSeconds?: number
      aspectRatio?: string
      generationMethod?: GenerationMethod
      provider?: VideoProvider
      referenceImageUrl?: string
      movementPreset?: string | null
    }

    if (!shotId || !prompt) {
      return NextResponse.json(
        { error: 'shotId and prompt are required' },
        { status: 400 },
      )
    }

    if (generationMethod === 'I2V' && !referenceImageUrl) {
      return NextResponse.json(
        { error: 'referenceImageUrl is required for I2V' },
        { status: 400 },
      )
    }

    // Convert 6-axis camera values to natural language in prompt
    const cameraText = camera ? cameraToText(camera) : ''
    // Inject named movement label for T2V only (I2V relies on cameraToText axis mapping)
    const movementFragment =
      generationMethod === 'T2V' && movementPreset
        ? findCameraMovement(movementPreset)?.prompt_fragment ?? ''
        : ''
    const fullPrompt = [prompt, movementFragment, cameraText]
      .filter(Boolean)
      .join('. ')
      .slice(0, 500)

    let result: { taskId: string; provider: string; model: string }

    if (provider === 'local') {
      result =
        generationMethod === 'I2V'
          ? await submitLocalI2V(fullPrompt, referenceImageUrl!)
          : await submitLocalT2V(fullPrompt)
    } else {
      result =
        generationMethod === 'I2V'
          ? await submitFalI2V(fullPrompt, referenceImageUrl!, durationSeconds ?? 5, aspectRatio ?? '16:9')
          : await submitFalT2V(fullPrompt, durationSeconds ?? 5, aspectRatio ?? '16:9')
    }

    return NextResponse.json({
      shotId,
      taskId: result.taskId,
      provider: result.provider,
      model: result.model,
      status: result.provider === 'local' ? 'completed' : 'generating',
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/generate-video]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
