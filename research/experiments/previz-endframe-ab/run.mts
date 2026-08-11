// 끝 그림 A/B + 정체성 참조 팔 — 서로 다른 4개 프로젝트에서 뽑은 "시작↔끝 변화가 큰" 샷 3개.
//   왜: 오너 지시 2026-08-11 — ① 끝 그림이 품질을 떨구는지 다른 시나리오에서 확인
//                              ② 끝 그림 대신 캐릭터/배경 그림을 주면 어떻게 되는지
//   변인: **참조 이미지 구성뿐**. 문장은 제품 `buildVideoPrompt` 가 만든 것을 그대로 쓰고,
//         참조가 늘어난 팔에만 역할 선언 문단을 덧붙인다(그 문단 자체가 팔의 일부).
//   팔:
//     A 시작만                          image_urls=[start]
//     B 시작+끝 (제품 그대로)             image_urls=[start,end]  + 제품의 START/END 수렴 문구
//     C 시작+정체성 참조                  image_urls=[start, 캐릭터 정면, 캐릭터 얼굴, 장소 와이드]
//     D 시작+캐릭터 다각도 (한 샷만)       image_urls=[start, 정면, 좌측면, 우측면, 후면, 장소 와이드]
//        └ 측면/후면은 DB에 없어서 제품 함수로 **이번에 새로 만든다**(로컬 보관, DB 미기록).
// 예산 하드캡 $22 — submit 전 검사. 재시도 없음.
// 실행: pnpm dlx tsx research/experiments/previz-endframe-ab/run.mts \
//         views | plan | submit | collect | frames | finalize
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

const { fal } = await import('@fal-ai/client')
const { VIDEO_MODELS } = await import('@/lib/video-models')
const { buildVideoPrompt } = await import('@/lib/director/video-prompt')
const { buildCharacterViewPrompt } = await import('@/lib/artist/turnaround')
const { supabaseAdmin } = await import('@/lib/supabase/admin')

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const RUN = join(DIR, 'run')
const MANIFEST = join(RUN, 'manifest.json')
const spec = VIDEO_MODELS.seedance
const RATE_IMAGE_ONLY = 0.3024 // fal 모델 페이지 실측 2026-08-11 (720p, 영상 참조 없음)
const BUDGET_CAP_USD = 22

/** 참조가 3장 이상인 팔에 붙이는 역할 선언 — 시작 그림 외의 그림이 "이 샷의 프레임"으로 오해되지 않게. */
const IDENTITY_ROLE_CLAUSE =
  'Reference roles: @Image1 is this shot\'s START frame — it defines the first frame, the framing and the set dressing. Every other reference image is an identity reference only: it shows how the character and the location look, not a moment of this shot. Never cut to them and never reproduce their poses or their backgrounds as frames.'

interface Picked {
  project_id: string
  project_title: string
  shot_id: string
  scene_id: string | null
  duration_seconds: number
  action: string
  prompt: string
  delta: number
  camera_motion: Record<string, unknown>
  character_motion: unknown
  start: string
  end: string
  characters: string[]
  tag: string
  characterViews: Array<{ character_id: string; name: string; appearance: string; views: Record<string, string | null> }>
  locationViews: Array<{ location_id: string; name: string; visual_description: string; views: Record<string, string | null> }>
}

function selection(): { picked: Picked[] } {
  return JSON.parse(readFileSync(join(RUN, 'selection.json'), 'utf8'))
}

/** 실험 대상 3샷 — 프로젝트 다양성 우선.
 *  제외: Sample2(오늘 이미 쓴 프로젝트 — 신선도) · Sample1(스타일 앵커 real + 실존 배우명이라
 *  얼굴이 큰 샷은 Seedance 가 발주 자체를 거부한다 — 이번에 sh_04_30 4건 전부 content_policy_violation). */
// writer_test_260810 도 제외 — 제목 12자 슬라이스 + 같은 샷 번호(sh_01_04)라 260805_7 과 자산
//   파일명이 충돌한다(태그 체계의 약점, 이번 판은 회피로 처리하고 다음 실험에서 태그에 프로젝트 id 를 넣는다).
const EXCLUDED_PROJECT_PREFIXES = ['Sample2', 'Sample1', 'writer_test_260810']
function targets(): Picked[] {
  return selection()
    .picked.filter((p) => !EXCLUDED_PROJECT_PREFIXES.some((x) => p.project_title.startsWith(x)))
    .slice(0, 3)
}

// ── ① 캐릭터 다각도 뷰 생성 (팔 D 준비) ───────────────────────────────────────
// 팔 D 대상. sh_04_19(실사 스타일)은 생성된 낱장 뷰가 실존인물 유사성 필터에 걸려 발주가 반려됐다
//   (content_policy_violation, 2026-08-11 실측) → 카툰 스타일 프로젝트의 sh_04_29 로 한 번 더 시도한다.
const VIEW_SHOT_IDS = ['sh_04_19', 'sh_04_29']

