// 앵커 밀도 실험 — 2판: 다른 그림체(us_cartoon)에서 재현되는가
//
// 1판(anchor-density, 소녀 스토리 / 일본 애니 계열)과 **같은 포맷**으로 그림체만 바꾼다.
//   오너 지시 2026-08-12: "이쪽 그림체로 똑같은 실험 돌려서 아티팩트 새로 만들어줘.
//   previz랑 다 이쪽거 쓰고 실험 포맷만 아티팩트 그대로."
//
// 픽스처 (대전제상 명시 — rules/experiments.md "픽스처는 최신 작업으로"):
//   프로젝트 writer_test_260805_5 (011fd4bd…) 는 **2026-08-05 작업**으로 현행보다 한 세대 앞이다.
//   그림체 비교가 목적이라 오너가 지목했다. 이 세대의 알려진 상태: shots.dynamic_spec 전건 null
//   (예비 경로로 복구됨) · shots.prompt 전건 빈 문자열 (제품과 같은 폴백으로 action_description 사용) ·
//   previz_video 0건. 따라서 결론의 유효 범위는 이 세대로 한정한다.
//
// 샷 선택 근거: start/end 그림 보유 30샷 중 카메라 움직임 8샷. 그중 sh_03_23 —
//   tracking/forward/moderate/moderate + 인물 crawls(moderate), 5초, 공간을 실제로 이동한다.
//   1판의 질주 샷(tracking + large 이동)과 가장 동형이라 앵커 밀도가 의미를 갖는다.
//
// 대전제: 산출 판정은 오너만. 이 스크립트는 무엇을 넣었고 무엇이 나왔는지만 남긴다.
// 실행: pnpm dlx tsx research/experiments/anchor-density-b/run.mts [depth|frames|videos|all]
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

config({ path: '.env.local' })
const { supabaseAdmin } = await import('@/lib/supabase/admin')
const { loadShotDesignByMainId, resolveShotDesign } = await import('@/lib/writer/shot-design-state')
const { buildVideoPrompt } = await import('@/lib/director/video-prompt')

const DIR = dirname(fileURLToPath(import.meta.url))
const IN = join(DIR, 'inputs')
const OUT = join(DIR, 'out')
mkdirSync(IN, { recursive: true })
mkdirSync(OUT, { recursive: true })
const MANIFEST = join(DIR, 'manifest.json')

const PID = '011fd4bd-9b0a-46fe-b978-35677a4f6ee6'
const SHOT_ID = 'sh_03_23'
const DURATION = 5
const RESOLUTION = '720p'
const ASPECT = '4:3'
const CONCURRENT_CAP = 8 // higgsfield creator 플랜 실측(1판에서 9번째부터 rate_limit_reached)

// 5초에 맞춘 앵커 배치 — round(i*DURATION/(n-1))
const CONDS = [
  { key: 'a1', label: '시작 1장 (현행)', mids: [] as number[], useEnd: false },
  { key: 'b2', label: '시작+끝 2장', mids: [], useEnd: true },
  { key: 'c3', label: '3장 (중간 3초)', mids: [3], useEnd: true },
  { key: 'd4', label: '4장 (중간 2·3초)', mids: [2, 3], useEnd: true },
  { key: 'e5', label: '5장 (중간 1·3·4초)', mids: [1, 3, 4], useEnd: true },
  { key: 'f6', label: '6장 (1초마다 전부)', mids: [1, 2, 3, 4], useEnd: true },
]
const MID_TIMES = [1, 2, 3, 4]

let ANCHOR_W = 0
let ANCHOR_H = 0

function hf(args: string[]): string {
  return execFileSync('higgsfield', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}
const hfJobId = (raw: string) => {
  const j = JSON.parse(raw)
  const id = Array.isArray(j) ? j[0] : Array.isArray(j?.id) ? j.id[0] : (j?.id ?? j?.job_id)
  if (!id) throw new Error(`job id 없음: ${raw.slice(0, 300)}`)
  return String(id)
}
function hfWaitUrl(id: string, ext: string): string {
  const raw = hf(['generate', 'wait', id, '--timeout', '20m', '--interval', '5s', '--quiet', '--json'])
  const m = JSON.stringify(JSON.parse(raw)).match(new RegExp(`https:[^"]+?\\.(?:${ext})[^"]*`))
  if (!m) throw new Error(`결과 URL 없음: ${raw.slice(0, 300)}`)
  return m[0].replace(/\\u0026/g, '&')
}
const dl = (url: string, out: string) => execFileSync('curl', ['-sL', url, '-o', out])
const resize = (src: string, dst: string) =>
  execFileSync('ffmpeg', ['-y', '-i', src, '-vf', `scale=${ANCHOR_W}:${ANCHOR_H}:flags=lanczos`, dst], { stdio: 'ignore' })
function dimOf(p: string): [number, number] {
  const o = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p]).toString().trim()
  const [w, h] = o.split(',').map(Number)
  return [w, h]
}

