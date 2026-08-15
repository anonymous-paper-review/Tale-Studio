// 정성수집 5차 — 시차(parallax) 2암. 관찰 전용, 판정·점수 없음(티켓 t2-parallax-foreground).
//   선례: ../qual3-timed/qual3-run.mts 구조 그대로(제품 spec import + payload 전문 manifest 기록).
//   입력 고정:
//     프롬프트 = ../qual3-timed/inputs/prompt_timed.txt (3암 동일 — 이번 변인은 참조물뿐)
//     START ref URL = ../qualitative/manifest.json#jobs[arm=a].input.image_urls[0] (재유도 금지)
//     블록아웃 v2 URL = ../qual2-fullmotion/manifest.json#blockout.fal_url (재제작·재업로드 금지)
//     블록아웃 v3 = ./blockout_v3.mp4 (전경 기둥 추가본, 서브에이전트 렌더) → 이 스크립트가 1회 업로드
//   암:
//     ⓐ FG3D  = 전경 포함 블록아웃 v3 + 현행 START (전경 격자 있는 원본)
//     ⓑ NOFG  = 블록아웃 v2 원본 + 전경 격자를 지운 변형 START (이 스크립트가 이미지 편집으로 1장 생성)
//     ⓞ 대조  = ../qual3-timed/out_t3d.mp4 재사용 — 재생성 금지(티켓 명시)
//   예산 하드캡 $6 — submit 전에 (기발주 + 예상)을 검사하고 초과 시 발주 거부. 암당 재시도 1회.
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/qual5-parallax/qual5-run.mts prep|submit|collect|finalize
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS, clampDuration } from '@/lib/video-models'
// 정적 import 는 dotenv config 보다 먼저 평가돼 모듈 최상단 apiKey 가 빈 값으로 굳는다(선례: assets-trace.mts)
//   → fal 이미지 모듈은 **동적 import**로 config 이후에 로드한다.

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const QUAL1 = join(DIR, '..', 'qualitative')
const QUAL2 = join(DIR, '..', 'qual2-fullmotion')
const QUAL3 = join(DIR, '..', 'qual3-timed')
const MANIFEST = join(DIR, 'manifest.json')
const SHOT_ID = 'sh_04_16'

const spec = VIDEO_MODELS.seedance
const RATE_WITH_VIDEO_INPUT = 0.1814   // 720p + video input (fal 모델 페이지 2026-08-11 실측)
const BUDGET_CAP_USD = 6.0
const MAX_RETRY_PER_ARM = 1

