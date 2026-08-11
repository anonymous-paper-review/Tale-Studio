// 정성수집 3차 — "시간표가 박힌 프롬프트" 2암 (T3D / TXT). 관찰 전용, 판정·점수 없음.
//   선례: ../qual2-fullmotion/qual2-run.mts — 제품 spec(VIDEO_MODELS/clampDuration)을 import해
//   input을 구성하고, 좌표(payload 전문 + request_id)를 manifest.json에 기록.
//   입력 고정:
//     프롬프트 = ./inputs/prompt_timed.txt (동결 기본 프롬프트 전문 + 초 단위 안무 블록, 양 암 동일)
//     START ref URL = ../qualitative/manifest.json#jobs[arm=a].input.image_urls[0] (재유도 금지)
//     블록아웃 v2 URL = ../qual2-fullmotion/manifest.json#blockout.fal_url (재업로드·재제작 금지)
//   변경 축은 video_urls 유무뿐 (T3D=있음 / TXT=없음).
// 예산 하드캡 $6 — submit 전에 (기발주 지출 + 예상)을 검사하고 초과 시 발주 거부. 암당 재시도 1회.
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/qual3-timed/qual3-run.mts submit
//       pnpm dlx tsx research/experiments/previz-video-reference-ab/qual3-timed/qual3-run.mts collect
//       pnpm dlx tsx research/experiments/previz-video-reference-ab/qual3-timed/qual3-run.mts finalize
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS, clampDuration } from '@/lib/video-models'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const QUAL1 = join(DIR, '..', 'qualitative')
const QUAL2 = join(DIR, '..', 'qual2-fullmotion')
const MANIFEST = join(DIR, 'manifest.json')
const SHOT_ID = 'sh_04_16'

const spec = VIDEO_MODELS.seedance
// 단가 실측(1·2차와 동일 출처, fal 모델 페이지 2026-08-11): 720p $0.3024/s,
// video input 동반 시 $0.1814/s, 오디오 무료.
const RATE_TEXT_ONLY = 0.3024
const RATE_WITH_VIDEO_INPUT = 0.1814
const BUDGET_CAP_USD = 6.0
const MAX_RETRY_PER_ARM = 1

type ArmKey = 'T3D' | 'TXT'
const ARMS: { arm: ArmKey; withVideo: boolean; label: string }[] = [
  { arm: 'T3D', withVideo: true, label: '시간표 프롬프트 + [START] + video_urls=[블록아웃 v2] (재사용)' },
  { arm: 'TXT', withVideo: false, label: '시간표 프롬프트 + [START] — 3D 없음' },
]

interface Job {
  arm: ArmKey
  attempt: number
  label: string
  request_id: string
  endpoint: string
  model_key: string
  resolution?: unknown
  duration_seconds: number
  est_cost_usd: number
  rate_per_sec_usd: number
  input: Record<string, unknown>
  submitted_at: string
  done?: boolean
  failed?: boolean
  error?: string
  video_url?: string
  local?: string
  observed_output?: Record<string, unknown>
  confirmed_cost_usd?: number
}

/** 동결 입력 회수 — 프롬프트 전문 + START URL + 블록아웃 v2 URL (전부 기록된 좌표에서) */
function loadInputs(): { prompt: string; startUrl: string; blockoutUrl: string } {
  const prompt = readFileSync(join(DIR, 'inputs', 'prompt_timed.txt'), 'utf8').trim()
  const m1 = JSON.parse(readFileSync(join(QUAL1, 'manifest.json'), 'utf8'))
  const startUrl: string | undefined = m1.jobs.find((j: { arm: string }) => j.arm === 'a')?.input
    ?.image_urls?.[0]
  if (!startUrl) throw new Error('1차 manifest에서 START URL 회수 실패')
  const m2 = JSON.parse(readFileSync(join(QUAL2, 'manifest.json'), 'utf8'))
  const blockoutUrl: string | undefined = m2?.blockout?.fal_url
  if (!blockoutUrl) throw new Error('2차 manifest에서 블록아웃 v2 fal URL 회수 실패')
  return { prompt, startUrl, blockoutUrl }
}

