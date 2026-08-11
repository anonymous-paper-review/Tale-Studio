// 배경 플레이트 정합 가설 6팔 — sh_04_19 (4초). 관찰 전용, 판정·점수 없음.
//   사전 등록: HYPOTHESIS.md (기각 조건 포함). 결과를 본 뒤 가설·기각 조건을 고치지 않는다.
//   변인: **참조 이미지 구성뿐**. 문장은 제품 산출을 전 팔 고정, 참조가 2장 이상인 팔에는
//         동일한 역할 선언 문단을 붙인다(previz-endframe-ab 와 같은 문구 verbatim).
// 예산 하드캡 $10.
// 실행: pnpm dlx tsx research/experiments/previz-bg-plate-ab/run.mts plan|submit|collect|frames|finalize
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

const { fal } = await import('@fal-ai/client')
const { VIDEO_MODELS } = await import('@/lib/video-models')

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const AB = join(DIR, '..', 'previz-endframe-ab', 'run')
const MANIFEST = join(DIR, 'manifest.json')
const spec = VIDEO_MODELS.seedance
const RATE = 0.3024 // 720p, 이미지 참조만 (fal 모델 페이지 2026-08-11 실측)
const DURATION = 4
const BUDGET_CAP_USD = 10
const SHOT = 'sh_04_19'

const SEL = JSON.parse(readFileSync(join(AB, 'selection.json'), 'utf8')) as {
  picked: Array<Record<string, unknown>>
}
const P = SEL.picked.find((x) => x.shot_id === SHOT) as {
  start: string
  duration_seconds: number
  characterViews: Array<{ views: Record<string, string> }>
  locationViews: Array<{ views: Record<string, string> }>
}
const START = P.start
const LOC_WIDE = P.locationViews.find((l) => l.views.wide_shot__url)!.views.wide_shot__url
const CHAR_SHEET = P.characterViews[0].views.view_main__url

/** 플레이트 URL — plates/jobs.json 에 기록된 fal 결과 URL */
function plate(route: 'i2i' | 'repaint'): string | null {
  const f = join(DIR, 'plates', 'jobs.json')
  if (!existsSync(f)) return null
  const st = JSON.parse(readFileSync(f, 'utf8')) as { jobs: Array<{ route: string; url?: string }> }
  return st.jobs.find((j) => j.route === route)?.url ?? null
}

/** previz-endframe-ab 와 **같은 문구** — 팔 간 비교 가능성을 위해 한 글자도 바꾸지 않는다. */
const ROLE_CLAUSE =
  "Reference roles: @Image1 is this shot's START frame — it defines the first frame, the framing and the set dressing. Every other reference image is an identity reference only: it shows how the character and the location look, not a moment of this shot. Never cut to them and never reproduce their poses or their backgrounds as frames."

const BASE_PROMPT = readFileSync(join(AB, 'inputs', 'writer_test__sh_04_19__A.txt'), 'utf8').trim()

interface Arm {
  arm: string
  label: string
  images: () => (string | null)[]
}
const ARMS: Arm[] = [
  { arm: '1', label: '시작 그림만 (기준)', images: () => [START] },
  { arm: '2', label: '시작 + 장소 전체 그림 (불일치 참조)', images: () => [START, LOC_WIDE] },
  { arm: '3i', label: '시작 + i2i 배경 플레이트', images: () => [START, plate('i2i')] },
  { arm: '3d', label: '시작 + 3D 배경 플레이트', images: () => [START, plate('repaint')] },
  { arm: '4i', label: '시작 + i2i 플레이트 + 캐릭터 시트', images: () => [START, plate('i2i'), CHAR_SHEET] },
  { arm: '4d', label: '시작 + 3D 플레이트 + 캐릭터 시트', images: () => [START, plate('repaint'), CHAR_SHEET] },
]

interface Job {
  arm: string
  label: string
  request_id: string
  endpoint: string
  duration_seconds: number
  est_cost_usd: number
  input: Record<string, unknown>
  submitted_at: string
  done?: boolean
  failed?: boolean
  error?: string
  video_url?: string
  local?: string
  observed_output?: Record<string, unknown>
}
function readManifest(): { jobs: Job[]; [k: string]: unknown } {
  return existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { jobs: [] }
}
function billable(jobs: Job[]): number {
  return +jobs.filter((j) => !j.failed).reduce((s, j) => s + (j.est_cost_usd ?? 0), 0).toFixed(4)
}

function promptFor(refCount: number): string {
  return refCount >= 2 ? `${BASE_PROMPT} ${ROLE_CLAUSE}` : BASE_PROMPT
}

function plan() {
  mkdirSync(join(DIR, 'inputs'), { recursive: true })
  let total = 0
  for (const a of ARMS) {
    const imgs = a.images()
    const missing = imgs.some((u) => !u)
    const cost = +(RATE * DURATION).toFixed(4)
    if (!missing) total += cost
    writeFileSync(join(DIR, 'inputs', `prompt_${a.arm}.txt`), promptFor(imgs.filter(Boolean).length))
    console.log(
      `${a.arm.padEnd(3)} refs=${imgs.filter(Boolean).length}${missing ? ' (플레이트 대기)' : ''}  $${cost}  ${a.label}`,
    )
  }
  console.log(`\n발주 가능분 합계 $${total.toFixed(2)} (캡 $${BUDGET_CAP_USD})`)
}

