// 앵커 밀도 실험 — 첫 그림과 끝 그림 사이에 중간 프레임을 몇 장 넣어야 하는가
//
// 오너 가설(2026-08-12): "이미지 생성기가 가진 맥락을 단 한 개의 이미지로만 영상 생성기에게
//   설명하는 게 병목이다." 관찰 근거 — start+end 를 넣었을 때가 start+잡다한 이미지보다
//   그림체 유지가 좋았다(다만 공간적 자연스러움은 덜했다).
// 묻는 것: 어디까지가 유의미한 앵커이고 어디부터가 과잉 맥락인가.
// 추가 축: 모든 조건에 start frame 의 depth map 을 함께 넣는 팔(2배수).
//
// 왜 higgsfield 인가: seedance_2_0 이 start_image / end_image / image_references 로 **분리**돼 있다.
//   fal 스키마는 전부 image_urls 한 덩어리라 "어느 것이 시작이고 끝인지" 말할 자리가 없었다.
//   비용도 크레딧(편당 31.5)이라 fal($2.12/편) 대비 현금 지출이 없다.
// 시간 지정: 스키마에 per-image 타임스탬프가 없다(fal·higgsfield 공통). 프롬프트 문장으로만 가능 —
//   그래서 "시간을 말해주면 지키는가"가 이 실험의 두 번째 층으로 같이 측정된다.
//
// 대전제(rules/experiments.md): 산출 판정은 오너만. 이 스크립트는 무엇을 넣었고 무엇이 나왔는지만 남긴다.
//
// 실행: pnpm dlx tsx research/experiments/anchor-density/run.mts [step]
//   step: depth | frames | videos | all(기본)
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

config({ path: '.env.local' })

const DIR = dirname(fileURLToPath(import.meta.url))
const AB = join(DIR, '..', 'previz-video-reference-ab')
const IN = join(DIR, 'inputs')
const OUT = join(DIR, 'out')
mkdirSync(IN, { recursive: true })
mkdirSync(OUT, { recursive: true })
const MANIFEST = join(DIR, 'manifest.json')

const DURATION = 7
const RESOLUTION = '720p'
// seedance_2_0 은 3:2 를 지원하지 않는다(auto,16:9,9:16,4:3,3:4,1:1,21:9).
//   원본 앵커 비율 379×257 = 1.475 에 가장 가까운 4:3(1.333)으로 12편 전부 고정 — auto 로 두면
//   편마다 참조를 따라가 기하가 갈린다(1차 실험 실측: 같은 발주에 4:3과 16:9가 섞여 나왔다).
const ASPECT = '4:3'
const ANCHOR_W = 379
const ANCHOR_H = 257

// 동결 프롬프트 — 1차 정성평가와 **바이트 동일**. 이전 14편과 대조 가능하게 유지한다.
const BASE_PROMPT = readFileSync(join(AB, 'qualitative/inputs/prompt.txt'), 'utf8').trim()

type Cond = { key: string; label: string; mids: number[]; useEnd: boolean }
// 0~7초에 균등 배치해 1초 격자에서 뽑는다 (round(i*7/(n-1))).
const CONDS: Cond[] = [
  { key: 'a1', label: '시작 1장 (현행)', mids: [], useEnd: false },
  { key: 'b2', label: '시작+끝 2장', mids: [], useEnd: true },
  { key: 'c3', label: '3장 (중간 4초)', mids: [4], useEnd: true },
  { key: 'd4', label: '4장 (중간 2·5초)', mids: [2, 5], useEnd: true },
  { key: 'e5', label: '5장 (중간 2·4·5초)', mids: [2, 4, 5], useEnd: true },
  { key: 'f8', label: '8장 (1초마다 전부)', mids: [1, 2, 3, 4, 5, 6], useEnd: true },
]
const MID_TIMES = [1, 2, 3, 4, 5, 6]

