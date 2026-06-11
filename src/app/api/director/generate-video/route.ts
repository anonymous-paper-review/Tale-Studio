import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { fal } from '@fal-ai/client'
import { cameraToText } from '@/lib/kling'
import { findCameraMovement, findCameraBrand } from '@/lib/knowledge'
import { createGenerationJob } from '@/lib/generation-jobs'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import {
  VIDEO_MODELS,
  clampDuration,
  normalizeProvider,
  type VideoModelKey,
} from '@/lib/video-models'
import type { CameraConfig, CameraPreset } from '@/types'

fal.config({ credentials: () => process.env.FAL_KEY ?? '' })

// reference-to-video는 레퍼런스 이미지가 필수. 레퍼런스 없는 T2V는 이 Kling 엔드포인트로 폴백.
const FAL_T2V_FALLBACK_MODEL = 'fal-ai/kling-video/v2.1/master/text-to-video'

export const maxDuration = 300

type VideoProvider = 'fal' | 'local'
type GenerationMethod = 'T2V' | 'I2V'

/* ── FAL.ai T2V fallback (레퍼런스 이미지 없음) ── */
async function submitFalT2VFallback(
  prompt: string,
  durationSeconds: number,
  aspectRatio: string,
  webhookUrl?: string,
) {
  const input = {
    prompt,
    negative_prompt: 'blurry, low quality, distorted, deformed',
    duration: durationSeconds >= 10 ? ('10' as const) : ('5' as const),
    aspect_ratio: (aspectRatio ?? '16:9') as '16:9',
  }
  const { request_id } = await fal.queue.submit(
    FAL_T2V_FALLBACK_MODEL,
    webhookUrl ? { input, webhookUrl } : { input },
  )
  return {
    taskId: request_id,
    provider: 'fal' as const,
    model: FAL_T2V_FALLBACK_MODEL,
  }
}

