// 정성평가 2차 — 블록아웃 v2(전 구간 카메라 안무 + 좁은 복도) 재생성 1클립 (c′).
//   선례: ../qualitative-run.mts — 제품 spec(VIDEO_MODELS/clampDuration)을 import해
//   input을 구성하고, 좌표(payload 전문 + request_id)를 manifest.json에 기록.
//   입력 고정: 동결 프롬프트 = ../qualitative/inputs/prompt.txt (1차와 동일 전문),
//   START ref URL = ../qualitative/manifest.json 의 1차 발주 좌표에서 회수 (재유도 금지).
//   변경 축은 video_urls의 블록아웃뿐 (v1 → v2).
// 예산 하드캡 $4 — submit 전에 (기확정 지출 + 예상)을 검사하고 초과 시 발주 거부.
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/qual2-fullmotion/qual2-run.mts submit
//       pnpm dlx tsx research/experiments/previz-video-reference-ab/qual2-fullmotion/qual2-run.mts collect
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS, clampDuration } from '@/lib/video-models'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const QUAL1 = join(DIR, '..', 'qualitative')
const MANIFEST = join(DIR, 'manifest.json')
const SHOT_ID = 'sh_04_16'

const spec = VIDEO_MODELS.seedance
// 단가 실측(1차와 동일 출처): video input 동반 시 720p $0.1814/s (fal 페이지 2026-08-11)
const RATE_PER_SEC_WITH_VIDEO_INPUT = 0.1814
const BUDGET_CAP_USD = 4.0

/** 1차 동결 입력 회수 — prompt 전문은 inputs/prompt.txt, START URL은 1차 manifest 좌표 */
function loadFrozenInputs(): { prompt: string; startUrl: string } {
  const prompt = readFileSync(join(QUAL1, 'inputs', 'prompt.txt'), 'utf8').trim()
  const m = JSON.parse(readFileSync(join(QUAL1, 'manifest.json'), 'utf8'))
  const armA = m.jobs.find((j: { arm: string }) => j.arm === 'a')
  const startUrl: string | undefined = armA?.input?.image_urls?.[0]
  if (!startUrl) throw new Error('1차 manifest에서 START URL 회수 실패')
  return { prompt, startUrl }
}

async function uploadBlockoutV2(): Promise<string> {
  const path = join(DIR, 'blockout_v2.mp4')
  if (!existsSync(path)) throw new Error(`blockout_v2 missing: ${path}`)
  const file = new File([readFileSync(path)], 'blockout_v2_sh_04_16.mp4', { type: 'video/mp4' })
  return fal.storage.upload(file)
}

function spentSoFar(): number {
  if (!existsSync(MANIFEST)) return 0
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  return (m.jobs ?? []).reduce(
    (s: number, j: { est_cost_usd?: number }) => s + (j.est_cost_usd ?? 0), 0)
}

async function submit() {
  const { prompt, startUrl } = loadFrozenInputs()
  const duration = clampDuration(spec, 7) // 7 (flexible 4~15)
  const est = +(RATE_PER_SEC_WITH_VIDEO_INPUT * duration).toFixed(4)
  const spent = spentSoFar()
  if (spent + est > BUDGET_CAP_USD)
    throw new Error(`예산 하드캡 초과: spent $${spent} + est $${est} > $${BUDGET_CAP_USD}`)

  const blockoutUrl = await uploadBlockoutV2()
  console.log(`blockout v2 uploaded → ${blockoutUrl}`)

  const input: Record<string, unknown> = {
    prompt,
    duration,
    ...(spec.resolutions.length > 0 ? { resolution: spec.defaultResolution } : {}),
    ...(spec.audioParam ? { [spec.audioParam]: spec.audioDefault } : {}),
    [spec.refParam]: [startUrl],
    video_urls: [blockoutUrl],
  }
  const { request_id } = await fal.queue.submit(spec.endpoint, { input })
  console.log(`submitted c2 → ${request_id}`)

  const prev = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
    : {
        purpose: '움직임 전달 정성평가 2차 — 블록아웃 v2(전 구간 안무 + 좁은 복도) 재생성 1클립 (관찰 전용, 판정 없음)',
        model: spec.endpoint,
        shot_id: SHOT_ID,
        frozen_prompt_source: 'research/experiments/previz-video-reference-ab/qualitative/inputs/prompt.txt (1차 동결 전문 그대로)',
        start_ref_source: 'research/experiments/previz-video-reference-ab/qualitative/manifest.json#jobs[arm=a].input.image_urls[0]',
        blockout: {
          generator: 'research/experiments/previz-video-reference-ab/qual2-fullmotion/blockout_v2.py (Blender 5.2.0 headless)',
          choreography: '0~1s 정면 도어웨이(러너 전방 6.0→4.8m 후퇴) → 1~2s 측면 스윙(궤도 φ0→-90°, smoothstep) → 2~7s 측면 동속 트래킹(r=6m, v1 동일 구도)',
          background: '좁은 복도(내벽 간격 4.8m): 양측 회색 박스 벽 + 45° 필라스터 + 천장 슬랩 + 시작 문틀. 측면 카메라 쪽 벽은 진입 구간(x≤9)만 (와일드 월)',
          local: 'blockout_v2.mp4',
        },
        pricing_source: '../qualitative/manifest.json과 동일 (fal 2026-08-11 실측: video input 시 $0.1814/s)',
        budget_cap_usd: BUDGET_CAP_USD,
        jobs: [],
      }
  prev.blockout.fal_url = blockoutUrl
  prev.jobs.push({
    arm: 'c2',
    label: "1차 (c) 구성 + video_urls=[블록아웃 v2] — 변경 축은 블록아웃뿐",
    request_id,
    endpoint: spec.endpoint,
    model_key: spec.key,
    resolution: input.resolution,
    duration_seconds: duration,
    est_cost_usd: est,
    rate_per_sec_usd: RATE_PER_SEC_WITH_VIDEO_INPUT,
    input,
    submitted_at: new Date().toISOString(),
  })
  writeFileSync(MANIFEST, JSON.stringify(prev, null, 2))
  console.log(`manifest → ${MANIFEST}`)
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
            // fal 큐는 처리 중 실패도 COMPLETED로 두고 result 422가 실패 상세를 돌려준다
            if ((e as { status?: number })?.status === 422) {
              job.failed = true
              job.error = String((e as Error).message ?? e)
              console.error(`FAILED ${job.arm}: ${job.error}`)
              continue
            }
            throw e
          }
          const url =
            (data as { video?: { url?: string } })?.video?.url ??
            (data as { video_url?: string })?.video_url
          if (!url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`)
          const dest = join(DIR, `out_${job.arm}.mp4`)
          const res = await fetch(url)
          writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
          job.done = true
          job.video_url = url
          job.local = dest
          console.log(`done ${job.arm} → ${dest}`)
        } else {
          console.log(`... ${job.arm}: ${st.status}`)
        }
      } catch (e) {
        console.error(`poll ${job.arm}: ${(e as Error).message}`)
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
else throw new Error('usage: qual2-run.mts submit|collect')