function viewsPath(shotId: string): string {
  return join(RUN, `views_${shotId}.json`)
}

async function makeViews() {
  const shotId = process.argv[3] ?? VIEW_SHOT_IDS[0]
  const t = targets().find((p) => p.shot_id === shotId)
  if (!t) throw new Error(`팔 D 대상 샷을 찾지 못했다: ${shotId}`)
  const ch = t.characterViews[0]
  const main = ch.views.view_main__url as string | undefined
  if (!main) throw new Error('정면 뷰(view_main) 없음 — 다각도 생성 불가')
  const { falImageSubmit } = await import('@/lib/writer/llm/fal')
  const { resolveStyleAnchorByKey } = await import('@/lib/style-anchor')
  const { data: proj } = await supabaseAdmin
    .from('projects')
    .select('style_anchor_key')
    .eq('id', t.project_id)
    .maybeSingle()
  const anchor = await resolveStyleAnchorByKey((proj?.style_anchor_key as string | null) ?? null)

  const out: Record<string, unknown> = { shot_id: t.shot_id, character_id: ch.character_id, jobs: [] }
  for (const view of ['sideLeft', 'sideRight', 'back'] as const) {
    const prompt = buildCharacterViewPrompt(
      { name: ch.name, appearance: ch.appearance ?? '' },
      view,
    )
    const refs = [main, ...(anchor ? [anchor.imageUrl] : [])]
    const { request_id, model } = await falImageSubmit({
      prompt,
      reference_image_urls: refs,
      aspect_ratio: '3:4',
    } as never)
    ;(out.jobs as unknown[]).push({ view, request_id, model, prompt, reference_image_urls: refs })
    console.log(`view ${view} → ${request_id}`)
  }
  writeFileSync(viewsPath(shotId), JSON.stringify(out, null, 2))
}

async function collectViews() {
  const shotId = process.argv[3] ?? VIEW_SHOT_IDS[0]
  const VIEWS_F = viewsPath(shotId)
  const v = JSON.parse(readFileSync(VIEWS_F, 'utf8'))
  const deadline = Date.now() + 20 * 60_000
  let pending = (v.jobs as Array<Record<string, unknown>>).filter((j) => !j.url && !j.failed)
  while (pending.length && Date.now() < deadline) {
    for (const j of pending) {
      const st = await fal.queue.status(j.model as string, { requestId: j.request_id as string, logs: false })
      if (st.status !== 'COMPLETED') {
        console.log(`... ${j.view}: ${st.status}`)
        continue
      }
      try {
        const { data } = await fal.queue.result(j.model as string, { requestId: j.request_id as string })
        const url = (data as { images?: Array<{ url?: string }> })?.images?.[0]?.url
        if (!url) throw new Error(`no image url: ${JSON.stringify(data).slice(0, 200)}`)
        j.url = url
        const dest = join(RUN, 'assets', `generated_${shotId}_${v.character_id}_${j.view}.png`)
        writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()))
        j.local = dest
        console.log(`done ${j.view} → ${dest}`)
      } catch (e) {
        j.failed = true
        j.error = String((e as Error).message ?? e)
        console.error(`FAILED ${j.view}: ${j.error}`)
      }
    }
    writeFileSync(VIEWS_F, JSON.stringify(v, null, 2))
    pending = (v.jobs as Array<Record<string, unknown>>).filter((j) => !j.url && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 15_000))
  }
  writeFileSync(VIEWS_F, JSON.stringify(v, null, 2))
}

// ── ② 팔별 발주 payload 조립 ────────────────────────────────────────────────

interface Arm {
  arm: string
  label: string
  images: (p: Picked) => string[]
  startEnd: boolean
  roleClause: boolean
  only?: string
  onlyList?: string[]
}

/** 씬이 지목한 장소 → 그 장소의 와이드 그림. 씬 정보가 없으면 첫 장소로 폴백.
 *  (초판 결함 2026-08-11: 무조건 첫 장소를 썼다가 Sample1 샷에 법정 그림이 들어갔다 — 실제 씬은 사무실.
 *   그 잘못된 발주도 기록에 남긴다: 팔 C, 교정본은 팔 C2.) */