type ArmKey = 'FG3D' | 'NOFG'
const ARMS: { arm: ArmKey; label: string }[] = [
  { arm: 'FG3D', label: '전경 기둥 포함 블록아웃 v3 + 현행 START(전경 격자 있음)' },
  { arm: 'NOFG', label: '블록아웃 v2 원본 + 전경 격자 제거 변형 START' },
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

function frozenInputs(): { prompt: string; startUrl: string; blockoutV2Url: string } {
  const prompt = readFileSync(join(QUAL3, 'inputs', 'prompt_timed.txt'), 'utf8').trim()
  const m1 = JSON.parse(readFileSync(join(QUAL1, 'manifest.json'), 'utf8'))
  const startUrl: string | undefined = m1.jobs.find((j: { arm: string }) => j.arm === 'a')?.input?.image_urls?.[0]
  if (!startUrl) throw new Error('1차 manifest에서 START URL 회수 실패')
  const m2 = JSON.parse(readFileSync(join(QUAL2, 'manifest.json'), 'utf8'))
  const blockoutV2Url: string | undefined = m2?.blockout?.fal_url
  if (!blockoutV2Url) throw new Error('2차 manifest에서 블록아웃 v2 fal URL 회수 실패')
  return { prompt, startUrl, blockoutV2Url }
}

function readManifest(): any {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const f = frozenInputs()
  return {
    purpose:
      '시차(전경-중경-배경 상대운동) 2암 정성수집 — ⓐ 전경 포함 3D 블록아웃 ⓑ 전경 없는 시작 그림. 관찰 전용, 판정·점수 없음',
    ticket: 't2-parallax-foreground',
    model: spec.endpoint,
    shot_id: SHOT_ID,
    prompt_source: 'research/experiments/previz-video-reference-ab/qual3-timed/inputs/prompt_timed.txt (양 암 동일 — 변인은 참조물뿐)',
    start_ref_source: 'research/experiments/previz-video-reference-ab/qualitative/manifest.json#jobs[arm=a].input.image_urls[0]',
    control_arm_reused: {
      arm: 'ⓞ',
      source: 'research/experiments/previz-video-reference-ab/qual3-timed/out_t3d.mp4',
      note: '재생성 금지(티켓 명시) — 대조는 기존 산출물을 그대로 본다',
    },
    blockout_v2_reused: { source: 'qual2-fullmotion/manifest.json#blockout.fal_url', fal_url: f.blockoutV2Url },
    blockout_v3: {
      generator: 'research/experiments/previz-video-reference-ab/qual5-parallax/blockout_v3.py (Blender 5.2.0 headless, /opt/homebrew/bin/blender)',
      local: 'blockout_v3.mp4',
      change_from_v2: '전경 기둥 10개(fg_post_0..9) 추가 — x=14+3i, y=-4.00±0.15, 폭 0.45, 높이 0.85/0.72 교대, 색 (0.10,0.10,0.12). 카메라 안무·복도·러너·속도·길이 불변',
      verification: '0~2s 구간 v2와 프레임 diff 0.00%(안무 무손상) · 측면 120프레임 중 82%에서 전경 가시 · 러너 최악 가림 시에도 주황 픽셀 48% 유지 · 카메라-기둥 최소 수평거리 1.705m(관통 없음)',
      fal_url: null,
    },
    variant_start_image: {
      purpose: 'ⓑ암 — 현행 START 에서 전경 격자를 제거한 변형본 1장',
      model: 'openai/gpt-image-2/edit',
      prompt: null,
      url: null,
      cost_usd_est: null,
    },
    pricing_source: 'fal.ai/models/bytedance/seedance-2.0/reference-to-video (2026-08-11 실측): 720p video input 동반 $0.1814/s',
    budget_cap_usd: BUDGET_CAP_USD,
    max_retry_per_arm: MAX_RETRY_PER_ARM,
    jobs: [] as Job[],
  }
}

const spent = (jobs: Job[], extra = 0) => +(jobs.reduce((s, j) => s + (j.est_cost_usd ?? 0), 0) + extra).toFixed(4)

// ── prep: 블록아웃 v3 업로드 + 변형 START 생성 ────────────────────────────
async function prep() {
  const prov = readManifest()
  if (!prov.blockout_v3.fal_url) {
    const path = join(DIR, 'blockout_v3.mp4')
    if (!existsSync(path)) throw new Error(`blockout_v3.mp4 없음: ${path}`)
    const file = new File([readFileSync(path)], 'blockout_v3_sh_04_16_fg.mp4', { type: 'video/mp4' })
    prov.blockout_v3.fal_url = await fal.storage.upload(file)
    prov.blockout_v3.uploaded_at = new Date().toISOString()
    console.log(`blockout v3 uploaded → ${prov.blockout_v3.fal_url}`)
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  } else console.log('blockout v3 이미 업로드됨 — skip')

  if (!prov.variant_start_image.url) {
    const f = frozenInputs()
    // 변형 지시: 전경 격자만 제거. 나머지(인물·배경·구도·화풍)는 손대지 않는다.
    const editPrompt =
      'Remove only the dark foreground lattice/grid bars that overlap the lower left and lower right of the frame. ' +
      'Keep everything else identical: same character, same pose, same corridor background, same camera angle, ' +
      'same lighting, same art style, same framing. Fill the freed area with the corridor floor and walls that ' +
      'would naturally continue behind the removed bars. Do not add any new objects.'
    const { falImageGenerate } = await import('@/lib/writer/llm/fal')
    const res = await falImageGenerate({
      model: 'openai/gpt-image-2/edit',
      prompt: editPrompt,
      reference_image_urls: [f.startUrl],
      aspect_ratio: '16:9',
    })
    prov.variant_start_image.prompt = editPrompt
    prov.variant_start_image.url = res.url
    prov.variant_start_image.width = res.width
    prov.variant_start_image.height = res.height
    prov.variant_start_image.cost_usd_est = 0.19  // gpt-image-2 edit 1장 상한 추정(청구 조회 API 없음)
    prov.variant_start_image.generated_at = new Date().toISOString()
    console.log(`변형 START 생성 → ${res.url} (${res.width}x${res.height})`)
    // 로컬 사본 보존
    const img = await fetch(res.url)
    writeFileSync(join(DIR, 'start_nofg.png'), Buffer.from(await img.arrayBuffer()))
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  } else console.log('변형 START 이미 생성됨 — skip')
  console.log('prep 완료')
}

function buildInput(arm: ArmKey, prov: any, duration: number): Record<string, unknown> {
  const f = frozenInputs()
  const startUrl = arm === 'NOFG' ? prov.variant_start_image.url : f.startUrl
  const videoUrl = arm === 'FG3D' ? prov.blockout_v3.fal_url : f.blockoutV2Url
  if (!startUrl || !videoUrl) throw new Error(`prep 미완료 — start=${startUrl} video=${videoUrl}`)
  return {
    prompt: f.prompt,
    duration,
    ...(spec.resolutions.length > 0 ? { resolution: spec.defaultResolution } : {}),
    ...(spec.audioParam ? { [spec.audioParam]: spec.audioDefault } : {}),
    [spec.refParam]: [startUrl],
    video_urls: [videoUrl],
  }
}

async function submitArm(prov: any, armDef: { arm: ArmKey; label: string }, attempt: number) {
  const duration = clampDuration(spec, 7)
  const est = +(RATE_WITH_VIDEO_INPUT * duration).toFixed(4)
  const already = spent(prov.jobs, prov.variant_start_image.cost_usd_est ?? 0)
  if (already + est > BUDGET_CAP_USD)
    throw new Error(`예산 하드캡 초과(${armDef.arm} attempt ${attempt}): spent $${already} + est $${est} > $${BUDGET_CAP_USD}`)
  const input = buildInput(armDef.arm, prov, duration)
  const { request_id } = await fal.queue.submit(spec.endpoint, { input })
  prov.jobs.push({
    arm: armDef.arm, attempt, label: armDef.label, request_id,
    endpoint: spec.endpoint, model_key: spec.key, resolution: input.resolution,
    duration_seconds: duration, est_cost_usd: est, rate_per_sec_usd: RATE_WITH_VIDEO_INPUT,
    input, submitted_at: new Date().toISOString(),
  })
  console.log(`submitted ${armDef.arm} (attempt ${attempt}) → ${request_id}  [est $${est}]`)
}

async function submit() {
  const prov = readManifest()
  for (const armDef of ARMS) {
    if (prov.jobs.some((j: Job) => j.arm === armDef.arm)) { console.log(`skip ${armDef.arm} — 이미 발주됨`); continue }
    await submitArm(prov, armDef, 1)
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  }
  console.log(`manifest → ${MANIFEST}  (spent est $${spent(prov.jobs, prov.variant_start_image.cost_usd_est ?? 0)})`)
}

async function collect() {
  const prov = readManifest()
  const deadline = Date.now() + 30 * 60_000
  let pending = prov.jobs.filter((j: Job) => !j.done && !j.failed)
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (st.status !== 'COMPLETED') { console.log(`... ${job.arm}#${job.attempt}: ${st.status}`); continue }
        let data: unknown
        try { ({ data } = await fal.queue.result(job.endpoint, { requestId: job.request_id })) }
        catch (e) {
          if ((e as { status?: number })?.status === 422) {
            job.failed = true; job.error = String((e as Error).message ?? e)
            console.error(`FAILED ${job.arm}#${job.attempt}: ${job.error}`); continue
          }
          throw e
        }
        const url = (data as any)?.video?.url ?? (data as any)?.video_url
        if (!url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`)
        const dest = join(DIR, `out_${job.arm.toLowerCase()}.mp4`)
        const res = await fetch(url)
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
        job.done = true; job.video_url = url; job.local = dest
        console.log(`done ${job.arm}#${job.attempt} → ${dest}`)
      } catch (e) { console.error(`poll ${job.arm}#${job.attempt}: ${(e as Error).message}`) }
    }
    for (const armDef of ARMS) {
      const tries = prov.jobs.filter((j: Job) => j.arm === armDef.arm)
      const live = tries.some((j: Job) => j.done || (!j.done && !j.failed))
      if (live || tries.length === 0 || tries.length > MAX_RETRY_PER_ARM) continue
      try { await submitArm(prov, armDef, tries.length + 1) }
      catch (e) { console.error(`retry ${armDef.arm} 거부: ${(e as Error).message}`) }
    }
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j: Job) => !j.done && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  const armsDone = ARMS.filter((a) => prov.jobs.some((j: Job) => j.arm === a.arm && j.done)).length
  console.log(`\ncollected arms ${armsDone}/${ARMS.length}  (spent est $${spent(prov.jobs, prov.variant_start_image.cost_usd_est ?? 0)})`)
  if (armsDone < ARMS.length) process.exitCode = 1
}

