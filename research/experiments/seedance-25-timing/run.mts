// Seedance 2.5 시간 통제력 실측 — 3암 × 1회. 관찰 전용, 판정·점수 없음.
//   선례: ../previz-video-reference-ab/qual3-timed/qual3-run.mts (제품 spec import + manifest 좌표 기록).
//   변경 축은 프롬프트 말미에 붙는 "카메라 안무 블록"의 시간 표기법 하나뿐:
//     TC  = Runware 2.5 문서 표기법 [0-1s]/[1-2s]/[2-7s]  (구간 경계는 2.0 베이스라인과 동일)
//     SEQ = 초 없이 First / Then / Finally 순서 서술만
//     CTL = 안무 블록 없음 (동결 기본 모션 계약문 단독 = ../previz-video-reference-ab/qualitative/inputs/prompt.txt 와 바이트 동일)
//   나머지(기본 계약문·START 그림·블록아웃 영상 참조·해상도·duration·오디오 플래그)는 3암 완전 동일.
//
// 2.5는 제품 레지스트리(src/lib/video-models.ts)에 아직 없다(2.0만 등록). 오너 지시상 src/ 수정 금지라
// 여기서는 제품 spec(VIDEO_MODELS.seedance)에서 공통 축(refParam/audioParam/audioDefault/defaultResolution)을
// 그대로 가져다 쓰고, **2.5에서만 다른 두 가지(endpoint, duration 문자열 enum)**만 로컬 상수로 선언한다.
//   → 제품 코드가 바뀌면 공통 축은 자동 추종. 로컬 상수는 fal OpenAPI 실측(2026-08-11)에서 온 것.
//
// 예산 하드캡 $12 — submit 전에 (기발주 지출 + 예상)을 검사하고 초과 시 발주 거부. 암당 재시도 1회.
// 실행: pnpm dlx tsx research/experiments/seedance-25-timing/run.mts submit|collect|finalize
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
const REF = join(DIR, '..', 'previz-video-reference-ab')
const QUAL1 = join(REF, 'qualitative')
const QUAL2 = join(REF, 'qual2-fullmotion')
const MANIFEST = join(DIR, 'manifest.json')
const SHOT_ID = 'sh_04_16'

/** 제품 spec — 공통 축은 여기서 그대로 가져온다 (2.0 엔트리, 2.5는 미등록) */
const spec = VIDEO_MODELS.seedance

// ── 2.5에서만 다른 것 (fal OpenAPI 실측 2026-08-11) ────────────────────────────
//   GET https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.5/reference-to-video
//   Seedance25ReferenceToVideoInput: prompt(required), image_urls, video_urls, audio_urls,
//     resolution enum[480p,720p] def 720p, duration **string** enum[auto,4..30] def auto,
//     aspect_ratio, generate_audio bool def true, end_user_id.
//   → 2.0과 달리 1080p/4k·bitrate_mode 없음, duration 상한 15→30. 카메라/모션/시간 파라미터는 **양쪽 다 없음**.
const ENDPOINT_25 = 'bytedance/seedance-2.5/reference-to-video'
const DURATION_MAX_25 = 30
// 단가 실측(fal 모델 페이지 2026-08-11): "$0.0214 per 1000 tokens ... If any video references are
// provided, the price is multiplied by 0.6." 720p 환산 ~$0.4730/s (영상참조 없음) / ~$0.2838/s (영상참조 있음).
// 오디오는 무료("The cost of video generation is the same regardless of whether audio is generated or not").
const RATE_WITH_VIDEO_INPUT = 0.2838
const RATE_TEXT_ONLY = 0.473
const BUDGET_CAP_USD = 12.0
const MAX_RETRY_PER_ARM = 1

type ArmKey = 'TC' | 'SEQ' | 'CTL'
const ARMS: { arm: ArmKey; promptFile: string; label: string }[] = [
  { arm: 'TC', promptFile: 'prompt_tc.txt', label: '타임코드 — [0-1s]/[1-2s]/[2-7s] (Runware 2.5 표기법)' },
  { arm: 'SEQ', promptFile: 'prompt_seq.txt', label: '순서형 — 초 없이 First/Then/Finally' },
  { arm: 'CTL', promptFile: 'prompt_ctl.txt', label: '대조 — 안무 블록 없음 (동결 기본 계약문 단독)' },
]

