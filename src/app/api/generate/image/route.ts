import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'

function getApiKey(): string {
  const keys = process.env.GOOGLE_API_KEYS ?? ''
  // Format: "key1,key2" or "key1:alias,key2:alias"
  const first = keys.split(',')[0]?.split(':')[0]?.trim()
  if (!first) throw new Error('GOOGLE_API_KEYS is not configured')
  return first
}

export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio = '1:1' } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 },
      )
    }

    const ai = new GoogleGenAI({ apiKey: getApiKey() })

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio as '1:1' | '16:9',
        },
      },
    })

    const part = response.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData,
    )

    if (!part?.inlineData) {
      return NextResponse.json(
        { error: 'No image generated' },
        { status: 500 },
      )
    }

    const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`

    return NextResponse.json({ url: dataUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate/image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
