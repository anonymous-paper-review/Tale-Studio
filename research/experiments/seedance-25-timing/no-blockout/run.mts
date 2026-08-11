// 블록아웃 격리 — Seedance 2.5, **video_urls 없이** 같은 프롬프트로 재발주. 관찰 전용, 판정·점수 없음.
//   티켓: research/backlog/t2-25-blockout-isolation.md
//   선례: ../run.mts (블록아웃 있음 3암). 이 파일은 그 복제본이고 **변경 축은 딱 하나** — video_urls 제거.
//   나머지(프롬프트 바이트·START 그림·모델·해상도·duration·오디오 플래그)는 위 실험과 완전 동일.
//
//   프롬프트는 ../inputs/prompt_{tc,seq,ctl}.txt 를 inputs/ 로 복사한 것이고,
//   submit 전에 **부모 파일과 바이트 동일**한지 SHA-256으로 검사한다(수정 금지 계약의 기계 검사).
//
// ── 예산 (중요) ───────────────────────────────────────────────────────────────
//   fal 단가 규칙: "$0.0214 per 1000 tokens",
//     tokens = output_h * output_w * (input_video_duration + output_duration) * 24 / 1024
//     "If any video references are provided, the price is multiplied by 0.6"
//   → **영상 참조를 빼면 0.6 할인이 사라진다.** 720p·7s 기준 클립당
//       $3.2357 (토큰 공식, 1280x720 x 7s)  /  $3.311 (fal 게시 근사치 $0.4730/s)
//     블록아웃 있던 직전 실험은 클립당 $0.2838/s x 7s = $1.9866으로 기록됐다.
//   → 3암 = $9.71~9.93 으로 **하드캡 $6.5를 50% 초과**한다. 캡 안에 3암은 물리적으로 불가능.
//     축소 규칙: 해상도(720p)는 직전 3암과의 대조가 목적이라 **못 건드린다**(480p로 내리면
//     블록아웃 유무 대신 해상도가 새 교란이 된다). 그래서 **암 수**를 줄인다.
//     남긴 2암 = TC(티켓의 기각 조건이 지목한 암) + CTL(직전 실험을 애매하게 만든 암 —
//     시간 언급 0인데도 주문 시각을 맞췄던 그 암). 뺀 1암 = SEQ(표기법 변종, 2차 질문).
const OMITTED_ARM_NOTE =
  'SEQ 미발주 — 예산 사유. 영상참조 제거로 클립 단가가 $1.9866→$3.2357로 올라 3암($9.71)이 하드캡 $6.5를 초과. ' +
  '해상도를 내리면 교란이 새로 생겨 암 수를 줄였고, 티켓 기각 조건이 지목한 TC와 직전 실험의 애매함을 만든 CTL을 남겼다.'
//
// 실행: pnpm dlx tsx research/experiments/seedance-25-timing/no-blockout/run.mts dry|submit|collect|status|finalize
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS, clampDuration } from '@/lib/video-models'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const PARENT = join(DIR, '..') // 블록아웃 있음 실험 (직전)
const QUAL1 = join(PARENT, '..', 'previz-video-reference-ab', 'qualitative')
const MANIFEST = join(DIR, 'manifest.json')
const SHOT_ID = 'sh_04_16'

/** 제품 spec — 공통 축은 여기서 그대로 (2.0 엔트리, 2.5는 레지스트리 미등록) */
const spec = VIDEO_MODELS.seedance

// ── 2.5에서만 다른 것 (fal OpenAPI 실측 2026-08-11, ../run.mts와 동일) ──────────
const ENDPOINT_25 = 'bytedance/seedance-2.5/reference-to-video'
const DURATION_MAX_25 = 30

// ── 비용 모델 ────────────────────────────────────────────────────────────────
const USD_PER_1K_TOKENS = 0.0214
const OUT_W = 1280 // 720p 16:9 — 직전 실험 3암 모두 실측 1280x720으로 나왔다
const OUT_H = 720
const RATE_TEXT_ONLY_PUBLISHED = 0.473 // fal 게시 근사치 $/s (영상참조 없음, 720p)
/** fal 청구 공식 그대로. 영상 참조가 없으므로 input_video_duration = 0 */
function tokenCost(outSeconds: number, inputVideoSeconds = 0): number {
  const tokens = (OUT_H * OUT_W * (inputVideoSeconds + outSeconds) * 24) / 1024
  return +((tokens / 1000) * USD_PER_1K_TOKENS).toFixed(4)
}
const BUDGET_CAP_USD = 6.5
const MAX_RETRY_PER_ARM = 1

type ArmKey = 'TC' | 'CTL'
const ARMS: { arm: ArmKey; promptFile: string; label: string }[] = [
  { arm: 'TC', promptFile: 'prompt_tc.txt', label: '타임코드 — [0-1s]/[1-2s]/[2-7s], 블록아웃 없음' },
  { arm: 'CTL', promptFile: 'prompt_ctl.txt', label: '대조 — 안무 블록 없음(시간 언급 0), 블록아웃 없음' },
]