type M = {
  purpose: string
  owner_hypothesis: string
  model: { video: string; image: string; depth: string }
  frozen_prompt: string
  duration: number
  resolution: string
  aspect_ratio: string
  anchor_size: string
  depth?: { url?: string; file?: string; source: string; cost_note: string }
  mid_frames: Array<{ t: number; file?: string; prompt?: string; credits?: number; error?: string }>
  jobs: Array<{
    key: string; label: string; depth: boolean; anchors: string[]; anchor_times: number[]
    prompt?: string; job_id?: string; video_url?: string; file?: string; credits?: number; error?: string
  }>
  credits_spent: number
}

function readM(): M {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  return {
    purpose: '앵커 밀도 — 시작·끝 사이 중간 프레임을 몇 장 주는 것이 유의미한 앵커이고 어디부터 과잉 맥락인가',
    owner_hypothesis:
      '이미지 생성기가 가진 맥락을 단 한 개의 이미지로만 영상 생성기에게 설명하는 게 병목이다 (오너 2026-08-12)',
    model: { video: 'higgsfield seedance_2_0', image: 'higgsfield gpt_image_2', depth: 'fal-ai/imageutils/depth (MiDaS)' },
    frozen_prompt: BASE_PROMPT,
    duration: DURATION,
    resolution: RESOLUTION,
    aspect_ratio: ASPECT,
    anchor_size: `${ANCHOR_W}x${ANCHOR_H} — 모든 앵커를 시작·끝 그림과 같은 크기로 맞춤(크기 교란 제거)`,
    mid_frames: [],
    jobs: [],
    credits_spent: 0,
  }
}
const save = (m: M) => writeFileSync(MANIFEST, JSON.stringify(m, null, 2))

function hf(args: string[]): string {
  return execFileSync('higgsfield', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}
function hfJobId(raw: string): string {
  const j = JSON.parse(raw)
  const id = Array.isArray(j) ? j[0] : Array.isArray(j?.id) ? j.id[0] : (j?.id ?? j?.job_id)
  if (!id) throw new Error(`job id 없음: ${raw.slice(0, 300)}`)
  return String(id)
}
function hfWaitUrl(id: string, ext: 'mp4' | 'png|jpe?g|webp'): string {
  const raw = hf(['generate', 'wait', id, '--timeout', '20m', '--interval', '5s', '--quiet', '--json'])
  const m = JSON.stringify(JSON.parse(raw)).match(new RegExp(`https:[^"]+?\\.(?:${ext})[^"]*`))
  if (!m) throw new Error(`결과 URL 없음: ${raw.slice(0, 300)}`)
  return m[0].replace(/\\u0026/g, '&')
}
function dl(url: string, out: string) {
  execFileSync('curl', ['-sL', url, '-o', out])
}
function resizeAnchor(src: string, dst: string) {
  execFileSync('ffmpeg', ['-y', '-i', src, '-vf', `scale=${ANCHOR_W}:${ANCHOR_H}:flags=lanczos`, dst], { stdio: 'ignore' })
}

// ── 준비: 시작·끝 그림 사본 ────────────────────────────────────────────────
const START = join(IN, 'anchor_0.jpg')
const END = join(IN, 'anchor_7.jpg')
if (!existsSync(START)) copyFileSync(join(AB, 'qualitative/inputs/start.jpg'), START)
if (!existsSync(END)) copyFileSync(join(AB, 'qualitative/inputs/end.jpg'), END)

// ── 1단계: depth map (fal MiDaS — higgsfield 에 깊이 추정기가 없다) ────────
async function stepDepth(m: M) {
  if (m.depth?.file && existsSync(join(DIR, m.depth.file))) { console.log('depth 이미 있음 — skip'); return }
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY ?? '' })
  const upUrl = await fal.storage.upload(new File([readFileSync(START)], 'anchor_0.jpg', { type: 'image/jpeg' }))
  console.log('depth 생성 중 (fal MiDaS)…')
  const r = (await fal.subscribe('fal-ai/imageutils/depth', { input: { image_url: upUrl }, logs: false })) as {
    data?: { image?: { url?: string } }
  }
  const url = r?.data?.image?.url
  if (!url) throw new Error(`depth 응답에 이미지 없음: ${JSON.stringify(r).slice(0, 300)}`)
  const raw = join(IN, '_depth_raw.png')
  dl(url, raw)
  const dst = join(IN, 'depth_start.png')
  resizeAnchor(raw, dst)
  m.depth = {
    url,
    file: 'inputs/depth_start.png',
    source: 'fal-ai/imageutils/depth (MiDaS) — 입력은 시작 그림 anchor_0.jpg',
    cost_note: 'higgsfield 에 깊이 추정기가 없어 이 한 장만 fal. 앵커와 같은 크기로 리사이즈.',
  }
  save(m)
  console.log(`depth 저장 → ${dst}`)
}

