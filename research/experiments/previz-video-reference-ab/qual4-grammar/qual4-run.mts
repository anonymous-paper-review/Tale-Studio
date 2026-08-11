// 정성수집 4차 — "샷 문법 재작성" 4암 (A=대조군 재사용 / B / C / D). 관찰 전용, 판정·점수 없음.
//   근거: ../../\_research/short-video-timing-and-rampup.md §우리에게 적용 가능한 것 조치 1·2·4
//         (타임코드 제거 + 샷당 카메라 무빙 1개 / 참조 역할 계약 명시 / 카메라 이동량 절반)
//   선례: ../qual3-timed/qual3-run.mts — 제품 spec(VIDEO_MODELS/clampDuration)을 import해 input을
//         구성하고, 좌표(payload 전문 + request_id)를 manifest.json에 기록.
//   입력 고정 (4암 전부 동일, 변경 축은 prompt 하나뿐):
//     기본 모션 계약문 = ../qual3-timed/inputs/prompt_timed.txt 의 첫 문단 **verbatim** (재작성 금지)
//     START ref URL   = ../qualitative/manifest.json#jobs[arm=a].input.image_urls[0] (재유도 금지)
//     블록아웃 v2 URL = ../qual2-fullmotion/manifest.json#blockout.fal_url (Blender 재실행·재업로드 금지)
//     resolution 720p / duration 7s / generate_audio — 제품 spec 그대로
//   A(대조군)는 **발주하지 않는다** — ../qual3-timed/out_t3d.mp4 재사용. 프레임만 동일 파라미터로 재추출.
// 예산 하드캡 $8 — submit 전에 (기발주 지출 + 예상)을 검사하고 초과 시 발주 거부. 암당 재시도 1회.
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/qual4-grammar/qual4-run.mts prompts
//       … qual4-run.mts submit | collect | finalize | frames
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, statSync, copyFileSync } from 'node:fs'
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
const QUAL3 = join(DIR, '..', 'qual3-timed')
const MANIFEST = join(DIR, 'manifest.json')
const SHOT_ID = 'sh_04_16'

const spec = VIDEO_MODELS.seedance
// 단가 실측(1~3차와 동일 출처, fal 모델 페이지 2026-08-11): 720p $0.3024/s,
// video input 동반 시 $0.1814/s, 오디오 무료. 4암 전부 video input 동반.
const RATE_WITH_VIDEO_INPUT = 0.1814
const BUDGET_CAP_USD = 8.0
const MAX_RETRY_PER_ARM = 1