interface Job {
  arm: ArmKey
  attempt: number
  label: string
  request_id: string
  endpoint: string
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

/** 동결 입력 회수 — START URL + 블록아웃 v2 URL은 기록된 좌표에서만 (재유도·재업로드 금지) */
function loadFrozen(): { startUrl: string; blockoutUrl: string } {
  const m1 = JSON.parse(readFileSync(join(QUAL1, 'manifest.json'), 'utf8'))
  const startUrl: string | undefined = m1.jobs.find((j: { arm: string }) => j.arm === 'a')?.input
    ?.image_urls?.[0]
  if (!startUrl) throw new Error('qualitative manifest에서 START URL 회수 실패')
  const m2 = JSON.parse(readFileSync(join(QUAL2, 'manifest.json'), 'utf8'))
  const blockoutUrl: string | undefined = m2?.blockout?.fal_url
  if (!blockoutUrl) throw new Error('qual2 manifest에서 블록아웃 v2 fal URL 회수 실패')
  return { startUrl, blockoutUrl }
}

function loadPrompt(file: string): string {
  return readFileSync(join(DIR, 'inputs', file), 'utf8').trim()
}

function readManifest(): { jobs: Job[]; [k: string]: unknown } {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const { startUrl, blockoutUrl } = loadFrozen()
  return {
    purpose:
      'Seedance 2.5가 프롬프트의 초 단위 시간표를 지키는지 3암 관찰 — TC(타임코드) / SEQ(순서만) / CTL(시간표 없음). 판정·점수 없음',
    model: ENDPOINT_25,
    model_note:
      '2.5는 제품 레지스트리 미등록(src/lib/video-models.ts는 2.0만). endpoint·duration 타입만 로컬 선언, 나머지 축은 제품 spec 추종.',
    shot_id: SHOT_ID,
    baseline_2_0: {
      clip: 'research/experiments/previz-video-reference-ab/qual3-timed/out_t3d.mp4',
      note: '동일 START·동일 블록아웃·동일 기본 계약문 + 초 단위 안무(0.0-1.0/1.0-2.0/2.0-7.0s, 슬래시 표기). 실측 스윙 3.0→4.25~4.5s (지시 1.0~2.0s)',
      notes_file: 'research/experiments/previz-video-reference-ab/qual3-timed/notes.md',
    },
    prompt_sources: ARMS.map((a) => ({
      arm: a.arm,
      file: `research/experiments/seedance-25-timing/inputs/${a.promptFile}`,
      label: a.label,
    })),
    prompt_invariant:
      '3암 모두 1문단(동결 기본 모션 계약문)이 ../previz-video-reference-ab/qualitative/inputs/prompt.txt 와 바이트 동일. 차이는 뒤에 붙는 안무 블록의 시간 표기법뿐.',
    timetable_source:
      'research/experiments/previz-video-reference-ab/qual2-fullmotion/blockout_v2.py — phase A t<1.0 정면(r 6.0→4.8) / phase B 1.0≤t<2.0 스윙(φ 0→-90°, smoothstep, r 4.8→6.0) / phase C t≥2.0 측면 동속 트래킹(φ=-90°, r=6.0)',
    start_ref_source:
      'research/experiments/previz-video-reference-ab/qualitative/manifest.json#jobs[arm=a].input.image_urls[0]',
    start_ref_url: startUrl,
    blockout_reused: {
      source: 'research/experiments/previz-video-reference-ab/qual2-fullmotion/manifest.json#blockout.fal_url',
      fal_url: blockoutUrl,
      note: '재사용 — Blender 실행·재업로드 없음. 2.0 베이스라인(T3D)과 동일 영상 참조라 2.0↔2.5 직접 비교 가능',
    },
    pricing_source:
      'fal.ai/models/bytedance/seedance-2.5/reference-to-video (2026-08-11 실측): "$0.0214 per 1000 tokens", "If any video references are provided, the price is multiplied by 0.6" → 720p ~$0.4730/s(영상참조 없음) / ~$0.2838/s(영상참조 있음), 오디오 무료',
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
  promptFile: string,
  frozen: { startUrl: string; blockoutUrl: string },
  duration: number,
): Record<string, unknown> {
  return {
    prompt: loadPrompt(promptFile),
    duration: String(duration), // 2.5는 duration이 문자열 enum ("4".."30")
    resolution: spec.defaultResolution, // '720p' — 제품 spec 추종
    ...(spec.audioParam ? { [spec.audioParam]: spec.audioDefault } : {}),
    [spec.refParam]: [frozen.startUrl], // image_urls
    video_urls: [frozen.blockoutUrl],
  }
}

async function submitArm(
  prov: { jobs: Job[] },
  armDef: { arm: ArmKey; promptFile: string; label: string },
  attempt: number,
): Promise<void> {
  const frozen = loadFrozen()
  // 제품 clampDuration으로 7초를 가둔 뒤, 2.5 상한(30)까지 다시 한 번 가둔다 (2.0 상한 15 < 30이라 무해)
  const duration = Math.min(DURATION_MAX_25, clampDuration(spec, 7))
  const rate = RATE_WITH_VIDEO_INPUT // 3암 모두 video_urls 있음
  const est = +(rate * duration).toFixed(4)
  const already = spent(prov.jobs)
  if (already + est > BUDGET_CAP_USD)
    throw new Error(
      `예산 하드캡 초과(${armDef.arm} attempt ${attempt}): spent $${already} + est $${est} > $${BUDGET_CAP_USD}`,
    )
  const input = buildInput(armDef.promptFile, frozen, duration)
  const { request_id } = await fal.queue.submit(ENDPOINT_25, { input })
  prov.jobs.push({
    arm: armDef.arm,
    attempt,
    label: armDef.label,
    request_id,
    endpoint: ENDPOINT_25,
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
      '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
      '-of', 'json',
      job.local,
    ]).toString()
    const probe = JSON.parse(out)
    const a = job.arm.toLowerCase()
    job.observed_output = {
      width: probe.streams?.[0]?.width,
      height: probe.streams?.[0]?.height,
      fps: probe.streams?.[0]?.r_frame_rate,
      duration_s: +Number(probe.format?.duration).toFixed(3),
      bytes: statSync(job.local).size,
      preview: `preview/${a}_preview.mp4`,
      tile_1fps: `frames/${a}_1fps.jpg`,
      tiles_4fps: [
        `frames/${a}_0-3s_4fps.jpg`,
        `frames/${a}_2.75-5.25s_4fps.jpg`,
        `frames/${a}_5-7s_4fps.jpg`,
      ],
      first_frame: `frames/${a}_f0.jpg`,
      last_frame: `frames/${a}_last.jpg`,
    }
    job.confirmed_cost_usd = job.est_cost_usd
  }
  prov.total_cost_usd = spent(prov.jobs)
  prov.cost_note =
    '단가는 fal 2.5 모델 페이지 2026-08-11 실측(720p + video 참조 $0.2838/s, 오디오 무료). fal에 요청별 청구 조회 API가 없어 비용 = 단가 × 발주 duration(7s)로 확정.'
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized → ${MANIFEST}  total $${prov.total_cost_usd}`)
}

/** 발주 없이 payload·예산만 검산 ($0) */
function dry() {
  const frozen = loadFrozen()
  const duration = Math.min(DURATION_MAX_25, clampDuration(spec, 7))
  let total = 0
  for (const armDef of ARMS) {
    const input = buildInput(armDef.promptFile, frozen, duration)
    const est = +(RATE_WITH_VIDEO_INPUT * duration).toFixed(4)
    total += est
    console.log(`\n── ${armDef.arm} — ${armDef.label}  [est $${est}]`)
    console.log(
      JSON.stringify(
        { ...input, prompt: `${(input.prompt as string).length} chars` },
        null,
        1,
      ),
    )
    console.log(`prompt tail: …${(input.prompt as string).slice(-160)}`)
  }
  console.log(`\nendpoint=${ENDPOINT_25}  duration="${duration}"  arms=${ARMS.length}`)
  console.log(`총 예상 $${total.toFixed(4)} / 하드캡 $${BUDGET_CAP_USD}  → ${total <= BUDGET_CAP_USD ? 'OK' : 'REFUSE'}`)
}

/** 발주 상태만 조회 ($0) */
async function status() {
  const prov = readManifest()
  for (const j of prov.jobs) {
    const st = await fal.queue.status(j.endpoint, { requestId: j.request_id, logs: false })
    console.log(`${j.arm}#${j.attempt}\t${st.status}\t${j.request_id}\tlocal=${j.local ?? '-'}`)
  }
}

const mode = process.argv[2]
if (mode === 'status') await status()
else if (mode === 'dry') dry()
else if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'finalize') finalize()
else throw new Error('usage: run.mts submit|collect|finalize')