// ── 2단계: 중간 프레임 6장 (higgsfield gpt_image_2) ────────────────────────
function midPrompt(t: number): string {
  return [
    `This is frame ${t}.0 seconds into a ${DURATION}-second continuous shot.`,
    '@Image1 is the FIRST frame of that shot (time 0.0s). @Image2 is the LAST frame (time 7.0s).',
    'Draw the single intermediate frame at the stated time, as if pausing the video there.',
    '',
    `What happens across the shot: ${BASE_PROMPT}`,
    '',
    'Keep the SAME character, the SAME clothing, the SAME corridor, the SAME art style, the SAME line quality',
    'and the SAME colour treatment as the two reference frames — this is one continuous shot, not a new drawing.',
    'Only her position, her pose and the camera framing progress toward the last frame by the stated amount.',
    'Do not add text, captions, timestamps, borders or panel dividers.',
  ].join('\n')
}

function stepFrames(m: M) {
  for (const t of MID_TIMES) {
    const rec = m.mid_frames.find((f) => f.t === t)
    const dst = join(IN, `anchor_${t}.jpg`)
    if (rec?.file && existsSync(dst)) { console.log(`중간 프레임 ${t}s 이미 있음 — skip`); continue }
    const p = midPrompt(t)
    try {
      console.log(`중간 프레임 ${t}s 생성…`)
      const raw = hf(['generate', 'create', 'gpt_image_2', '--prompt', p,
        '--image-references', START, '--image-references', END,
        '--aspect_ratio', '3:2', '--resolution', '1k', '--json'])
      const id = hfJobId(raw)
      const url = hfWaitUrl(id, 'png|jpe?g|webp')
      const tmp = join(IN, `_mid_${t}_raw`)
      dl(url, tmp)
      resizeAnchor(tmp, dst)
      m.mid_frames = m.mid_frames.filter((f) => f.t !== t)
      m.mid_frames.push({ t, file: `inputs/anchor_${t}.jpg`, prompt: p, credits: 7 })
      m.credits_spent += 7
      save(m)
      console.log(`  → ${dst}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      m.mid_frames = m.mid_frames.filter((f) => f.t !== t)
      m.mid_frames.push({ t, prompt: p, error: msg })
      save(m)
      console.log(`  ✗ ${t}s 실패: ${msg.slice(0, 200)}`)
    }
  }
  m.mid_frames.sort((a, b) => a.t - b.t)
  save(m)
}

// ── 3단계: 영상 12편 (higgsfield seedance_2_0) ─────────────────────────────
function anchorClause(times: number[], withDepth: boolean): string {
  // 스키마에 per-image 시간 필드가 없다 → 문장으로 지정. 이 문장 자체가 두 번째 측정 층이다.
  const lines: string[] = []
  if (times.length <= 1) {
    lines.push('@Image1 is the first frame of the shot.')
  } else {
    lines.push(`The shot is ${DURATION} seconds long. The reference frames are timed keyframes of THIS SAME shot:`)
    times.forEach((t, i) => {
      const where = t === 0 ? 'the first frame' : t === DURATION ? 'the last frame' : `the frame at ${t}.0 seconds`
      lines.push(`- @Image${i + 1} is ${where} (time ${t}.0s).`)
    })
    lines.push('Move through these frames in that exact order at those exact times. Between them, interpolate smoothly.')
  }
  if (withDepth) {
    lines.push(
      `- @Image${times.length + 1} is a DEPTH MAP of the first frame: bright = near the camera, dark = far away.`,
      'It describes the 3D layout only. Use it to keep the spatial structure and the relative distances consistent.',
      'Never render it, never show grayscale, never copy its colours into the picture.',
    )
  }
  return lines.join('\n')
}

function stepVideos(m: M) {
  const depthFile = m.depth?.file ? join(DIR, m.depth.file) : null
  const pending: Array<{ key: string; id: string }> = []

  for (const c of CONDS) {
    for (const withDepth of [false, true]) {
      if (withDepth && !depthFile) { console.log(`depth 없음 — ${c.key}+depth 건너뜀`); continue }
      const key = `${c.key}${withDepth ? '_d' : ''}`
      const existing = m.jobs.find((j) => j.key === key)
      if (existing?.video_url) { console.log(`${key} 이미 완료 — skip`); continue }

      const times = [0, ...c.mids, ...(c.useEnd ? [DURATION] : [])]
      const files = times.map((t) => join(IN, `anchor_${t}.jpg`))
      const missing = files.filter((f) => !existsSync(f))
      if (missing.length) { console.log(`${key} 앵커 누락 — 건너뜀: ${missing.join(', ')}`); continue }

      const prompt = `${BASE_PROMPT}\n\n${anchorClause(times, withDepth)}`
      const args = ['generate', 'create', 'seedance_2_0', '--prompt', prompt,
        '--start-image', files[0]]
      if (c.useEnd) args.push('--end-image', files[files.length - 1])
      // 중간 앵커는 image_references 로 (start/end 는 전용 파라미터가 이미 담당)
      for (const f of files.slice(1, c.useEnd ? files.length - 1 : files.length)) args.push('--image-references', f)
      if (withDepth) args.push('--image-references', depthFile!)
      args.push('--duration', String(DURATION), '--resolution', RESOLUTION, '--aspect_ratio', ASPECT, '--json')

      try {
        console.log(`발주 ${key} (앵커 ${times.length}장${withDepth ? ' + depth' : ''})…`)
        const id = hfJobId(hf(args))
        m.jobs = m.jobs.filter((j) => j.key !== key)
        m.jobs.push({
          key, label: `${c.label}${withDepth ? ' + depth' : ''}`, depth: withDepth,
          anchors: files.map((f) => f.replace(DIR + '/', '')), anchor_times: times,
          prompt, job_id: id, credits: 31.5,
        })
        m.credits_spent += 31.5
        save(m)
        pending.push({ key, id })
        console.log(`  job ${id}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        m.jobs = m.jobs.filter((j) => j.key !== key)
        m.jobs.push({ key, label: c.label, depth: withDepth, anchors: [], anchor_times: times, prompt, error: msg })
        save(m)
        console.log(`  ✗ 발주 실패: ${msg.slice(0, 200)}`)
      }
    }
  }

  console.log(`\n발주 ${pending.length}건 — 결과 수신 대기`)
  for (const p of pending) {
    try {
      const url = hfWaitUrl(p.id, 'mp4')
      const file = `out/${p.key}.mp4`
      dl(url, join(DIR, file))
      const j = m.jobs.find((x) => x.key === p.key)!
      j.video_url = url
      j.file = file
      save(m)
      console.log(`  ✓ ${p.key} → ${file}`)
    } catch (e) {
      const j = m.jobs.find((x) => x.key === p.key)!
      j.error = e instanceof Error ? e.message : String(e)
      save(m)
      console.log(`  ✗ ${p.key} 수신 실패: ${j.error?.slice(0, 200)}`)
    }
  }
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const step = process.argv[2] ?? 'all'
const m = readM()
if (step === 'depth' || step === 'all') await stepDepth(m)
if (step === 'frames' || step === 'all') stepFrames(m)
if (step === 'videos' || step === 'all') stepVideos(m)
save(m)
const ok = m.jobs.filter((j) => j.video_url).length
console.log(`\n완료 — 영상 ${ok}/${m.jobs.length} · 중간 프레임 ${m.mid_frames.filter((f) => f.file).length}/${MID_TIMES.length} · 크레딧 ${m.credits_spent}`)