// 프리뷰 + 판독 타일(1fps 전체 / 초반 0~3s 4fps 정밀) — 티켓 측정 지시
function finalize() {
  const prov = readManifest()
  mkdirSync(join(DIR, 'frames'), { recursive: true })
  for (const job of prov.jobs as Job[]) {
    if (!job.done || !job.local || !existsSync(job.local)) continue
    const a = job.arm.toLowerCase()
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration', '-of', 'json', job.local]).toString())
    execFileSync('ffmpeg', ['-y', '-i', job.local, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '28', '-an',
      join(DIR, `out_${a}_preview.mp4`)], { stdio: 'ignore' })
    execFileSync('ffmpeg', ['-y', '-i', job.local, '-vf', 'fps=1,scale=320:-2,tile=4x2', '-frames:v', '1',
      join(DIR, 'frames', `${a}_tile.jpg`)], { stdio: 'ignore' })
    execFileSync('ffmpeg', ['-y', '-i', job.local, '-t', '3', '-vf', 'fps=4,scale=320:-2,tile=4x3', '-frames:v', '1',
      join(DIR, 'frames', `${a}_rampup_tile.jpg`)], { stdio: 'ignore' })
    execFileSync('ffmpeg', ['-y', '-i', job.local, '-vf', 'select=eq(n\\,0)', '-frames:v', '1',
      join(DIR, 'frames', `${a}_f0.jpg`)], { stdio: 'ignore' })
    job.observed_output = {
      width: probe.streams?.[0]?.width, height: probe.streams?.[0]?.height,
      duration_s: +Number(probe.format?.duration).toFixed(3), bytes: statSync(job.local).size,
      preview: `out_${a}_preview.mp4`, frames_tile: `frames/${a}_tile.jpg`,
      rampup_tile: `frames/${a}_rampup_tile.jpg`, first_frame: `frames/${a}_f0.jpg`,
    }
    job.confirmed_cost_usd = job.est_cost_usd
  }
  prov.total_cost_usd = spent(prov.jobs, prov.variant_start_image.cost_usd_est ?? 0)
  prov.cost_note = '단가 = fal 모델 페이지 2026-08-11 실측(720p + video input $0.1814/s). 요청별 청구 조회 API가 없어 비용 = 단가 × duration(7s). 변형 START 1장은 상한 추정치.'
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized → ${MANIFEST}  total $${prov.total_cost_usd}`)
}

const mode = process.argv[2]
if (mode === 'prep') await prep()
else if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'finalize') finalize()
else throw new Error('usage: qual5-run.mts prep|submit|collect|finalize')