async function submit() {
  const prov = readManifest()
  for (const a of ARMS) {
    if (prov.jobs.some((j) => j.arm === a.arm)) {
      console.log(`skip ${a.arm}`)
      continue
    }
    const imgs = a.images()
    if (imgs.some((u) => !u)) {
      console.log(`보류 ${a.arm} — 플레이트 아직 없음`)
      continue
    }
    const input: Record<string, unknown> = {
      prompt: promptFor(imgs.length),
      duration: DURATION,
      resolution: '720p',
      generate_audio: true,
      image_urls: imgs as string[],
    }
    const est = +(RATE * DURATION).toFixed(4)
    if (billable(prov.jobs) + est > BUDGET_CAP_USD)
      throw new Error(`예산 하드캡 초과(${a.arm})`)
    const { request_id } = await fal.queue.submit(spec.endpoint, { input })
    prov.jobs.push({
      arm: a.arm,
      label: a.label,
      request_id,
      endpoint: spec.endpoint,
      duration_seconds: DURATION,
      est_cost_usd: est,
      input,
      submitted_at: new Date().toISOString(),
    })
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    console.log(`submitted ${a.arm} → ${request_id} [$${est}]`)
  }
  console.log(`billable $${billable(prov.jobs)}`)
}

async function collect() {
  const prov = readManifest()
  const deadline = Date.now() + 45 * 60_000
  let pending = prov.jobs.filter((j) => !j.done && !j.failed)
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (st.status !== 'COMPLETED') continue
        let data: unknown
        try {
          ;({ data } = await fal.queue.result(job.endpoint, { requestId: job.request_id }))
        } catch (e) {
          if ((e as { status?: number })?.status === 422) {
            job.failed = true
            job.error = String((e as Error).message ?? e)
            console.error(`FAILED ${job.arm}`)
            continue
          }
          throw e
        }
        const url =
          (data as { video?: { url?: string } })?.video?.url ?? (data as { video_url?: string })?.video_url
        if (!url) throw new Error('no video url')
        const dest = join(DIR, `out_${job.arm}.mp4`)
        writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()))
        job.done = true
        job.video_url = url
        job.local = dest
        console.log(`done ${job.arm}`)
      } catch (e) {
        console.error(`poll ${job.arm}: ${(e as Error).message}`)
      }
    }
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j) => !j.done && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`collected ${prov.jobs.filter((j) => j.done).length}/${prov.jobs.length}`)
}

function frames() {
  mkdirSync(join(DIR, 'frames'), { recursive: true })
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args])
  for (const job of readManifest().jobs) {
    if (!job.done || !job.local || !existsSync(job.local)) continue
    const f = (n: string) => join(DIR, 'frames', `${job.arm}_${n}`)
    ff(['-i', job.local, '-vf', 'fps=2,scale=400:-1,tile=4x2', '-frames:v', '1', '-q:v', '3', f('tile.jpg')])
    ff(['-ss', '0', '-i', job.local, '-frames:v', '1', '-q:v', '2', f('f0.jpg')])
    ff(['-sseof', '-0.15', '-i', job.local, '-update', '1', '-q:v', '2', f('last.jpg')])
    ff(['-i', job.local, '-vf', 'scale=-2:432', '-c:v', 'libx264', '-crf', '29', '-preset', 'veryfast', '-an', '-movflags', '+faststart', join(DIR, `prev_${job.arm}.mp4`)])
    console.log(`frames ${job.arm} ✓`)
  }
}

function finalize() {
  const prov = readManifest()
  for (const job of prov.jobs) {
    if (!job.done || !job.local || !existsSync(job.local)) continue
    const probe = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', job.local]).toString(),
    )
    job.observed_output = {
      width: probe.streams?.[0]?.width,
      height: probe.streams?.[0]?.height,
      duration_s: +Number(probe.format?.duration).toFixed(3),
      bytes: statSync(job.local).size,
    }
  }
  prov.purpose = '배경 참조의 유출 원인 가르기 — 불일치인가 장수인가. 사전 등록: HYPOTHESIS.md'
  prov.model = spec.endpoint
  prov.shot = SHOT
  prov.references = { start: START, location_wide: LOC_WIDE, character_sheet: CHAR_SHEET, plate_i2i: plate('i2i'), plate_3d: plate('repaint') }
  prov.pricing_source = 'fal 모델 페이지 2026-08-11 실측: 720p 이미지참조만 $0.3024/s'
  prov.budget_cap_usd = BUDGET_CAP_USD
  prov.total_cost_usd = billable(prov.jobs)
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized total $${prov.total_cost_usd}`)
}

const mode = process.argv[2]
if (mode === 'plan') plan()
else if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'frames') frames()
else if (mode === 'finalize') finalize()
else throw new Error('usage: run.mts plan|submit|collect|frames|finalize')