const SCENE_LOCATION: Record<string, string> = {}
async function loadSceneLocations() {
  for (const p of targets()) {
    if (!p.scene_id) continue
    const { data } = await supabaseAdmin
      .from('scenes')
      .select('location')
      .eq('project_id', p.project_id)
      .eq('scene_id', p.scene_id)
      .maybeSingle()
    const loc = (data?.location as string | null) ?? null
    if (loc) SCENE_LOCATION[`${p.project_id}::${p.shot_id}`] = loc
  }
}
function locWide(p: Picked, useScene = true): string | null {
  const want = useScene ? SCENE_LOCATION[`${p.project_id}::${p.shot_id}`] : null
  const l =
    (want ? p.locationViews.find((x) => x.location_id === want && x.views.wide_shot__url) : null) ??
    p.locationViews.find((x) => (x.views.wide_shot__url as string | undefined))
  return (l?.views.wide_shot__url as string | undefined) ?? null
}
function charUrl(p: Picked, k: string): string | null {
  return (p.characterViews[0]?.views[`${k}__url`] as string | undefined) ?? null
}
function generatedViews(shotId: string): Record<string, string> {
  const f = join(RUN, `views_${shotId}.json`)
  if (!existsSync(f)) return {}
  const v = JSON.parse(readFileSync(f, 'utf8'))
  const m: Record<string, string> = {}
  for (const j of v.jobs as Array<Record<string, unknown>>) if (j.url) m[j.view as string] = j.url as string
  return m
}

const ARMS: Arm[] = [
  { arm: 'A', label: '시작 그림만', images: (p) => [p.start], startEnd: false, roleClause: false },
  { arm: 'B', label: '시작+끝 (제품 그대로)', images: (p) => [p.start, p.end], startEnd: true, roleClause: false },
  {
    arm: 'C',
    label: '시작 + 정체성 참조(캐릭터 정면·얼굴 + 장소 와이드)',
    images: (p) => [p.start, charUrl(p, 'view_main'), charUrl(p, 'portrait'), locWide(p, false)].filter((u): u is string => !!u),
    startEnd: false,
    roleClause: true,
  },
  {
    arm: 'C2',
    label: '시작 + 정체성 참조 (장소를 씬이 지목한 곳으로 교정)',
    images: (p) => [p.start, charUrl(p, 'view_main'), charUrl(p, 'portrait'), locWide(p, true)].filter((u): u is string => !!u),
    startEnd: false,
    roleClause: true,
    only: 'sh_04_30',
  },
  {
    arm: 'D',
    label: '시작 + 캐릭터 다각도(정면·좌·우·후) + 장소 와이드',
    images: (p) => {
      const g = generatedViews(p.shot_id)
      return [p.start, charUrl(p, 'view_main'), g.sideLeft, g.sideRight, g.back, locWide(p)].filter(
        (u): u is string => !!u,
      )
    },
    startEnd: false,
    roleClause: true,
    onlyList: VIEW_SHOT_IDS,
  },
]

function promptFor(p: Picked, a: Arm): string {
  const { fullPrompt } = buildVideoPrompt({
    // 샷의 prompt 칸이 비어 있으면 제품 캔버스가 보여주는 것과 같은 폴백(행동 서술)을 쓴다.
    prompt: p.prompt.trim() || p.action,
    generationMethod: 'I2V',
    modelKey: 'seedance',
    durationSeconds: p.duration_seconds,
    startEndReference: a.startEnd,
    dynamicSpec: {
      shot_id: p.shot_id,
      camera_motion: p.camera_motion,
      character_motion: p.character_motion,
    } as never,
  } as never)
  return a.roleClause ? `${fullPrompt} ${IDENTITY_ROLE_CLAUSE}` : fullPrompt
}

interface Job {
  key: string
  shot: string
  project: string
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
  if (!existsSync(MANIFEST)) return { jobs: [] }
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}
function billable(jobs: Job[]): number {
  return +jobs.filter((j) => !j.failed).reduce((s, j) => s + (j.est_cost_usd ?? 0), 0).toFixed(4)
}

function plan(): Array<{ p: Picked; a: Arm }> {
  const out: Array<{ p: Picked; a: Arm }> = []
  for (const p of targets())
    for (const a of ARMS) {
      if (a.only && p.shot_id !== a.only) continue
      if (a.onlyList && !a.onlyList.includes(p.shot_id)) continue
      out.push({ p, a })
    }
  return out
}

function showPlan() {
  let total = 0
  mkdirSync(join(RUN, 'inputs'), { recursive: true })
  for (const { p, a } of plan()) {
    const imgs = a.images(p)
    const cost = +(RATE_IMAGE_ONLY * p.duration_seconds).toFixed(4)
    total += cost
    const prompt = promptFor(p, a)
    writeFileSync(join(RUN, 'inputs', `${p.tag}__${a.arm}.txt`), prompt)
    console.log(`${p.tag.padEnd(28)} ${a.arm}  ${p.duration_seconds}s  refs=${imgs.length}  $${cost}  ${a.label}`)
  }
  console.log(`\n합계 $${total.toFixed(2)} (캡 $${BUDGET_CAP_USD}) · 프롬프트 전문 → run/inputs/`)
}

