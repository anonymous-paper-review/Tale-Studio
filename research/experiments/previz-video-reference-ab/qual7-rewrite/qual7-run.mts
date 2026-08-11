// 프롬프트 전면 재작성 3팔 — sh_04_16. 관찰 전용, 판정·점수 없음.
//   왜: ⓔ(정면 구간 보강)까지 해도 도입 정면이 어색하다는 오너 관찰. 문장을 더 붙이는 대신
//       샷 자체를 다시 쓴다. 재작성의 근거는 이 샷의 **그림 두 장**이다 —
//       storyboard_direction 에 "TRACK BACK FAST", storyboard_end 는 그녀가 복도 저 끝으로
//       작아진 구도. 즉 보드는 처음부터 "정면 유지 + 카메라가 더 빨리 후퇴"를 그렸는데,
//       dynamic_spec 은 tracking/left_to_right(횡이동)로 잡혀 계약문이 측면 트래킹을 주문했다.
//       ⓐ~ⓔ는 전부 그 측면 주문을 다듬은 것이라, 그림과 문장이 어긋난 채로 개선을 시도했다.
//   조작 축: 프롬프트 전문(오프너·안무·제약 전부 새로 씀) + 팔별 참조 세트.
//   에셋 재사용만 — 새 그림·새 3D 렌더 없음(Blender 실행 금지).
// 팔:
//   ⓕ1 재작성 + START 그림만            (블록아웃 제외 — v2 3D는 폐기된 측면 안무를 담고 있다)
//   ⓕ2 재작성 + START + 블록아웃 v2      (기존과 완전히 같은 에셋 + 검증된 참조 역할 계약 verbatim)
//   ⓕ3 재작성 + START + END 그림         (제품 경로의 입력 형태 — buildVideoPrompt 의 START/END 문구 verbatim)
// 예산 하드캡 $6.5 — submit 전 검사. 재시도 없음(팔당 1회).
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/qual7-rewrite/qual7-run.mts \
//         prompts | submit | collect | finalize | frames
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

const { fal } = await import('@fal-ai/client')
const { VIDEO_MODELS } = await import('@/lib/video-models')

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const MANIFEST = join(DIR, 'manifest.json')
const spec = VIDEO_MODELS.seedance

const RATE_WITH_VIDEO = 0.1814 // fal 모델 페이지 2026-08-11 실측 (video input 동반)
const RATE_IMAGE_ONLY = 0.3024 // 같은 출처 (720p, 이미지 참조만)
const BUDGET_CAP_USD = 6.5
const DURATION = 7

// 좌표 — 전부 기존 자산. START/END 는 DB shots.storyboard_image.frames, 블록아웃은 qual2 fal URL 재사용.
const START_URL =
  'https://qnjnrihfpqkdhjuzvepy.supabase.co/storage/v1/object/public/media/ce053575-62d5-4c8d-898f-34a1a5c6b40b/6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a/shots/v1-28e3ec710eae6472856df0f255c89c5da500d5de7bcc2a780596f79df6ba1c2f_storyboard_start.png?v=1786191704774'
const END_URL =
  'https://qnjnrihfpqkdhjuzvepy.supabase.co/storage/v1/object/public/media/ce053575-62d5-4c8d-898f-34a1a5c6b40b/6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a/shots/v1-28e3ec710eae6472856df0f255c89c5da500d5de7bcc2a780596f79df6ba1c2f_storyboard_end.png?v=1786191704348'
const BLOCKOUT_URL =
  'https://v3b.fal.media/files/b/0aa5dc04/Y3zKvOCZmpQSRU99pxnTn_blockout_v2_sh_04_16.mp4'

/** 검증된 참조 역할 계약 (qual4 ⓒ / qual6 3시나리오 재현) — 한 글자도 고치지 않는다 */
const CONTRACT_VIDEO_IMAGE =
  'Reference roles: @Video1 controls only the camera movement and the framing; do not copy its colors, its shapes or its subjects. @Image1 defines the first frame, the character and the set dressing. Do not let the two references do the same job.'
const CONTRACT_IMAGE_ONLY =
  'Reference roles: @Image1 defines the first frame, the character and the set dressing.'
/** 제품 buildVideoPrompt 의 START/END 수렴 문구 verbatim (src/lib/director/video-prompt.ts) */
const PRODUCT_START_END =
  "The first reference image is the shot's START frame and the last reference image is its END frame — begin exactly at the START composition and finish exactly at the END composition, with one continuous camera and subject movement between them."

interface Arm {
  arm: string
  label: string
  tail: string
  images: string[]
  video: string | null
  rate: number
}