type ArmKey = 'b' | 'c' | 'd'
const ARMS: { arm: ArmKey; label: string }[] = [
  { arm: 'b', label: '순서형 재작성 — 타임코드 제거 + 카메라 무빙 1개(측면 트래킹 주, 정면은 종속절)' },
  { arm: 'c', label: 'ⓑ + 참조 역할 계약 명시(@Video1=무빙/프레이밍만, @Image1=첫 프레임·인물·세트)' },
  { arm: 'd', label: 'ⓒ + 카메라 이동량 절반(restrained half-amplitude lateral drift)' },
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

/** 대조군 프롬프트에서 기본 모션 계약문(첫 문단)만 verbatim 회수 — 4암 공통 머리 */
function baseContract(): string {
  const control = readFileSync(join(QUAL3, 'inputs', 'prompt_timed.txt'), 'utf8')
  const head = control.split('\n\n')[0].trim()
  if (!head.startsWith('Motion contract:')) throw new Error('대조군 프롬프트 첫 문단 회수 실패')
  return head
}

/** 팔별 프롬프트 전문 조립 후 inputs/prompt_{arm}.txt로 기록 (동결) */
function buildPrompts(): void {
  const head = baseContract()
  for (const { arm } of ARMS) {
    const block = readFileSync(join(DIR, 'inputs', `block_${arm}.txt`), 'utf8').trim()
    writeFileSync(join(DIR, 'inputs', `prompt_${arm}.txt`), `${head}\n\n${block}\n`)
  }
  console.log('prompts → inputs/prompt_{b,c,d}.txt (기본 계약문은 대조군 첫 문단 verbatim)')
}

function loadInputs(arm: ArmKey): { prompt: string; startUrl: string; blockoutUrl: string } {
  const p = join(DIR, 'inputs', `prompt_${arm}.txt`)
  if (!existsSync(p)) throw new Error(`프롬프트 미조립: ${p} — 먼저 prompts 모드 실행`)
  const prompt = readFileSync(p, 'utf8').trim()
  // 기본 계약문 동일성 재확인 (팔 간 통제 조건)
  if (!prompt.startsWith(baseContract())) throw new Error(`${arm}: 기본 계약문 불일치`)
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
  const { blockoutUrl, startUrl } = loadInputs('b')
  return {
    purpose:
      '샷 문법 재작성 4암 정성수집 — ⓐ 타임코드 대조군(재사용) ⓑ 순서형+무빙1개 ⓒ ⓑ+참조 역할 계약 ⓓ ⓒ+이동량 절반. 관찰 전용, 판정 없음',
    hypothesis_source: 'research/backlog/t2-shot-grammar-rewrite.md',
    research_source:
      'research/experiments/_research/short-video-timing-and-rampup.md §우리에게 적용 가능한 것 (조치 1·2·4)',
    model: spec.endpoint,
    shot_id: SHOT_ID,
    control_arm_reused: {
      arm: 'a',
      label: '현행 타임코드 3구간 (qual3-timed T3D) — 재생성하지 않고 클립 재사용, 발주 $0',
      clip: 'research/experiments/previz-video-reference-ab/qual3-timed/out_t3d.mp4',
      prompt: 'research/experiments/previz-video-reference-ab/qual3-timed/inputs/prompt_timed.txt (사본: inputs/prompt_a_control.txt)',
      request_id_source:
        'research/experiments/previz-video-reference-ab/qual3-timed/manifest.json#jobs[arm=T3D]',
      note: '동일 START·동일 블록아웃·동일 모델/해상도/duration으로 이미 발주된 클립. 프레임만 이번 파라미터로 재추출',
    },
    prompt_composition:
      '기본 모션 계약문(대조군 prompt_timed.txt 첫 문단 verbatim) + inputs/block_{arm}.txt. 4암 통제: START·블록아웃·모델·해상도·duration·오디오 동일, 변경 축은 프롬프트뿐',
    start_ref_source:
      'research/experiments/previz-video-reference-ab/qualitative/manifest.json#jobs[arm=a].input.image_urls[0]',
    start_ref_url: startUrl,
    blockout_reused: {
      source:
        'research/experiments/previz-video-reference-ab/qual2-fullmotion/manifest.json#blockout.fal_url',
      fal_url: blockoutUrl,
      note: '재사용 — Blender 실행·재업로드 없음',
    },
    pricing_source:
      'fal.ai/models/bytedance/seedance-2.0/reference-to-video (2026-08-11 실측): 720p $0.3024/s, video input 동반 $0.1814/s, 오디오 무료',
    budget_cap_usd: BUDGET_CAP_USD,
    max_retry_per_arm: MAX_RETRY_PER_ARM,
    jobs: [] as Job[],
  }
}

/** 보수적 지출 — 발주한 모든 시도(실패 포함)를 계상. ⓐ는 재사용이라 0 */
function spent(jobs: Job[]): number {
  return +jobs.reduce((s, j) => s + (j.est_cost_usd ?? 0), 0).toFixed(4)
}

function buildInput(
  frozen: { prompt: string; startUrl: string; blockoutUrl: string },
  duration: number,
): Record<string, unknown> {
  return {
    prompt: frozen.prompt,
    duration,
    ...(spec.resolutions.length > 0 ? { resolution: spec.defaultResolution } : {}),
    ...(spec.audioParam ? { [spec.audioParam]: spec.audioDefault } : {}),
    [spec.refParam]: [frozen.startUrl],
    video_urls: [frozen.blockoutUrl],
  }
}

async function submitArm(
  prov: { jobs: Job[] },
  armDef: { arm: ArmKey; label: string },
  attempt: number,
): Promise<void> {
  const frozen = loadInputs(armDef.arm)
  const duration = clampDuration(spec, 7) // 7 (flexible 4~15)
  const est = +(RATE_WITH_VIDEO_INPUT * duration).toFixed(4)
  const already = spent(prov.jobs)
  if (already + est > BUDGET_CAP_USD)
    throw new Error(
      `예산 하드캡 초과(${armDef.arm} attempt ${attempt}): spent $${already} + est $${est} > $${BUDGET_CAP_USD}`,
    )
  const input = buildInput(frozen, duration)
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
    rate_per_sec_usd: RATE_WITH_VIDEO_INPUT,
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
  const deadline = Date.now() + 40 * 60_000
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
        const dest = join(DIR, `out_${job.arm}.mp4`)
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

/** 480p 프리뷰 + 프레임 타일 — 4암 전부 동일 파라미터 (ⓐ 재사용 클립 포함) */
function frames() {
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args])
  const clips: { arm: string; src: string }[] = [
    { arm: 'a', src: join(QUAL3, 'out_t3d.mp4') },
    ...ARMS.map((a) => ({ arm: a.arm as string, src: join(DIR, `out_${a.arm}.mp4`) })),
  ]
  // ⓐ 대조군 클립을 이 폴더로 복사 (재사용 표기 — 재생성 아님)
  const aCopy = join(DIR, 'out_a_control_reused.mp4')
  if (existsSync(clips[0].src) && !existsSync(aCopy)) copyFileSync(clips[0].src, aCopy)
  for (const { arm, src } of clips) {
    if (!existsSync(src)) {
      console.log(`skip frames ${arm} — 클립 없음`)
      continue
    }
    const f = (n: string) => join(DIR, 'frames', `${arm}_${n}`)
    ff(['-i', src, '-vf', 'fps=1,scale=480:-1,tile=4x2', '-frames:v', '1', '-q:v', '3', f('tile.jpg')])
    ff(['-ss', '0', '-t', '3', '-i', src, '-vf', 'fps=4,scale=360:-1,tile=4x3', '-frames:v', '1', '-q:v', '3', f('tile_0-3s_4fps.jpg')])
    ff(['-ss', '2.75', '-t', '2.5', '-i', src, '-vf', 'fps=4,scale=360:-1,tile=5x2', '-frames:v', '1', '-q:v', '3', f('tile_2.75-5.25s_4fps.jpg')])
    ff(['-ss', '5', '-t', '2', '-i', src, '-vf', 'fps=4,scale=360:-1,tile=4x2', '-frames:v', '1', '-q:v', '3', f('tile_5-7s_4fps.jpg')])
    ff(['-ss', '0', '-i', src, '-frames:v', '1', '-q:v', '2', f('f0.jpg')])
    ff(['-sseof', '-0.1', '-i', src, '-update', '1', '-q:v', '2', f('last.jpg')])
    if (arm !== 'a')
      ff(['-i', src, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', join(DIR, `out_${arm}_preview.mp4`)])
    console.log(`frames ${arm} ✓`)
  }
  console.log('frames/ 파라미터: 1fps 4x2 타일(480px) / 4fps 정밀 타일 3장(0-3s 4x3, 2.75-5.25s 5x2, 5-7s 4x2, 360px) / f0 / last(-0.1s)')
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
      preview: `out_${job.arm}_preview.mp4`,
      frames_tile: `frames/${job.arm}_tile.jpg`,
      first_frame: `frames/${job.arm}_f0.jpg`,
      last_frame: `frames/${job.arm}_last.jpg`,
    }
    job.confirmed_cost_usd = job.est_cost_usd
  }
  prov.total_cost_usd = spent(prov.jobs)
  prov.cost_note =
    'ⓐ는 재사용이라 이번 지출 $0. ⓑⓒⓓ 단가는 fal 모델 페이지 2026-08-11 실측(video input 동반 $0.1814/s). fal에 요청별 청구 조회 API가 없어 비용 = 단가 × 발주 duration(7s)로 확정.'
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized → ${MANIFEST}  total $${prov.total_cost_usd}`)
}

const mode = process.argv[2]
if (mode === 'prompts') buildPrompts()
else if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'finalize') finalize()
else if (mode === 'frames') frames()
else throw new Error('usage: qual4-run.mts prompts|submit|collect|finalize|frames')