// ── 픽스처 회수 (제품 함수로 계약 복구 — 복붙 금지 규칙) ────────────────────
const { data: shot } = await supabaseAdmin
  .from('shots').select('shot_id, design_ref, duration_seconds, action_description, storyboard_image, dynamic_spec, camera_config, prompt')
  .eq('project_id', PID).eq('shot_id', SHOT_ID).maybeSingle()
if (!shot) throw new Error(`샷 없음: ${SHOT_ID}`)
const byId = await loadShotDesignByMainId(PID)
const dynamicSpec = (shot.dynamic_spec as any) ??
  ((resolveShotDesign(byId, { shotId: SHOT_ID, designRef: (shot.design_ref as string | null) ?? null }, true) as any)?.dynamicSpec ?? null)

// shots.prompt 가 빈 문자열이라 제품과 **같은 폴백**을 쓴다(use-writer-director-sync.ts: prompt || actionDescription)
const sceneText = String(shot.prompt ?? '').trim() || String(shot.action_description ?? '')
// 매니페스트 기록용으로 미리 꺼내 둔다 — readM 은 function 선언이라 위 null 가드의 narrowing 이 안 따라간다.
const shotAction = shot.action_description
const specVia = shot.dynamic_spec ? '샷 기록' : '예비 경로 복구'
// ⚠️ camera_config 를 일부러 넘기지 않는다. 넘기면 제품이 구세대 숫자 축(pan/tilt)을 문장으로 바꿔
//   프롬프트 꼬리에 붙이는데, 이 샷에서는 그것이 계약문과 **정반대**였다:
//     계약문 "tracks ... deeper into the scene" vs 꼬리 "Camera tracks steadily to the right. Camera pitches steadily up"
//   1판(소녀 샷)에는 이 꼬리가 없었으므로, 두 판을 그림체만 다르게 비교하려면 조건을 맞춰야 한다.
//   (이 모순 자체는 부수 발견으로 리포트 정직 보고에 남긴다 — 실험 변인이 아니라 제품 결함 후보다.)
const built = buildVideoPrompt({
  prompt: sceneText,
  camera: null,
  movementPreset: null, cameraPreset: null,
  generationMethod: 'I2V', modelKey: 'seedance' as any,
  durationSeconds: DURATION,
  startEndReference: false, // 앵커 안내는 조건별로 아래에서 붙인다(조건 간 본문 동일 유지)
  dynamicSpec,
})
const BASE_PROMPT = built.fullPrompt

const frames = (shot.storyboard_image as any)?.frames ?? {}
if (!frames.start || !frames.end) throw new Error('start/end 그림 없음')

type M = any
function readM(): M {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  return {
    purpose: '앵커 밀도 2판 — 다른 그림체(us_cartoon)에서 1판과 같은 포맷으로 재현',
    owner_hypothesis: '이미지 생성기가 가진 맥락을 단 한 개의 이미지로만 영상 생성기에게 설명하는 게 병목이다',
    fixture_note:
      '프로젝트 writer_test_260805_5 (2026-08-05 작업) — 현행보다 한 세대 앞. dynamic_spec 전건 null(예비 경로 복구) · prompt 전건 빈 문자열(제품과 같은 폴백) · previz_video 0건. 결론 유효 범위는 이 세대로 한정.',
    project: { id: PID, title: 'writer_test_260805_5', style_anchor: 'us_cartoon' },
    shot: { id: SHOT_ID, duration: DURATION, action: shotAction, camera_motion: dynamicSpec?.camera_motion ?? null, spec_via: specVia },
    model: { video: 'higgsfield seedance_2_0', image: 'higgsfield gpt_image_2', depth: 'fal-ai/imageutils/depth (MiDaS)' },
    frozen_prompt: BASE_PROMPT,
    prompt_source: '제품 buildVideoPrompt(dynamic_spec 복구본 + action_description) — 실험이 프롬프트를 손으로 쓰지 않는다',
    duration: DURATION, resolution: RESOLUTION, aspect_ratio: ASPECT,
    anchor_size: '', mid_frames: [], jobs: [], credits_spent: 0,
  }
}
const save = (m: M) => writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
const m = readM()

