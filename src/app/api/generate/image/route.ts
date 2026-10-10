import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { userOwnsProject } from '@/lib/generation-jobs'
import { generateReservedImage } from '@/lib/fal/generate-image'
import { capacityReservationRejection } from '@/lib/api/quota'
import { assertUserTextAllowed, type ModerationReceipt } from '@/lib/moderation/creem'
import { moderationRejectionResponse } from '@/lib/api/moderation'
import {
  isImageModelKey,
  resolveImageEndpoint,
  type ImageModelKey,
} from '@/lib/image-models'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { shotImageAspectRatio } from '@/lib/project-aspect'
import { parseProjectFormat, type ProjectFormat } from '@/types/project'

async function projectFormatOf(projectId: string): Promise<ProjectFormat | null> {
  const { data } = await supabaseAdmin.from('projects').select('settings').eq('id', projectId).maybeSingle()
  return parseProjectFormat((data as { settings?: { format?: unknown } | null } | null)?.settings?.format)
}

// Vercel serverless function timeout (seconds) — 60s for Pro, 10s for Hobby
export const maxDuration = 300

/* ── fal.ai (default) ──
 * T2I: openai/gpt-image-2. I2I: referenceImageUrls 있으면 fal 래퍼가 자동으로
 * openai/gpt-image-2/edit (image_urls 입력) 으로 라우팅한다 (src/lib/writer/llm/fal.ts).
 * generateReservedImage가 자리 예약·제출·완료 기록을 맡고, fal 호스팅 URL은 기존 호출부(blob 소비)
 * 계약 유지를 위해 바이트로 다시 받아 반환한다.
 */
async function generateViaFal(
  prompt: string,
  aspectRatio: string,
  referenceImageUrls: string[] | undefined,
  imageModel: ImageModelKey | undefined,
  moderation: ModerationReceipt,
  context: { projectId: string; userId?: string },
): Promise<Response> {
  const resolvedModel = imageModel
    ? resolveImageEndpoint(imageModel, !!referenceImageUrls?.length).endpoint
    : undefined
  if (!context?.projectId) {
    throw new Error('Project ID is required')
  }
  const { url } = await generateReservedImage(
    {
      ...(resolvedModel ? { model: resolvedModel } : {}),
      prompt,
      aspect_ratio: aspectRatio,
      reference_image_urls: referenceImageUrls?.length
        ? referenceImageUrls
        : undefined,
      moderation,
    },
    context,
  )

  const imgRes = await fetch(url)
  if (!imgRes.ok) {
    throw new Error(`fal image fetch failed (${imgRes.status})`)
  }
  const buffer = Buffer.from(await imgRes.arrayBuffer())
  const contentType = imgRes.headers.get('content-type') ?? 'image/png'

  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
    },
  })
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      prompt,
      aspectRatio = '1:1',
      referenceImageUrls,
      imageModel,
      projectId,
      aspectFromProject,
    } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: prompt is required' },
        { status: 400 },
      )
    }
    if (imageModel !== undefined && !isImageModelKey(imageModel)) {
      return NextResponse.json(
        { error: 'Invalid request: imageModel is invalid' },
        { status: 400 },
      )
    }

    // 생성기는 fal 하나다(#creem-moderation 2026-10-11): 예전 tailscale·gemini 갈래는 작업 기록도
    //   자리 예약도 Creem 검사도 없이 모델로 바로 나가는 구멍이었다(실측: 두 갈래 모두 UI 스위치 없음).
    //   갈래를 지우는 것이 "검사 없는 경로가 없다"의 가장 확실한 보장이다.
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }
    if (!(await userOwnsProject(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Director 수동 샷 실사 이미지(2026-09-30): 화면은 비율을 계산하지 않고 표시만 보낸다 — 서버가 Producer 포맷을 읽는다
    //   (영상·Writer 샷 이미지 경로와 같은 규칙). 표시가 없는 호출(에셋 노드 등)은 종전대로 요청 값.
    const effectiveAspectRatio =
      aspectFromProject === true ? shotImageAspectRatio(await projectFormatOf(projectId)) : aspectRatio
    // #creem-moderation: 자리 예약(generateReservedImage) 전에 사용자가 보낸 프롬프트를 검사한다 —
    //   이 라우트의 프롬프트는 호출부가 조립한 값이지만 사용자 글이 그 안에 그대로 실린다.
    let moderation
    try {
      moderation = await assertUserTextAllowed([prompt], {
        projectId,
        kind: 'image_generation',
        userId: user.id,
      })
    } catch (error) {
      const rejected = moderationRejectionResponse(error, {
        projectId,
        kind: 'image_generation',
        userId: user.id,
      })
      if (rejected) return rejected
      throw error
    }
    try {
      return await generateViaFal(
        prompt,
        effectiveAspectRatio,
        referenceImageUrls,
        imageModel,
        moderation,
        { projectId, userId: user.id },
      )
    } catch (error) {
      const rejected = capacityReservationRejection(error, {
        projectId,
        kind: 'image_generation',
        userId: user.id,
      })
      if (rejected) return rejected
      throw error
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate/image]', {
      hasFalKeys: !!process.env.FAL_KEYS,
      message,
    })
    return NextResponse.json(
      { error: `[fal] ${message}` },
      { status: 500 },
    )
  }
}