function readManifest(): { jobs: Job[]; [k: string]: unknown } {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const { blockoutUrl } = loadInputs()
  return {
    purpose:
      '시간표가 박힌 프롬프트 2암 정성수집 — ① 3D 블록아웃 동반(T3D) ② 3D 없이 시작 그림만(TXT). 관찰 전용, 판정 없음',
    model: spec.endpoint,
    shot_id: SHOT_ID,
    prompt_source:
      'research/experiments/previz-video-reference-ab/qual3-timed/inputs/prompt_timed.txt (동결 기본 프롬프트 전문 + blockout_v2.py 실측 타이밍 안무 블록, 양 암 동일)',
    timetable_source:
      'research/experiments/previz-video-reference-ab/qual2-fullmotion/blockout_v2.py — phase A t<1.0 정면(r 6.0→4.8) / phase B 1.0≤t<2.0 스윙(φ 0→-90°, smoothstep, r 4.8→6.0) / phase C t≥2.0 측면 동속 트래킹(φ=-90°, r=6.0)',
    start_ref_source:
      'research/experiments/previz-video-reference-ab/qualitative/manifest.json#jobs[arm=a].input.image_urls[0]',
    blockout_reused: {
      source: 'research/experiments/previz-video-reference-ab/qual2-fullmotion/manifest.json#blockout.fal_url',
      fal_url: blockoutUrl,
      note: '재사용 — Blender 재실행·재업로드 없음',
    },
    pricing_source:
      'fal.ai/models/bytedance/seedance-2.0/reference-to-video (2026-08-11 실측): 720p $0.3024/s, video input 시 $0.1814/s, 오디오 무료',
    budget_cap_usd: BUDGET_CAP_USD,
    max_retry_per_arm: MAX_RETRY_PER_ARM,
    jobs: [] as Job[],
  }
}

/** 보수적 지출 — 발주한 모든 시도(실패 포함)를 계상 */
function spent(jobs: Job[]): number {
  return +jobs.reduce((s, j) => s + (j.est_cost_usd ?? 0), 0).toFixed(4)
}

function buildInput(
  armDef: { withVideo: boolean },
  frozen: { prompt: string; startUrl: string; blockoutUrl: string },
  duration: number,
): Record<string, unknown> {
  return {
    prompt: frozen.prompt,
    duration,
    ...(spec.resolutions.length > 0 ? { resolution: spec.defaultResolution } : {}),
    ...(spec.audioParam ? { [spec.audioParam]: spec.audioDefault } : {}),
    [spec.refParam]: [frozen.startUrl],
    ...(armDef.withVideo ? { video_urls: [frozen.blockoutUrl] } : {}),
  }
}

async function submitArm(
  prov: { jobs: Job[] },
  armDef: { arm: ArmKey; withVideo: boolean; label: string },
  attempt: number,
): Promise<void> {
  const frozen = loadInputs()
  const duration = clampDuration(spec, 7) // 7 (flexible 4~15)
  const rate = armDef.withVideo ? RATE_WITH_VIDEO_INPUT : RATE_TEXT_ONLY
  const est = +(rate * duration).toFixed(4)
  const already = spent(prov.jobs)
  if (already + est > BUDGET_CAP_USD)
    throw new Error(
      `예산 하드캡 초과(${armDef.arm} attempt ${attempt}): spent $${already} + est $${est} > $${BUDGET_CAP_USD}`,
    )
  const input = buildInput(armDef, frozen, duration)
  const { request_id } = await fal.queue.submit(spec.endpoint, { input })
  prov.jobs.push({
    arm: armDef.arm,
    attempt,
    label: armDef.label,
    request_id,
    endpoint: spec.endpoint,
    model_key: spec.key,
    resolution: input.resolution,
    duration_seconds: duration,
    est_cost_usd: est,
    rate_per_sec_usd: rate,
    input,
    submitted_at: new Date().toISOString(),
  })
  console.log(`submitted ${armDef.arm} (attempt ${attempt}) → ${request_id}  [est $${est}]`)
}