const ARMS: Arm[] = [
  {
    arm: 'f1',
    label: '재작성 + START 그림만 (블록아웃 제외 — 폐기된 측면 안무와의 충돌 회피)',
    tail: CONTRACT_IMAGE_ONLY,
    images: [START_URL],
    video: null,
    rate: RATE_IMAGE_ONLY,
  },
  {
    arm: 'f2',
    label: '재작성 + START + 블록아웃 v2 (에셋 완전 동일 + 참조 역할 계약 verbatim)',
    tail: CONTRACT_VIDEO_IMAGE,
    images: [START_URL],
    video: BLOCKOUT_URL,
    rate: RATE_WITH_VIDEO,
  },
  {
    arm: 'f3',
    label: '재작성 + START + END 그림 (제품 경로 입력 형태, START/END 수렴 문구 verbatim)',
    tail: PRODUCT_START_END,
    images: [START_URL, END_URL],
    video: null,
    rate: RATE_IMAGE_ONLY,
  },
]

interface Job {
  arm: string
  label: string
  request_id: string
  endpoint: string
  model_key: string
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
}

interface Manifest {
  jobs: Job[]
  [k: string]: unknown
}

function readManifest(): Manifest {
  if (!existsSync(MANIFEST)) return { jobs: [] }
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

/** 팔별 프롬프트 = 공용 재작성 본문 + 팔의 참조 문단. 본문은 한 파일에서만 읽는다(팔 간 불변 보증) */
function buildPrompts(): void {
  const body = readFileSync(join(DIR, 'inputs', 'body_rewrite.txt'), 'utf8').trim()
  // 사전 등록 검사 — 재작성 원칙 위반이면 여기서 죽는다
  if (/\b\d+(\.\d+)?\s*(s\b|sec|second|m\b|meter|metre)/i.test(body))
    throw new Error('본문에 초·미터 표기가 있다 — 2.0에서 수치는 양으로 이행되지 않는다(재작성 원칙 1 위반)')
  const negations = (body.match(/\bnever\b|\bdo not\b|\bdoes not\b|\bno\s/gi) ?? []).length
  if (negations > 4) throw new Error(`부정문 ${negations}개 — 4개 이하로 유지(재작성 원칙 4 위반)`)
  for (const a of ARMS) {
    const p = `${body}\n\n${a.tail}\n`
    writeFileSync(join(DIR, 'inputs', `prompt_${a.arm}.txt`), p)
    console.log(`prompt_${a.arm}.txt  ${p.length}자`)
  }
}

function billable(jobs: Job[]): number {
  return +jobs.filter((j) => !j.failed).reduce((s, j) => s + (j.est_cost_usd ?? 0), 0).toFixed(4)
}

async function submit() {
  const prov = readManifest()
  for (const a of ARMS) {
    if (prov.jobs.some((j) => j.arm === a.arm)) {
      console.log(`skip ${a.arm} — 이미 발주됨`)
      continue
    }
    const prompt = readFileSync(join(DIR, 'inputs', `prompt_${a.arm}.txt`), 'utf8').trim()
    const input: Record<string, unknown> = {
      prompt,
      duration: DURATION,
      resolution: '720p',
      generate_audio: true,
      image_urls: a.images,
      ...(a.video ? { video_urls: [a.video] } : {}),
    }
    const est = +(a.rate * DURATION).toFixed(4)
    const already = billable(prov.jobs)
    if (already + est > BUDGET_CAP_USD)
      throw new Error(`예산 하드캡 초과(${a.arm}): $${already} + $${est} > $${BUDGET_CAP_USD}`)
    const { request_id } = await fal.queue.submit(spec.endpoint, { input })
    prov.jobs.push({
      arm: a.arm,
      label: a.label,
      request_id,
      endpoint: spec.endpoint,
      model_key: spec.key,
      duration_seconds: DURATION,
      est_cost_usd: est,
      rate_per_sec_usd: a.rate,
      input,
      submitted_at: new Date().toISOString(),
    })
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    console.log(`submitted ${a.arm} → ${request_id}  [est $${est}]`)
  }
}

async function collect() {
  const prov = readManifest()
  const deadline = Date.now() + 45 * 60_000
  let pending = prov.jobs.filter((j) => !j.done && !j.failed)
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (st.status !== 'COMPLETED') {
          console.log(`... ${job.arm}: ${st.status}`)
          continue
        }
        let data: unknown
        try {
          ;({ data } = await fal.queue.result(job.endpoint, { requestId: job.request_id }))
        } catch (e) {
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
      } catch (e) {
        console.error(`poll ${job.arm}: ${(e as Error).message}`)
      }
    }
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j) => !j.done && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  const ok = prov.jobs.filter((j) => j.done).length
  console.log(`\ncollected ${ok}/${prov.jobs.length}  (billable $${billable(prov.jobs)})`)
  if (ok < prov.jobs.length) process.exitCode = 1
}