// 시작·끝 앵커 확보 + 기준 크기 결정
const START = join(IN, 'anchor_0.png')
const END = join(IN, `anchor_${DURATION}.png`)
if (!existsSync(START)) dl(frames.start, START)
if (!existsSync(END)) dl(frames.end, END)
;[ANCHOR_W, ANCHOR_H] = dimOf(START)
m.anchor_size = `${ANCHOR_W}x${ANCHOR_H} — 시작 그림 원본 크기로 모든 앵커 통일(크기 교란 제거)`
m.inputs = { start_url: frames.start, end_url: frames.end }
save(m)
console.log(`샷 ${SHOT_ID} ${DURATION}s · 앵커 기준 ${ANCHOR_W}x${ANCHOR_H} · 계약 ${m.shot.spec_via}`)

// ── depth ──────────────────────────────────────────────────────────────────
async function stepDepth() {
  if (m.depth?.file && existsSync(join(DIR, m.depth.file))) return console.log('depth 이미 있음 — skip')
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY ?? '' })
  const up = await fal.storage.upload(new File([readFileSync(START)], 'anchor_0.png', { type: 'image/png' }))
  console.log('depth 생성 중 (fal MiDaS)…')
  const r = (await fal.subscribe('fal-ai/imageutils/depth', { input: { image_url: up }, logs: false })) as any
  const url = r?.data?.image?.url
  if (!url) throw new Error('depth 응답 없음')
  const raw = join(IN, '_depth_raw.png')
  dl(url, raw)
  resize(raw, join(IN, 'depth_start.png'))
  m.depth = { url, file: 'inputs/depth_start.png', source: 'fal-ai/imageutils/depth (MiDaS) — 입력은 시작 그림', cost_note: 'higgsfield 에 깊이 추정기가 없어 이 한 장만 fal' }
  save(m)
  console.log('depth 저장')
}

// ── 중간 프레임 ────────────────────────────────────────────────────────────
const midPrompt = (t: number) => [
  `This is frame ${t}.0 seconds into a ${DURATION}-second continuous shot.`,
  `@Image1 is the FIRST frame of that shot (time 0.0s). @Image2 is the LAST frame (time ${DURATION}.0s).`,
  'Draw the single intermediate frame at the stated time, as if pausing the video there.',
  '',
  `What happens across the shot: ${sceneText}`,
  '',
  'Keep the SAME character, the SAME clothing, the SAME location, the SAME art style, the SAME line quality',
  'and the SAME colour treatment as the two reference frames — this is one continuous shot, not a new drawing.',
  'Only her position, her pose and the camera framing progress toward the last frame by the stated amount.',
  'Do not add text, captions, timestamps, borders or panel dividers.',
].join('\n')