/* ── FAL.ai reference-to-video (레지스트리 기반, #5) ── */
async function submitFalReferenceToVideo(
  modelKey: VideoModelKey,
  prompt: string,
  imageUrl: string,
  durationSeconds: number,
  aspectRatio: string,
  webhookUrl?: string,
) {
  const spec = VIDEO_MODELS[modelKey]
  // string 타입 엔드포인트 → InputType이 Record<string, any>로 풀려 유연 구성 가능.
  const endpoint: string = spec.endpoint
  const input: Record<string, unknown> = {
    prompt,
    negative_prompt: 'blurry, low quality, distorted, deformed',
    [spec.refParam]: [imageUrl],
  }

  // duration: flexible=정수(clamp), fixed(veo)='8s'
  if (spec.duration.mode === 'fixed') {
    input.duration = spec.duration.value
  } else {
    input.duration = clampDuration(spec, durationSeconds)
  }

  // audio: 토글 있는 모델만, 기본 OFF
  if (spec.audioParam) {
    input[spec.audioParam] = spec.audioDefault
  }

  // resolution: 노출하는 모델만 기본 해상도
  if (spec.resolutions.length > 0) {
    input.resolution = spec.defaultResolution
  }

  // aspect_ratio: kling-o3는 미노출(확실치 않아 omit), 그 외 전달
  if (modelKey !== 'kling-o3') {
    input.aspect_ratio = aspectRatio ?? '16:9'
  }

  const { request_id } = await fal.queue.submit(
    endpoint,
    webhookUrl ? { input, webhookUrl } : { input },
  )
  return { taskId: request_id, provider: 'fal' as const, model: endpoint }
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

    // 멀티유저 쿼터 (Phase 3): 유저 in-flight 작업이 상한이면 429.
    const quota = await checkUserQuota(user.id)
    if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })

    const {
      shotId,
      projectId,
      writerShotId,
      prompt,
      camera,
      durationSeconds,
      aspectRatio,
      generationMethod = 'T2V',
      provider,
      model,
      referenceImageUrl,
      movementPreset,
      cameraPreset,
    } = (await req.json()) as {
      shotId: string
      projectId?: string
      writerShotId?: string | null
      prompt: string
      camera?: CameraConfig
      durationSeconds?: number
      aspectRatio?: string
      generationMethod?: GenerationMethod
      provider?: VideoProvider
      model?: string
      referenceImageUrl?: string
      movementPreset?: string | null
      cameraPreset?: CameraPreset | null
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
    // Camera gear (brand / focal / aperture / WB) — always included if set
    let gearFragment = ''
    if (cameraPreset) {
      const brandName =
        findCameraBrand(cameraPreset.brand)?.full_name ?? cameraPreset.brand
      gearFragment = `shot on ${brandName}, ${cameraPreset.focalLength}mm, f/${cameraPreset.aperture}, white balance ${cameraPreset.whiteBalance}K`
    }
    const baseFullPrompt = [prompt, movementFragment, gearFragment, cameraText]
      .filter(Boolean)
      .join('. ')
      .slice(0, 500)

    // 모델 결정 (#5): model 우선 → legacy provider('local'→local, 그 외 fal 기본 모델).
    // model 없고 provider==='local'이면 local 경로.
    const modelKey: VideoModelKey =
      model != null
        ? normalizeProvider(model)
        : provider === 'local'
          ? 'local'
          : normalizeProvider('')
    const isLocal = modelKey === 'local'
    const dur = durationSeconds ?? 5

    // Veo 2안 (#4): API가 8초 고정 → 설계 길이만큼만 액션, 이후 black screen 지시를 prompt에 덧붙임.
    // 에디터가 durationSeconds로 트림하므로 N초 뒤 검은 화면은 컷되어 보이지 않는다.
    let fullPrompt = baseFullPrompt
    if (modelKey === 'veo' && dur < 8) {
      const blackInstruction = ` Show the described action only for the first ${dur} seconds; after ${dur}s the frame must be a completely black screen — no subject, no motion — until the video ends.`
      fullPrompt = (baseFullPrompt + blackInstruction).slice(0, 800)
    }

    let result: { taskId: string; provider: string; model: string }

    if (isLocal) {
      result =
        generationMethod === 'I2V'
          ? await submitLocalI2V(fullPrompt, referenceImageUrl!)
          : await submitLocalT2V(fullPrompt)
    } else {
      // webhook 전환: fal 큐에 webhookUrl 전달 → 완료 시 /api/fal/webhook가 서버사이드로 결과 영속.
      // 기존 client polling(generate-video/[taskId])은 fallback으로 유지된다.
      const webhookUrl = resolveWebhookUrl()
      // reference-to-video는 이미지 필수 — 레퍼런스 있으면 레지스트리 모델, 없으면 Kling T2V 폴백.
      result = referenceImageUrl
        ? await submitFalReferenceToVideo(
            modelKey,
            fullPrompt,
            referenceImageUrl,
            dur,
            aspectRatio ?? '16:9',
            webhookUrl,
          )
        : await submitFalT2VFallback(
            fullPrompt,
            dur,
            aspectRatio ?? '16:9',
            webhookUrl,
          )

      // generation_jobs 행 — webhook이 shots.video_url을 갱신하려면 projectId+writerShotId 필요.
      // 둘 다 있을 때만 추적(수동 노드 등 writerShotId 없는 경우는 client polling만으로 처리).
      if (projectId && writerShotId) {
        try {
          await createGenerationJob({
            projectId,
            requestId: result.taskId,
            model: result.model,
            kind: 'shot_video',
            userId: user.id,
            provider: result.provider,
            inputSnapshot: {
              prompt,
              full_prompt: fullPrompt,
              camera,
              duration_seconds: dur,
              aspect_ratio: aspectRatio ?? '16:9',
              generation_method: generationMethod,
              provider,
              model,
              resolved_model_key: modelKey,
              reference_image_url: referenceImageUrl,
              movement_preset: movementPreset,
              camera_preset: cameraPreset,
            },
            target: { shotId, writerShotId },
          })
        } catch (e) {
          console.error('[director/generate-video] job create failed:', e instanceof Error ? e.message : e)
        }
      }
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