/** 프레임 판독 — qual4와 동일 파라미터(비교 가능성 유지) */
function frames() {
  mkdirSync(join(DIR, 'frames'), { recursive: true })
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args])
  for (const a of ARMS) {
    const src = join(DIR, `out_${a.arm}.mp4`)
    if (!existsSync(src)) {
      console.log(`skip frames ${a.arm} — 클립 없음`)
      continue
    }
    const f = (n: string) => join(DIR, 'frames', `${a.arm}_${n}`)
    ff(['-i', src, '-vf', 'fps=1,scale=480:-1,tile=4x2', '-frames:v', '1', '-q:v', '3', f('tile.jpg')])
    ff(['-ss', '0', '-t', '3', '-i', src, '-vf', 'fps=4,scale=360:-1,tile=4x3', '-frames:v', '1', '-q:v', '3', f('tile_0-3s_4fps.jpg')])
    ff(['-ss', '2.75', '-t', '2.5', '-i', src, '-vf', 'fps=4,scale=360:-1,tile=5x2', '-frames:v', '1', '-q:v', '3', f('tile_2.75-5.25s_4fps.jpg')])
    ff(['-ss', '5', '-t', '2', '-i', src, '-vf', 'fps=4,scale=360:-1,tile=4x2', '-frames:v', '1', '-q:v', '3', f('tile_5-7s_4fps.jpg')])
    ff(['-ss', '0', '-i', src, '-frames:v', '1', '-q:v', '2', f('f0.jpg')])
    ff(['-sseof', '-0.1', '-i', src, '-update', '1', '-q:v', '2', f('last.jpg')])
    ff(['-i', src, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-an', '-movflags', '+faststart', join(DIR, `out_${a.arm}_preview.mp4`)])
    console.log(`frames ${a.arm} ✓`)
  }
}

function finalize() {
  const prov = readManifest()
  for (const job of prov.jobs) {
    if (!job.done || !job.local || !existsSync(job.local)) continue
    const probe = JSON.parse(
      execFileSync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height:format=duration',
        '-of', 'json', job.local,
      ]).toString(),
    )
    job.observed_output = {
      width: probe.streams?.[0]?.width,
      height: probe.streams?.[0]?.height,
      duration_s: +Number(probe.format?.duration).toFixed(3),
      bytes: statSync(job.local).size,
      preview: `out_${job.arm}_preview.mp4`,
      first_frame: `frames/${job.arm}_f0.jpg`,
      last_frame: `frames/${job.arm}_last.jpg`,
    }
  }
  prov.purpose =
    '프롬프트 전면 재작성 3팔 — 그림(START/END·TRACK BACK FAST)이 그린 샷대로 다시 쓴 문장 vs 기존 측면 트래킹 계열(ⓐ~ⓔ). 관찰 전용'
  prov.model = spec.endpoint
  prov.shot_id = 'sh_04_16'
  prov.project_id = '6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a'
  prov.rewrite_basis = {
    storyboard_direction_label: 'TRACK BACK FAST / SPRINTS (LARGE)',
    storyboard_end: '그녀가 복도 저 끝으로 작아진 구도 — 간격이 벌어진다',
    dynamic_spec_actual: { type: 'tracking', direction: 'left_to_right', speed: 'medium', magnitude: 'moderate' },
    conflict:
      'dynamic_spec 은 횡이동을 말하고 보드 두 장은 축방향 후퇴를 그린다. ⓐ~ⓔ는 전부 횡이동 주문을 다듬은 것.',
  }
  prov.assets_reused = {
    start_image: START_URL,
    end_image: END_URL,
    blockout_v2: BLOCKOUT_URL,
    note: '새 그림·새 3D 렌더 없음. 블록아웃은 qual2-fullmotion 렌더 재사용(Blender 미실행)',
  }
  prov.pricing_source =
    'fal.ai/models/bytedance/seedance-2.0/reference-to-video (2026-08-11 실측): 720p $0.3024/s, video input 동반 $0.1814/s'
  prov.budget_cap_usd = BUDGET_CAP_USD
  prov.total_cost_usd = billable(prov.jobs)
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized → ${MANIFEST}  total $${prov.total_cost_usd}`)
}

const mode = process.argv[2]
if (mode === 'prompts') buildPrompts()
else if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'finalize') finalize()
else if (mode === 'frames') frames()
else throw new Error('usage: qual7-run.mts prompts|submit|collect|finalize|frames')
