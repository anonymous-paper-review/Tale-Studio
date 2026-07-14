import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { falImageGenerate } from '@/lib/writer/llm/fal'

function getApiKey(): string {
  const keys = process.env.GOOGLE_API_KEYS ?? ''
  const first = keys.split(',')[0]?.split(':')[0]?.trim()
  if (!first) throw new Error('GOOGLE_API_KEYS is not configured')
  return first
}

// Vercel serverless function timeout (seconds) — 60s for Pro, 10s for Hobby
export const maxDuration = 300

/* ── Tailscale self-hosted image gen (Qwen/FLUX etc.) ── */
async function generateViaTailscale(
  prompt: string,
  aspectRatio: string,
): Promise<Response> {
  const baseUrl = process.env.TAILSCALE_IMAGE_API_URL
  if (!baseUrl) {
    throw new Error('TAILSCALE_IMAGE_API_URL is not configured')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300_000) // 5min for self-hosted image gen

  const res = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: '',
      aspect_ratio: aspectRatio,
      num_inference_steps: 50,
      true_cfg_scale: 4.0,
      seed: -1,
    }),
    signal: controller.signal,
  })

  clearTimeout(timeout)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Tailscale image API error (${res.status}): ${text}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(buffer.length),
    },
  })
}

/* ── Gemini 2.5 Flash Image (Nano Banana, free tier) ──
 * Imagen 은 paid plan 전용이라 검증용으로 무료 Nano Banana 사용.
 * paid plan 확보 후 imagen-4.0-generate-001 복원 가능.
 */
async function generateViaGemini(
  prompt: string,
  aspectRatio: string,
): Promise<Response> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() })

  const aspectHint =
    aspectRatio === '16:9'
      ? ' Compose as widescreen 16:9 aspect ratio.'
      : ' Compose as square 1:1 aspect ratio.'

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: `${prompt}${aspectHint}`,
    config: {
      responseModalities: ['Text', 'Image'],
    },
  })

  const parts = response.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData?.data)
  if (!imagePart?.inlineData?.data) {
    throw new Error('Nano Banana 응답에 이미지가 없습니다')
  }

  const buffer = Buffer.from(imagePart.inlineData.data, 'base64')
  const mimeType = imagePart.inlineData.mimeType ?? 'image/png'

  return new Response(buffer, {
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length),
    },
  })
}

/* ── fal.ai (default) ──
 * T2I: openai/gpt-image-2. I2I: referenceImageUrls 있으면 fal 래퍼가 자동으로
 * openai/gpt-image-2/edit (image_urls 입력) 으로 라우팅한다 (src/lib/writer/llm/fal.ts).
 * fal은 호스팅 URL을 반환하므로, 기존 호출부(blob 소비) 계약 유지를 위해 바이트로 다시 받아 반환한다.
 */
async function generateViaFal(
  prompt: string,
  aspectRatio: string,
  referenceImageUrls?: string[],
): Promise<Response> {
  const { url } = await falImageGenerate({
    prompt,
    aspect_ratio: aspectRatio,
    reference_image_urls: referenceImageUrls?.length
      ? referenceImageUrls
      : undefined,
  })

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
  let providerUsed: 'fal' | 'tailscale' | 'gemini' = 'fal'
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      prompt,
      aspectRatio = '1:1',
      provider,
      referenceImageUrls,
    } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 },
      )
    }

    // provider: 'fal' (default, T2I+I2I) | 'tailscale' | 'gemini'
    providerUsed =
      provider === 'tailscale'
        ? 'tailscale'
        : provider === 'gemini'
          ? 'gemini'
          : 'fal'
    if (providerUsed === 'tailscale') {
      return await generateViaTailscale(prompt, aspectRatio)
    }
    if (providerUsed === 'gemini') {
      return await generateViaGemini(prompt, aspectRatio)
    }
    return await generateViaFal(prompt, aspectRatio, referenceImageUrls)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate/image]', {
      provider: providerUsed,
      hasFalKey: !!process.env.FAL_KEY,
      hasGoogleKey: !!process.env.GOOGLE_API_KEYS,
      hasTailscaleUrl: !!process.env.TAILSCALE_IMAGE_API_URL,
      message,
    })
    return NextResponse.json(
      { error: `[${providerUsed}] ${message}` },
      { status: 500 },
    )
  }
}