function stepFrames() {
  for (const t of MID_TIMES) {
    const dst = join(IN, `anchor_${t}.png`)
    if (existsSync(dst)) { console.log(`중간 프레임 ${t}s 이미 있음 — skip`); continue }
    const p = midPrompt(t)
    try {
      console.log(`중간 프레임 ${t}s 생성…`)
      const id = hfJobId(hf(['generate', 'create', 'gpt_image_2', '--prompt', p,
        '--image-references', START, '--image-references', END,
        '--aspect_ratio', ANCHOR_W >= ANCHOR_H ? '3:2' : '2:3', '--resolution', '1k', '--json']))
      const url = hfWaitUrl(id, 'png|jpe?g|webp')
      const tmp = join(IN, `_mid_${t}_raw`)
      dl(url, tmp)
      resize(tmp, dst)
      m.mid_frames = m.mid_frames.filter((f: any) => f.t !== t)
      m.mid_frames.push({ t, file: `inputs/anchor_${t}.png`, prompt: p, credits: 7 })
      m.credits_spent += 7
      save(m)
      console.log(`  → ${dst}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      m.mid_frames = m.mid_frames.filter((f: any) => f.t !== t)
      m.mid_frames.push({ t, prompt: p, error: msg })
      save(m)
      console.log(`  ✗ ${t}s 실패: ${msg.slice(0, 160)}`)
    }
  }
  m.mid_frames.sort((a: any, b: any) => a.t - b.t)
  save(m)
}

// ── 영상 (동시 8건 상한 준수 — 1판에서 9번째부터 튕긴 실측) ────────────────
function anchorClause(times: number[], withDepth: boolean): string {
  const lines: string[] = []
  if (times.length <= 1) lines.push('@Image1 is the first frame of the shot.')
  else {
    lines.push(`The shot is ${DURATION} seconds long. The reference frames are timed keyframes of THIS SAME shot:`)
    times.forEach((t, i) => {
      const where = t === 0 ? 'the first frame' : t === DURATION ? 'the last frame' : `the frame at ${t}.0 seconds`
      lines.push(`- @Image${i + 1} is ${where} (time ${t}.0s).`)
    })
    lines.push('Move through these frames in that exact order at those exact times. Between them, interpolate smoothly.')
  }
  if (withDepth) lines.push(
    `- @Image${times.length + 1} is a DEPTH MAP of the first frame: bright = near the camera, dark = far away.`,
    'It describes the 3D layout only. Use it to keep the spatial structure and the relative distances consistent.',
    'Never render it, never show grayscale, never copy its colours into the picture.')
  return lines.join('\n')
}

function stepVideos() {
  const depthFile = m.depth?.file ? join(DIR, m.depth.file) : null
  const plan: Array<{ key: string; args: string[]; label: string; times: number[]; depth: boolean; prompt: string; anchors: string[] }> = []

  for (const c of CONDS) for (const withDepth of [false, true]) {
    if (withDepth && !depthFile) continue
    const key = `${c.key}${withDepth ? '_d' : ''}`
    if (m.jobs.find((j: any) => j.key === key && j.video_url)) { console.log(`${key} 이미 완료 — skip`); continue }
    const times = [0, ...c.mids, ...(c.useEnd ? [DURATION] : [])]
    const files = times.map((t) => join(IN, `anchor_${t}.png`))
    const miss = files.filter((f) => !existsSync(f))
    if (miss.length) { console.log(`${key} 앵커 누락 — 건너뜀`); continue }
    const prompt = `${BASE_PROMPT}\n\n${anchorClause(times, withDepth)}`
    const args = ['generate', 'create', 'seedance_2_0', '--prompt', prompt, '--start-image', files[0]]
    if (c.useEnd) args.push('--end-image', files[files.length - 1])
    for (const f of files.slice(1, c.useEnd ? files.length - 1 : files.length)) args.push('--image-references', f)
    if (withDepth) args.push('--image-references', depthFile!)
    args.push('--duration', String(DURATION), '--resolution', RESOLUTION, '--aspect_ratio', ASPECT, '--json')
    plan.push({ key, args, label: `${c.label}${withDepth ? ' + depth' : ''}`, times, depth: withDepth, prompt, anchors: files.map((f) => f.replace(DIR + '/', '')) })
  }

  // 8건씩 끊어서: 제출 → 수신 → 다음 묶음
  for (let i = 0; i < plan.length; i += CONCURRENT_CAP) {
    const batch = plan.slice(i, i + CONCURRENT_CAP)
    console.log(`\n── 묶음 ${Math.floor(i / CONCURRENT_CAP) + 1} (${batch.length}건) 제출 ──`)
    const pending: Array<{ key: string; id: string }> = []
    for (const b of batch) {
      try {
        const id = hfJobId(hf(b.args))
        m.jobs = m.jobs.filter((j: any) => j.key !== b.key)
        m.jobs.push({ key: b.key, label: b.label, depth: b.depth, anchors: b.anchors, anchor_times: b.times, prompt: b.prompt, job_id: id, credits: 22.5 })
        m.credits_spent += 22.5
        save(m)
        pending.push({ key: b.key, id })
        console.log(`  발주 ${b.key} — job ${id}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        m.jobs = m.jobs.filter((j: any) => j.key !== b.key)
        m.jobs.push({ key: b.key, label: b.label, depth: b.depth, anchors: b.anchors, anchor_times: b.times, prompt: b.prompt, error: msg })
        save(m)
        console.log(`  ✗ ${b.key} 발주 실패: ${msg.slice(0, 160)}`)
      }
    }
    for (const p of pending) {
      try {
        const url = hfWaitUrl(p.id, 'mp4')
        const file = `out/${p.key}.mp4`
        dl(url, join(DIR, file))
        const j = m.jobs.find((x: any) => x.key === p.key)
        j.video_url = url; j.file = file
        save(m)
        console.log(`  ✓ ${p.key}`)
      } catch (e) {
        const j = m.jobs.find((x: any) => x.key === p.key)
        j.error = e instanceof Error ? e.message : String(e)
        save(m)
        console.log(`  ✗ ${p.key} 수신 실패`)
      }
    }
  }
}

const step = process.argv[2] ?? 'all'
if (step === 'depth' || step === 'all') await stepDepth()
if (step === 'frames' || step === 'all') stepFrames()
if (step === 'videos' || step === 'all') stepVideos()
save(m)
console.log(`\n완료 — 영상 ${m.jobs.filter((j: any) => j.video_url).length}/${m.jobs.length} · 중간 프레임 ${m.mid_frames.filter((f: any) => f.file).length}/${MID_TIMES.length} · 크레딧 ${m.credits_spent}`)
