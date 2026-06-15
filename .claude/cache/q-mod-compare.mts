// 같은 '걸린 문구'를 gpt-image-2(콘티/캐릭터 경로의 모델)에 보내 모더레이션 차이 확인
import { readFileSync } from 'node:fs'
import { fal } from '@fal-ai/client'
const env = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? ''
fal.config({ credentials: get('FAL_KEY') })

const FLAGGED = `Storyboard panel: Close-up on the Elder's face, his eyes wide with horror as he witnesses the dragon's attack. Mood: chaotic, destructive. Monochrome pencil sketch.`
type FalImageResult = {
  images?: Array<{ url?: string }>
}

type FalSubscribeError = {
  status?: unknown
  body?: { detail?: unknown }
  message?: unknown
}

try {
  const r = await fal.subscribe('openai/gpt-image-2', { input: { prompt: FLAGGED, aspect_ratio: '16:9' }, logs: false })
  const data = r.data as FalImageResult
  console.log('gpt-image-2 → ✅ 통과', data.images?.[0]?.url?.slice(0, 45))
} catch (e: unknown) {
  const err = e as FalSubscribeError
  console.log('gpt-image-2 → ❌', err.status, JSON.stringify(err.body?.detail ?? err.message).slice(0, 200))
}