async function submit() {
  const prov = readManifest()
  for (const { p, a } of plan()) {
    const key = `${p.tag}__${a.arm}`
    if (prov.jobs.some((j) => j.key === key)) {
      console.log(`skip ${key}`)
      continue
    }
    const imgs = a.images(p)
    if (a.arm === 'D' && imgs.length < 5) throw new Error(`팔 D 참조 부족(${imgs.length}) — 다각도 생성 먼저`)
    const input: Record<string, unknown> = {
      prompt: promptFor(p, a),
      duration: p.duration_seconds,
      resolution: '720p',
      generate_audio: true,
      image_urls: imgs,
    }
    const est = +(RATE_IMAGE_ONLY * p.duration_seconds).toFixed(4)
    if (billable(prov.jobs) + est > BUDGET_CAP_USD)
      throw new Error(`예산 하드캡 초과(${key}): $${billable(prov.jobs)} + $${est} > $${BUDGET_CAP_USD}`)
    const { request_id } = await fal.queue.submit(spec.endpoint, { input })
    prov.jobs.push({
      key,
      shot: p.shot_id,
      project: p.project_title,
      arm: a.arm,
      label: a.label,
      request_id,
      endpoint: spec.endpoint,
      duration_seconds: p.duration_seconds,
      est_cost_usd: est,
      input,
      submitted_at: new Date().toISOString(),
    })
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    console.log(`submitted ${key} → ${request_id} [$${est}]`)
  }
  console.log(`billable $${billable(prov.jobs)}`)
}

async function collect() {
  const prov = readManifest()
  const deadline = Date.now() + 60 * 60_000
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
            console.error(`FAILED ${job.key}: ${job.error.slice(0, 160)}`)
            continue
          }
          throw e
        }
        const url =
          (data as { video?: { url?: string } })?.video?.url ?? (data as { video_url?: string })?.video_url
        if (!url) throw new Error(`no video url`)
        const dest = join(RUN, `out_${job.key}.mp4`)
        writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()))
        job.done = true
        job.video_url = url
        job.local = dest
        console.log(`done ${job.key}`)
      } catch (e) {
        console.error(`poll ${job.key}: ${(e as Error).message}`)
      }
    }
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j) => !j.done && !j.failed)
    if (pending.length) {
      console.log(`... 남은 ${pending.length}`)
      await new Promise((r) => setTimeout(r, 20_000))
    }
  }
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`collected ${prov.jobs.filter((j) => j.done).length}/${prov.jobs.length}  billable $${billable(prov.jobs)}`)
}

function frames() {
  mkdirSync(join(RUN, 'frames'), { recursive: true })
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args])
  for (const job of readManifest().jobs) {
    if (!job.done || !job.local || !existsSync(job.local)) continue
    const f = (n: string) => join(RUN, 'frames', `${job.key}_${n}`)
    ff(['-i', job.local, '-vf', 'fps=1,scale=420:-1,tile=4x3', '-frames:v', '1', '-q:v', '3', f('tile.jpg')])
    ff(['-ss', '0', '-i', job.local, '-frames:v', '1', '-q:v', '2', f('f0.jpg')])
    ff(['-sseof', '-0.15', '-i', job.local, '-update', '1', '-q:v', '2', f('last.jpg')])
    ff(['-i', job.local, '-vf', 'scale=-2:432', '-c:v', 'libx264', '-crf', '29', '-preset', 'veryfast', '-an', '-movflags', '+faststart', join(RUN, `prev_${job.key}.mp4`)])
    console.log(`frames ${job.key} ✓`)
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
  prov.purpose =
    '끝 그림 유무 A/B + 정체성 참조 팔 — 서로 다른 3개 프로젝트의 "시작↔끝 변화가 큰" 샷. 변인은 참조 이미지 구성뿐, 문장은 제품 buildVideoPrompt 산출 그대로'
  prov.model = spec.endpoint
  prov.pricing_source = 'fal 모델 페이지 2026-08-11 실측: 720p 이미지참조만 $0.3024/s (영상참조 동반 시 $0.1814/s)'
  prov.model_limits = 'image_urls 최대 9장 / video_urls 최대 3개 (fal 모델 페이지 2026-08-11). 제품 라우트는 자체적으로 4장으로 자른다'
  prov.selection = 'run/selection.json — 코드가 계산한 시작·끝 차이 순. 사람 눈 개입 없음'
  prov.budget_cap_usd = BUDGET_CAP_USD
  prov.total_cost_usd = billable(prov.jobs)
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized total $${prov.total_cost_usd}`)
}

const mode = process.argv[2]
await loadSceneLocations()
if (mode === 'views') await makeViews()
else if (mode === 'collect-views') await collectViews()
else if (mode === 'plan') showPlan()
else if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'frames') frames()
else if (mode === 'finalize') finalize()
else throw new Error('usage: run.mts views|collect-views|plan|submit|collect|frames|finalize')