interface Job {
  arm: ArmKey
  attempt: number
  label: string
  request_id: string
  endpoint: string
  duration_seconds: number
  est_cost_usd: number
  est_cost_published_usd: number
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

function sha256(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

/** 프롬프트 3개가 부모 실험 파일과 바이트 동일한지 검사 (수정 금지 계약의 기계 검사) */
function assertPromptsFrozen(): Record<string, string> {
  const digests: Record<string, string> = {}
  for (const f of ['prompt_tc.txt', 'prompt_seq.txt', 'prompt_ctl.txt']) {
    const mine = sha256(join(DIR, 'inputs', f))
    const parent = sha256(join(PARENT, 'inputs', f))
    if (mine !== parent) throw new Error(`프롬프트 변조 감지: ${f} (${mine} != ${parent})`)
    digests[f] = mine
  }
  return digests
}

/** START URL 회수 — 기록된 좌표에서만 (재유도·재업로드 금지). 블록아웃은 **일부러 안 읽는다** */
function loadStartUrl(): string {
  const m1 = JSON.parse(readFileSync(join(QUAL1, 'manifest.json'), 'utf8'))
  const url: string | undefined = m1.jobs.find((j: { arm: string }) => j.arm === 'a')?.input
    ?.image_urls?.[0]
  if (!url) throw new Error('qualitative manifest에서 START URL 회수 실패')
  const parent = JSON.parse(readFileSync(join(PARENT, 'manifest.json'), 'utf8'))
  if (parent.start_ref_url !== url)
    throw new Error(`START URL이 직전 실험과 다르다:\n  parent=${parent.start_ref_url}\n  mine  =${url}`)
  return url
}

function loadPrompt(file: string): string {
  return readFileSync(join(DIR, 'inputs', file), 'utf8').trim()
}

function readManifest(): { jobs: Job[]; [k: string]: unknown } {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const startUrl = loadStartUrl()
  return {
    purpose:
      '블록아웃 격리 — 직전 3암은 전부 3D 블록아웃 영상을 함께 받았고 시간 언급 0인 CTL까지 주문 시각을 맞췄다. ' +
      '타이밍을 나른 게 문장인지 3D인지 갈리지 않는다. 이번엔 video_urls만 빼고 같은 조건으로 재발주. 판정·점수 없음',
    ticket: 'research/backlog/t2-25-blockout-isolation.md',
    model: ENDPOINT_25,
    shot_id: SHOT_ID,
    variable_under_test: 'video_urls (3D 블록아웃 영상 참조) 유무 — 그 외 모든 축 동일',
    comparison_baselines: {
      blockout_present_2_5: {
        manifest: 'research/experiments/seedance-25-timing/manifest.json',
        notes: 'research/experiments/seedance-25-timing/notes.md',
        measured: 'TC 1.25→~1.95s / SEQ ~1.75→2.75~3.0s / CTL ~1.25→~1.75s (주문 1.0→2.0s)',
      },
      blockout_present_2_0: {
        clip: 'research/experiments/previz-video-reference-ab/qual3-timed/out_t3d.mp4',
        measured: '스윙 3.0 → 4.25~4.5s (주문 1.0→2.0s)',
      },
    },
    prompt_sources: ARMS.map((a) => ({
      arm: a.arm,
      file: `research/experiments/seedance-25-timing/no-blockout/inputs/${a.promptFile}`,
      label: a.label,
    })),
    prompt_invariant:
      'inputs/prompt_{tc,seq,ctl}.txt 는 ../inputs/ 원본과 SHA-256 동일 (submit마다 기계 검사). 바이트 수정 없음.',
    omitted_arm: { arm: 'SEQ', reason: OMITTED_ARM_NOTE },
    start_ref_url: startUrl,
    start_ref_local: { png: 'inputs/start.png', jpg: 'inputs/start.jpg' },
    blockout: null,
    blockout_note:
      '이번 실험의 변경 축. 직전 실험이 쓴 https://v3b.fal.media/files/b/0aa5dc04/Y3zKvOCZmpQSRU99pxnTn_blockout_v2_sh_04_16.mp4 를 **의도적으로 전달하지 않는다**.',
    pricing_source:
      'fal.ai/models/bytedance/seedance-2.5/reference-to-video (2026-08-11 재확인): "$0.0214 per 1000 tokens", ' +
      'tokens = output_h*output_w*(input_video_duration+output_duration)*24/1024, ' +
      '"If any video references are provided, the price is multiplied by 0.6" → 영상참조를 빼면 0.6 할인 소멸.',
    budget_cap_usd: BUDGET_CAP_USD,
    max_retry_per_arm: MAX_RETRY_PER_ARM,
    jobs: [] as Job[],
  }
}

/** 보수적 지출 — 발주한 모든 시도(실패 포함)를 계상 */
function spent(jobs: Job[]): number {
  return +jobs.reduce((s, j) => s + (j.est_cost_usd ?? 0), 0).toFixed(4)
}

function buildInput(promptFile: string, startUrl: string, duration: number): Record<string, unknown> {
  return {
    prompt: loadPrompt(promptFile),
    duration: String(duration), // 2.5는 duration이 문자열 enum ("4".."30")
    resolution: spec.defaultResolution, // '720p' — 제품 spec 추종
    ...(spec.audioParam ? { [spec.audioParam]: spec.audioDefault } : {}),
    [spec.refParam]: [startUrl], // image_urls
    // video_urls 없음 ← 이번 실험의 변경 축
  }
}

async function submitArm(
  prov: { jobs: Job[] },
  armDef: { arm: ArmKey; promptFile: string; label: string },
  attempt: number,
): Promise<void> {
  assertPromptsFrozen()
  const startUrl = loadStartUrl()
  const duration = Math.min(DURATION_MAX_25, clampDuration(spec, 7))
  const est = tokenCost(duration)
  const already = spent(prov.jobs)
  if (already + est > BUDGET_CAP_USD)
    throw new Error(
      `예산 하드캡 초과(${armDef.arm} attempt ${attempt}): spent $${already} + est $${est} > $${BUDGET_CAP_USD}`,
    )
  const input = buildInput(armDef.promptFile, startUrl, duration)
  if ('video_urls' in input) throw new Error('video_urls가 payload에 있다 — 이 실험의 전제 위반')
  const { request_id } = await fal.queue.submit(ENDPOINT_25, { input })
  prov.jobs.push({
    arm: armDef.arm,
    attempt,
    label: armDef.label,
    request_id,
    endpoint: ENDPOINT_25,
    duration_seconds: duration,
    est_cost_usd: est,
    est_cost_published_usd: +(RATE_TEXT_ONLY_PUBLISHED * duration).toFixed(4),
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
    const w = probe.streams?.[0]?.width
    const h = probe.streams?.[0]?.height
    const durS = +Number(probe.format?.duration).toFixed(3)
    job.observed_output = {
      width: w,
      height: h,
      fps: probe.streams?.[0]?.r_frame_rate,
      duration_s: durS,
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
    // 확정 비용: 실측 geometry가 가정(1280x720)과 같으면 발주 duration 기준 토큰 비용 그대로.
    job.confirmed_cost_usd =
      w === OUT_W && h === OUT_H ? job.est_cost_usd : tokenCost(job.duration_seconds)
  }
  prov.total_cost_usd = spent(prov.jobs)
  prov.total_cost_published_basis_usd = +prov.jobs
    .reduce((s: number, j: Job) => s + (j.est_cost_published_usd ?? 0), 0)
    .toFixed(4)
  prov.cost_note =
    `비용 = fal 토큰 공식(${USD_PER_1K_TOKENS}/1k tok, ${OUT_W}x${OUT_H}x발주 ${7}s x24/1024) 기준 클립당 $${tokenCost(7)}. ` +
    `fal 게시 근사치($${RATE_TEXT_ONLY_PUBLISHED}/s) 기준이면 클립당 $${(RATE_TEXT_ONLY_PUBLISHED * 7).toFixed(4)}. ` +
    `실제 컨테이너 길이가 7.072s라 그 기준이면 클립당 $${tokenCost(7.072)}. fal에 요청별 청구 조회 API가 없어 셋 다 병기한다.`
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized → ${MANIFEST}  total $${prov.total_cost_usd}`)
}

/** 발주 없이 payload·예산만 검산 ($0) */
function dry() {
  const digests = assertPromptsFrozen()
  console.log('프롬프트 SHA-256 (부모와 동일 확인됨):')
  for (const [f, d] of Object.entries(digests)) console.log(`  ${f}  ${d}`)
  const startUrl = loadStartUrl()
  const duration = Math.min(DURATION_MAX_25, clampDuration(spec, 7))
  let total = 0
  for (const armDef of ARMS) {
    const input = buildInput(armDef.promptFile, startUrl, duration)
    const est = tokenCost(duration)
    total += est
    console.log(`\n── ${armDef.arm} — ${armDef.label}  [est $${est}]`)
    console.log(
      JSON.stringify({ ...input, prompt: `${(input.prompt as string).length} chars` }, null, 1),
    )
    console.log(`video_urls in payload? ${'video_urls' in input}`)
  }
  console.log(`\nendpoint=${ENDPOINT_25}  duration="${duration}"  arms=${ARMS.length}`)
  console.log(`총 예상 $${total.toFixed(4)} / 하드캡 $${BUDGET_CAP_USD}  → ${total <= BUDGET_CAP_USD ? 'OK' : 'REFUSE'}`)
  console.log(`(3암이었다면 $${(tokenCost(duration) * 3).toFixed(4)} — 캡 초과. ${OMITTED_ARM_NOTE})`)
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
else throw new Error('usage: run.mts dry|submit|collect|status|finalize')
