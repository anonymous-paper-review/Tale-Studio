import { readFileSync } from 'node:fs'
import { fal } from '@fal-ai/client'
const env = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? ''
fal.config({ credentials: get('FAL_KEY') })
const MODEL = 'fal-ai/flux-2/klein/4b/lora'

const ORIG = `Create a single rough storyboard panel for film previsualization, drawn FROM THE CAMERA'S POINT OF VIEW — what the lens sees on screen. This is NOT an overhead map.

Frame: one 16:9 storyboard panel with a thin rectangular border. This is a medium close-up from an eye-level angle, 35mm-lens feel, shallow focus. Compose using the rule of thirds.

Action in frame (midground focus): Close-up on the Elder's face, his eyes wide with horror as he witnesses the dragon's attack.

Figures: draw every character as a featureless wooden mannequin / rough stick figure — no face, no identity. Style: loose, rough, monochrome pencil-sketch storyboard.`
const SOFT = ORIG.replace('his eyes wide with horror as he witnesses the dragon\'s attack', 'looking up startled at a dragon flying overhead')

type FalImageResult = {
  images?: Array<{ url?: string }>
}

type FalSubscribeError = {
  status?: unknown
  body?: { detail?: unknown }
  message?: unknown
}

function imageData(data: unknown): FalImageResult {
  return data as FalImageResult
}

function subscribeError(e: unknown): FalSubscribeError {
  return e as FalSubscribeError
}

async function tryOne(label: string, prompt: string, extra: Record<string, unknown> = {}) {
  try {
    const r = await fal.subscribe(MODEL, { input: { prompt, image_size: 'landscape_16_9', ...extra }, logs: false })
    const data = imageData(r.data)
    console.log(label, '→ ✅ 통과 (url:', data.images?.[0]?.url?.slice(0, 50), ')')
  } catch (e: unknown) {
    const err = subscribeError(e)
    const detail = JSON.stringify(err.body?.detail ?? err.message ?? err).slice(0, 200)
    console.log(label, '→ ❌', err.status, detail)
  }
}
await tryOne('A. 원본 + enable_safety_checker:false', ORIG, { enable_safety_checker: false })
await tryOne('B. 순화 문구 (param 없음)      ', SOFT)
