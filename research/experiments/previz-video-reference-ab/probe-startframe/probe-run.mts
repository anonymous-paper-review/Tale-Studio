// probe-startframe — 참조 이미지가 "시간 앵커(첫 프레임)"인가 "구도 참조 세트"인가 판별 미니 프로브.
//   패턴 선례: ../qualitative-run.mts — 제품 spec(VIDEO_MODELS)을 import해 endpoint를 얻고,
//   입력은 qualitative/manifest.json 암(b) payload 전문을 회수해 고정(재생성 금지), 프로브 축만 변이.
// 프로브 (각 720p·7s·$2.1168, 합계 ≤ $5 하드캡):
//   p1: (b)와 동일 구성, image_urls 순서만 반전 [END, START]
//   p2: (b)와 동일 구성([START, END] 유지) + 프롬프트에 명시 절 1문장 추가
//       ("The video must open exactly on the composition of the first reference image (@Image1).")
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/probe-startframe/probe-run.mts submit p1
//       pnpm dlx tsx research/experiments/previz-video-reference-ab/probe-startframe/probe-run.mts submit p2
//       pnpm dlx tsx research/experiments/previz-video-reference-ab/probe-startframe/probe-run.mts collect
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS } from '@/lib/video-models'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const spec = VIDEO_MODELS.seedance
const DIR = dirname(fileURLToPath(import.meta.url))
const QUAL_MANIFEST = join(DIR, '..', 'qualitative', 'manifest.json')
const MANIFEST = join(DIR, 'manifest.json')
const RATE_PER_SEC = 0.3024 // fal 페이지 2026-08-11 실측 (qualitative와 동일 좌표)

const PROBE2_CLAUSE =
  'The video must open exactly on the composition of the first reference image (@Image1).'

/** 암(b) 발주 payload 전문 회수 — 입력 고정. 프로브는 이 위에서 축 하나만 변이한다. */
function loadArmB(): { input: Record<string, unknown>; duration: number } {
  const qual = JSON.parse(readFileSync(QUAL_MANIFEST, 'utf8'))
  const b = qual.jobs.find((j: { arm: string }) => j.arm === 'b')
  if (!b) throw new Error('qualitative manifest missing arm b')
  return { input: b.input as Record<string, unknown>, duration: b.duration_seconds as number }
}

function loadManifest(): { jobs: Array<Record<string, unknown>> } {
  if (!existsSync(MANIFEST)) {
    return { jobs: [] }
  }
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

function saveManifest(m: Record<string, unknown>) {
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
}

async function submit(probe: 'p1' | 'p2') {
  const { input: bInput, duration } = loadArmB()
  const refs = bInput.image_urls as string[] // [START, END]
  if (refs.length !== 2) throw new Error(`expected 2 refs in arm b, got ${refs.length}`)

  let input: Record<string, unknown>
  let label: string
  if (probe === 'p1') {
    // 순서만 반전 — 프롬프트·해상도·duration 전부 (b)와 동일
    input = { ...bInput, image_urls: [refs[1], refs[0]] }
    label = '(b) 구성 + image_urls 순서 반전 [END, START]'
  } else {
    // 순서는 (b) 원본 [START, END], 프롬프트에 명시 절 1문장만 추가
    input = { ...bInput, prompt: `${bInput.prompt as string} ${PROBE2_CLAUSE}` }
    label = '(b) 구성 [START, END] + 첫 프레임 고정 명시 절 1문장'
  }

  const manifest = loadManifest()
  if (manifest.jobs.some((j) => j.probe === probe)) throw new Error(`${probe} already submitted`)

  const { request_id } = await fal.queue.submit(spec.endpoint, { input })
  manifest.jobs.push({
    probe,
    label,
    request_id,
    endpoint: spec.endpoint,
    model_key: spec.key,
    resolution: input.resolution,
    duration_seconds: duration,
    est_cost_usd: +(RATE_PER_SEC * duration).toFixed(4),
    rate_per_sec_usd: RATE_PER_SEC,
    input,
    submitted_at: new Date().toISOString(),
  })
  saveManifest({
    purpose:
      'probe-startframe — seedance 2.0 image_urls가 시간 앵커인가 구도 참조 세트인가 (qualitative 암(b) 발산 원인 판별)',
    model: spec.endpoint,
    baseline: 'qualitative/manifest.json#arm=b (입력 전문 회수, 프로브 축만 변이)',
    pricing_source: 'fal.ai/models/bytedance/seedance-2.0/reference-to-video (2026-08-11 실측): 720p $0.3024/s',
    ...manifest,
  })
  console.log(`submitted ${probe} → ${request_id}`)
}

async function collect() {
  const manifest = loadManifest()
  let pending = manifest.jobs.filter((j) => !j.done && !j.failed)
  const deadline = Date.now() + 20 * 60_000
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint as string, {
          requestId: job.request_id as string,
          logs: false,
        })
        if (st.status === 'COMPLETED') {
          let data: unknown
          try {
            ;({ data } = await fal.queue.result(job.endpoint as string, {
              requestId: job.request_id as string,
            }))
          } catch (e) {
            // fal 큐는 처리 중 실패도 COMPLETED로 두고 result 422가 실패 상세를 돌려준다
            if ((e as { status?: number })?.status === 422) {
              job.failed = true
              job.error = String((e as Error).message ?? e)
              console.error(`FAILED ${job.probe}: ${job.error}`)
              continue
            }
            throw e
          }
          const url =
            (data as { video?: { url?: string } })?.video?.url ??
            (data as { video_url?: string })?.video_url
          if (!url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`)
          const dest = join(DIR, `out_${job.probe}.mp4`)
          const res = await fetch(url)
          writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
          job.done = true
          job.video_url = url
          job.local = dest
          console.log(`done ${job.probe} → ${dest}`)
        } else {
          console.log(`... ${job.probe}: ${st.status}`)
        }
      } catch (e) {
        console.error(`poll ${job.probe}: ${(e as Error).message}`)
      }
    }
    saveManifest(manifest)
    pending = manifest.jobs.filter((j) => !j.done && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  const done = manifest.jobs.filter((j) => j.done).length
  console.log(`\ncollected ${done}/${manifest.jobs.length}`)
  if (done < manifest.jobs.length) process.exitCode = 1
}

const mode = process.argv[2]
if (mode === 'submit') {
  const probe = process.argv[3]
  if (probe !== 'p1' && probe !== 'p2') throw new Error('usage: probe-run.mts submit p1|p2')
  await submit(probe)
} else if (mode === 'collect') await collect()
else throw new Error('usage: probe-run.mts submit p1|p2 | collect')
