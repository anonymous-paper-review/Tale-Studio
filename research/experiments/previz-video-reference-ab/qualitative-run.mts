// 정성평가 1차 자산 — 움직임 전달 3방식 (sh_04_16 × 3암 × 1회, 판정 없이 수집만).
//   패턴 선례: ti2v-camera-cap-recheck/probe.mts — 제품 spec(VIDEO_MODELS/clampDuration)을
//   import해 input을 구성하고, 좌표(요청 payload 전문 + request_id)를 manifest.json에 기록.
//   프롬프트는 ti2v 실험 T1 동결 전문을 provenance.json에서 회수(재생성 금지 — 입력 고정).
// 3암 (전부 bytedance/seedance-2.0/reference-to-video, 720p, 7s):
//   a: 동결 프롬프트 + [START]
//   b: 동결 프롬프트 + [START, END]
//   c: 동결 프롬프트 + [START] + video_urls=[블록아웃 mp4 (Blender 코드 유도, fal storage 업로드)]
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/qualitative-run.mts submit
//       pnpm dlx tsx research/experiments/previz-video-reference-ab/qualitative-run.mts collect
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS, clampDuration } from '@/lib/video-models'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const QUAL = join(DIR, 'qualitative')
const MANIFEST = join(QUAL, 'manifest.json')
const TI2V_PROV = join(DIR, '..', 'ti2v-camera-cap-recheck', 'provenance.json')
const PROJECT_ID = '6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a' // Sample2
const SHOT_ID = 'sh_04_16'

const spec = VIDEO_MODELS.seedance
// 단가 실측 (fal 모델 페이지 2026-08-11): 720p $0.3024/s, video input 동반 시 $0.1814/s,
//   generate_audio 무관 오디오 무료. 제품 레지스트리 pricePerSecNoAudio(0.3024)와 일치.
const RATE_PER_SEC = 0.3024
const RATE_PER_SEC_WITH_VIDEO_INPUT = 0.1814

/** ti2v 실험 T1 동결 프롬프트 + START ref URL 회수 (입력 고정 — 재생성 금지) */
function loadFrozenT1(): { prompt: string; startUrl: string; durationSeconds: number } {
  const prov = JSON.parse(readFileSync(TI2V_PROV, 'utf8'))
  const job = prov.jobs.find((j: { key: string }) => j.key === `${SHOT_ID}__T1`)
  if (!job) throw new Error(`ti2v provenance missing ${SHOT_ID}__T1`)
  return {
    prompt: job.input.prompt as string,
    startUrl: (job.input.image_urls as string[])[0],
    durationSeconds: job.duration_seconds as number,
  }
}

/** END ref는 provenance에 없다(START 단일 발주였음) → 제품 진실원(shots.storyboard_image.frames.end) */
async function loadEndUrl(): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data, error } = await db
    .from('shots')
    .select('storyboard_image')
    .eq('project_id', PROJECT_ID)
    .eq('shot_id', SHOT_ID)
    .single()
  if (error) throw error
  const end: string | undefined = data?.storyboard_image?.frames?.end
  if (!end) throw new Error(`no end frame for ${SHOT_ID}`)
  return end
}

async function uploadBlockout(): Promise<string> {
  const path = join(QUAL, 'blockout.mp4')
  if (!existsSync(path)) throw new Error(`blockout missing: ${path}`)
  const file = new File([readFileSync(path)], 'blockout_sh_04_16.mp4', { type: 'video/mp4' })
  return fal.storage.upload(file)
}