async function submit() {
  const prov = readManifest()
  for (const armDef of ARMS) {
    if (prov.jobs.some((j) => j.arm === armDef.arm)) {
      console.log(`skip ${armDef.arm} — 이미 발주됨`)
      continue
    }
    await submitArm(prov, armDef, 1)
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  }
  console.log(`manifest → ${MANIFEST}  (spent est $${spent(prov.jobs)})`)
}

async function collect() {
  const prov = readManifest()
  const deadline = Date.now() + 30 * 60_000
  let pending = prov.jobs.filter((j) => !j.done && !j.failed)
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (st.status !== 'COMPLETED') {
          console.log(`... ${job.arm}#${job.attempt}: ${st.status}`)
          continue
        }
        let data: unknown
        try {
          ;({ data } = await fal.queue.result(job.endpoint, { requestId: job.request_id }))
        } catch (e) {
          // fal 큐는 처리 중 실패도 COMPLETED로 두고 result 422가 실패 상세를 돌려준다
          if ((e as { status?: number })?.status === 422) {
            job.failed = true
            job.error = String((e as Error).message ?? e)
            console.error(`FAILED ${job.arm}#${job.attempt}: ${job.error}`)
            continue
          }
          throw e
        }
        const url =
          (data as { video?: { url?: string } })?.video?.url ??
          (data as { video_url?: string })?.video_url
        if (!url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`)
        const dest = join(DIR, `out_${job.arm.toLowerCase()}.mp4`)
        const res = await fetch(url)
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
        job.done = true
        job.video_url = url
        job.local = dest
        console.log(`done ${job.arm}#${job.attempt} → ${dest}`)
      } catch (e) {
        console.error(`poll ${job.arm}#${job.attempt}: ${(e as Error).message}`)
      }
    }
    // 실패 암 자동 재시도 (암당 최대 MAX_RETRY_PER_ARM회, 예산 캡 재검사)
    for (const armDef of ARMS) {
      const tries = prov.jobs.filter((j) => j.arm === armDef.arm)
      const live = tries.some((j) => j.done || (!j.done && !j.failed))
      if (live || tries.length === 0 || tries.length > MAX_RETRY_PER_ARM) continue
      try {
        await submitArm(prov, armDef, tries.length + 1)
      } catch (e) {
        console.error(`retry ${armDef.arm} 거부: ${(e as Error).message}`)
      }
    }
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j) => !j.done && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  const armsDone = ARMS.filter((a) => prov.jobs.some((j) => j.arm === a.arm && j.done)).length
  console.log(`\ncollected arms ${armsDone}/${ARMS.length}  (spent est $${spent(prov.jobs)})`)
  if (armsDone < ARMS.length) process.exitCode = 1
}

/** 산출물 실측(해상도·길이·바이트) + 확정 비용 기록 */
function finalize() {
  const prov = readManifest()
  for (const job of prov.jobs) {
    if (!job.done || !job.local || !existsSync(job.local)) continue
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json',
      job.local,
    ]).toString()
    const probe = JSON.parse(out)
    job.observed_output = {
      width: probe.streams?.[0]?.width,
      height: probe.streams?.[0]?.height,
      duration_s: +Number(probe.format?.duration).toFixed(3),
      bytes: statSync(job.local).size,
      preview: `out_${job.arm.toLowerCase()}_preview.mp4`,
      frames_tile: `frames/${job.arm.toLowerCase()}_tile.jpg`,
      first_frame: `frames/${job.arm.toLowerCase()}_f0.jpg`,
    }
    job.confirmed_cost_usd = job.est_cost_usd
  }
  prov.total_cost_usd = spent(prov.jobs)
  prov.cost_note =
    '단가는 fal 모델 페이지 2026-08-11 실측(720p $0.3024/s, video input 동반 $0.1814/s, 오디오 무료). fal에 요청별 청구 조회 API가 없어 비용 = 단가 × 발주 duration(7s)로 확정.'
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized → ${MANIFEST}  total $${prov.total_cost_usd}`)
}

const mode = process.argv[2]
if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'finalize') finalize()
else throw new Error('usage: qual3-run.mts submit|collect|finalize')
