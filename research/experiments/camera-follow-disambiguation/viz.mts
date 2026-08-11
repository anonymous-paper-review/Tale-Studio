import { config } from 'dotenv'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS, clampDuration } from '@/lib/video-models'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const ROOT = dirname(fileURLToPath(import.meta.url))
const TEXT = join(ROOT, 'text', 'summary.json')
const MODEL = VIDEO_MODELS['happy-horse']
const RATE_PER_SEC = MODEL.pricePerSecNoAudio

async function uploadStart(caseId: string): Promise<string> {
  const path = join(ROOT, 'outputs', caseId, 'previz', 'blockout-0001.png')
  if (!existsSync(path)) throw new Error(`previz start frame missing: ${path}`)
  return fal.storage.upload(new File([readFileSync(path)], `${caseId}-start.png`, { type: 'image/png' }))
}

async function submit() {
  const summary = JSON.parse(readFileSync(TEXT, 'utf8'))
  const jobs: any[] = []
  for (const item of summary.results) {
    const startUrl = await uploadStart(item.id)
    const duration = clampDuration(MODEL, 5)
    const input: Record<string, unknown> = {
      prompt: item.video_prompt,
      duration,
      resolution: MODEL.defaultResolution,
      image_urls: [startUrl],
    }
    const { request_id } = await fal.queue.submit(MODEL.endpoint, { input })
    const record = {
      id: item.id,
      family: item.family,
      expectedCamera: item.expectedCamera,
      expectedTypes: item.expectedTypes,
      camera_intent: item.camera_intent,
      camera_type: item.camera_type,
      request_id,
      endpoint: MODEL.endpoint,
      model_key: MODEL.key,
      duration_seconds: duration,
      resolution: MODEL.defaultResolution,
      est_cost_usd: +(RATE_PER_SEC * duration).toFixed(4),
      input,
      submitted_at: new Date().toISOString(),
    }
    jobs.push(record)
    console.log(`[submit] ${item.id} → ${request_id}`)
  }
  const manifest = {
    purpose: 'camera-follow-disambiguation viz — text dynamic_spec → product buildVideoPrompt → Happy Horse',
    model: MODEL,
    text_source: TEXT,
    jobs,
  }
  const dir = join(ROOT, 'viz')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`[submit] ${jobs.length} jobs · estimated $${jobs.reduce((a, j) => a + j.est_cost_usd, 0).toFixed(2)}`)
}

async function collect() {
  const manifestPath = join(ROOT, 'viz', 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  let pending = manifest.jobs.filter((j: any) => !j.done && !j.failed)
  const deadline = Date.now() + 20 * 60_000
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const status = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (status.status === 'COMPLETED') {
          let data: any
          try {
            ;({ data } = await fal.queue.result(job.endpoint, { requestId: job.request_id }))
          } catch (error: any) {
            if (error?.status === 422) {
              job.failed = true
              job.error = String(error.message ?? error)
              console.error(`[collect] FAILED ${job.id}: ${job.error}`)
              continue
            }
            throw error
          }
          const url = data?.video?.url ?? data?.video_url
          if (!url) throw new Error(`no video url for ${job.id}`)
          const caseDir = join(ROOT, 'outputs', job.id, 'viz')
          mkdirSync(caseDir, { recursive: true })
          const dest = join(caseDir, 'viz.mp4')
          const res = await fetch(url)
          writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
          job.done = true
          job.video_url = url
          job.local = dest
          console.log(`[collect] ${job.id} → ${dest}`)
        } else {
          console.log(`[collect] ${job.id}: ${status.status}`)
        }
      } catch (error: any) {
        console.error(`[collect] ${job.id}: ${error.message ?? error}`)
      }
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    pending = manifest.jobs.filter((j: any) => !j.done && !j.failed)
    if (pending.length) await new Promise((resolve) => setTimeout(resolve, 20_000))
  }
  const done = manifest.jobs.filter((j: any) => j.done).length
  console.log(`[collect] ${done}/${manifest.jobs.length} complete`)
  if (done < manifest.jobs.length) process.exitCode = 1
}

const mode = process.argv[2]
if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else throw new Error('usage: viz.mts submit|collect')