async function submit() {
  const { prompt, startUrl, durationSeconds } = loadFrozenT1()
  const endUrl = await loadEndUrl()
  const blockoutUrl = await uploadBlockout()
  console.log(`blockout uploaded → ${blockoutUrl}`)

  const duration = clampDuration(spec, durationSeconds) // 7 (flexible 4~15)
  const base: Record<string, unknown> = { prompt, duration }
  if (spec.resolutions.length > 0) base.resolution = spec.defaultResolution
  if (spec.audioParam) base[spec.audioParam] = spec.audioDefault

  const arms: Array<{ arm: 'a' | 'b' | 'c'; label: string; input: Record<string, unknown>; rate: number }> = [
    {
      arm: 'a', label: '동결 텍스트 프롬프트 + [START]', rate: RATE_PER_SEC,
      input: { ...base, [spec.refParam]: [startUrl] },
    },
    {
      arm: 'b', label: '동결 텍스트 프롬프트 + [START, END]', rate: RATE_PER_SEC,
      input: { ...base, [spec.refParam]: [startUrl, endUrl] },
    },
    {
      arm: 'c', label: '(a) 구성 + video_urls=[블록아웃]', rate: RATE_PER_SEC_WITH_VIDEO_INPUT,
      input: { ...base, [spec.refParam]: [startUrl], video_urls: [blockoutUrl] },
    },
  ]

  const jobs: Array<Record<string, unknown>> = []
  for (const { arm, label, input, rate } of arms) {
    const { request_id } = await fal.queue.submit(spec.endpoint, { input })
    jobs.push({
      arm, label, request_id,
      endpoint: spec.endpoint,
      model_key: spec.key,
      resolution: base.resolution,
      duration_seconds: duration,
      est_cost_usd: +(rate * duration).toFixed(4),
      rate_per_sec_usd: rate,
      input,
      submitted_at: new Date().toISOString(),
    })
    console.log(`submitted arm ${arm} → ${request_id}`)
  }
  writeFileSync(MANIFEST, JSON.stringify({
    purpose: '움직임 전달 3방식 정성평가 1차 — 수집·관찰 전용 (판정 없음)',
    model: spec.endpoint,
    project_id: PROJECT_ID,
    shot_id: SHOT_ID,
    frozen_prompt_source: 'research/experiments/ti2v-camera-cap-recheck/provenance.json#sh_04_16__T1',
    blockout: {
      generator: 'research/experiments/previz-video-reference-ab/blockout_sh_04_16.py (Blender 5.2.0 headless)',
      fal_url: blockoutUrl,
      local: 'qualitative/blockout.mp4',
    },
    pricing_source: 'fal.ai/models/bytedance/seedance-2.0/reference-to-video (2026-08-11 실측): 720p $0.3024/s, video input 시 $0.1814/s, 오디오 무료',
    jobs,
  }, null, 2))
  console.log(`\n${jobs.length} jobs → ${MANIFEST}`)
}

async function collect() {
  const prov = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  let pending = prov.jobs.filter((j: { done?: boolean; failed?: boolean }) => !j.done && !j.failed)
  const deadline = Date.now() + 20 * 60_000
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (st.status === 'COMPLETED') {
          let data: unknown
          try {
            ;({ data } = await fal.queue.result(job.endpoint, { requestId: job.request_id }))
          } catch (e) {
            // fal 큐는 처리 중 실패도 COMPLETED로 두고 result 422가 실패 상세를 돌려준다 (제품 falVideoFetch와 동일 처리)
            if ((e as { status?: number })?.status === 422) {
              job.failed = true
              job.error = String((e as Error).message ?? e)
              console.error(`FAILED arm ${job.arm}: ${job.error}`)
              continue
            }
            throw e
          }
          const url =
            (data as { video?: { url?: string } })?.video?.url ??
            (data as { video_url?: string })?.video_url
          if (!url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`)
          const dest = join(QUAL, `out_${job.arm}.mp4`)
          const res = await fetch(url)
          writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
          job.done = true
          job.video_url = url
          job.local = dest
          console.log(`done arm ${job.arm} → ${dest}`)
        } else {
          console.log(`... arm ${job.arm}: ${st.status}`)
        }
      } catch (e) {
        console.error(`poll arm ${job.arm}: ${(e as Error).message}`)
      }
    }
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j: { done?: boolean; failed?: boolean }) => !j.done && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  const done = prov.jobs.filter((j: { done?: boolean }) => j.done).length
  console.log(`\ncollected ${done}/${prov.jobs.length}`)
  if (done < prov.jobs.length) process.exitCode = 1
}

const mode = process.argv[2]
if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else throw new Error('usage: qualitative-run.mts submit|collect')
