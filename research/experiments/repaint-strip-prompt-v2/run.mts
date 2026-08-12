// 리페인트 지시문 v2 — 팔 A(현행) vs 팔 B(제안 2문장 추가) 생성기.
//
//   plan   : 유료 콜 0. 두 팔의 입력을 실제로 조립해 run/manifest.json + 비용표 + 새니티 검사.
//   submit : fal 큐에 제출 (--smoke = 1건만).
//   collect: 결과 내려받기.
//
// 재현성 규칙 1(복붙 금지): 프롬프트·스트립 합성·모델 파라미터는 전부 제품 함수를 import 한다.
//   조립은 generate-storyboard 라우트와 동일(composeRoughReferenceStrip + appendCheckConstraints
//   + continuityLine + buildRealStripPrompt + falImageSubmit). 선례: previz-channel-ablation/run.mts.
//
// 팔 B는 **제품 코드를 고치지 않고** 팔 A 산출 문자열에 제안 2문장을 삽입해 만든다.
//   삽입 지점·문장은 미저장 수정본(worktree fix/fal-wiring 의 storyboard-strip.ts diff) 원문 그대로.
//   sanity() 가 "B에서 2문장을 빼면 A와 바이트 동일"을 검사한다 — 팔 간 유일 차이 보증.
import { config } from 'dotenv'
config({ path: process.env.TALE_ENV_FILE ?? '.env.local' })

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fal } from '@fal-ai/client'

import type { AnchorableSubmit } from '@/lib/style-anchor'

// 제품 모듈은 **동적 import** 로만 — fal.ts / supabase admin 이 모듈 스코프에서 env 를 읽으므로
//   정적 import 는 호이스팅돼 dotenv config() 보다 먼저 평가된다(선례 run.mts:26-29).
type Product = {
  composeRoughReferenceStrip: typeof import('@/lib/director/storyboard-strip')['composeRoughReferenceStrip']
  buildRealStripPrompt: typeof import('@/lib/director/storyboard-strip')['buildRealStripPrompt']
  appendCheckConstraints: typeof import('@/lib/writer/check-notes')['appendCheckConstraints']
  falImageSubmit: typeof import('@/lib/writer/llm/fal')['falImageSubmit']
}
let P: Product
async function loadProduct(): Promise<Product> {
  if (P) return P
  const [strip, notes, falLib] = await Promise.all([
    import('@/lib/director/storyboard-strip'),
    import('@/lib/writer/check-notes'),
    import('@/lib/writer/llm/fal'),
  ])
  P = {
    composeRoughReferenceStrip: strip.composeRoughReferenceStrip,
    buildRealStripPrompt: strip.buildRealStripPrompt,
    appendCheckConstraints: notes.appendCheckConstraints,
    falImageSubmit: falLib.falImageSubmit,
  }
  return P
}

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const RUN = join(DIR, 'run')
const ASSETS = join(RUN, 'assets')
const STRIPS = join(RUN, 'strips')
const MANIFEST = join(RUN, 'manifest.json')

// ── 사전 등록 상수 ──
const REPS = 3
const ARMS = ['A', 'B'] as const
type Arm = (typeof ARMS)[number]

/** 팔 B 삽입 — 미저장 수정본 diff 원문 그대로. [앵커(팔 A 문장 끝), 덧붙일 문장] */
const B_PATCHES: Array<{ id: string; anchor: string; add: string }> = [
  {
    id: 'middle-no-invent',
    anchor: 'This is the only panel with text.',
    add: ' Never invent arrows or labels that are not in reference panel 2 — if the rough sheet has no arrows (a static hold), the middle panel stays clean with no annotation.',
  },
  {
    id: 'bottom-arrived-state',
    anchor: "matching reference panel 3's composition exactly.",
    add: " Reproduce panel 3's arrived state faithfully: every element the motion changed (a drawer now open, a figure now moved or turned, an object now displaced) must be shown in its completed end state. If the shot contains two or more movements, show ALL of them completed — never repeat the top panel's state.",
  },
]

function applyArmB(promptA: string): string {
  let out = promptA
  for (const p of B_PATCHES) {
    const i = out.indexOf(p.anchor)
    if (i < 0) throw new Error(`팔 B 앵커 미발견(${p.id}): ${p.anchor}`)
    if (out.indexOf(p.anchor, i + 1) >= 0) throw new Error(`팔 B 앵커 중복(${p.id})`)
    out = out.slice(0, i + p.anchor.length) + p.add + out.slice(i + p.anchor.length)
  }
  return out
}

/** B 에서 삽입분만 제거 — sanity 용 역변환. */
function stripArmB(promptB: string): string {
  let out = promptB
  for (const p of B_PATCHES) out = out.split(p.add).join('')
  return out
}

interface Fixture {
  shot_id: string
  klass: string
  label: string
  why: string
  shot: Record<string, any>
  prevShot: { scene_id?: string; prompt?: string; action_description?: string } | null
  charRefs: string[]
  charNames: string[]
  roughFrames: { start: string; direction: string; end: string }
  realFrames: { start: string; direction?: string; end: string }
}
interface Frozen {
  collectedAt: string
  project: { id: string; title: string; workspace_id: string; style_anchor_key: string }
  styleAnchor: { key: string; imageUrl: string } | null
  fixtures: Fixture[]
}

const frozen = JSON.parse(readFileSync(join(RUN, 'fixtures.json'), 'utf8')) as Frozen
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex').slice(0, 16)

/** 라우트의 continuityLine 재현 (generate-storyboard/route.ts:86-99) — 같은 씬 직전 샷일 때만. */
function continuityLine(fx: Fixture): string {
  const prev = fx.prevShot
  if (!prev) return ''
  const prevText = ((prev.prompt || prev.action_description) ?? '').trim()
  if (prev.scene_id !== fx.shot.scene_id || !prevText) return ''
  return `\nContinuity: moments earlier the previous shot showed "${prevText.slice(0, 110)}". Carry over the character's wardrobe, props, lighting and surrounding environment from it, while depicting this shot's own moment.`
}

/** store 의 effectivePrompt → writerDirectorPromptSource = shot.prompt || actionDescription. */
function effectivePrompt(fx: Fixture): string {
  return ((fx.shot.prompt as string) || (fx.shot.action_description as string) || '').trim()
}

async function stripFor(fx: Fixture): Promise<{ local: string; sha: string }> {
  mkdirSync(STRIPS, { recursive: true })
  const local = join(STRIPS, `${fx.shot_id}_ref_strip.png`)
  if (!existsSync(local)) {
    const buf = await P.composeRoughReferenceStrip(fx.roughFrames)
    writeFileSync(local, buf)
  }
  return { local, sha: sha(readFileSync(local)) }
}

async function buildJobs(): Promise<any[]> {
  const jobs: any[] = []
  for (const fx of frozen.fixtures) {
    const strip = await stripFor(fx)
    const guarded = P.appendCheckConstraints(effectivePrompt(fx), fx.shot.check_notes) + continuityLine(fx)
    const promptA = P.buildRealStripPrompt(guarded, {
      characterRefCount: fx.charRefs.length,
      hasStyleRef: !!frozen.styleAnchor,
    })
    const promptB = applyArmB(promptA)
    for (const arm of ARMS) {
      for (let rep = 1; rep <= REPS; rep++) {
        jobs.push({
          key: `${fx.shot_id}__${arm}__r${rep}`,
          arm,
          shot_id: fx.shot_id,
          klass: fx.klass,
          label: fx.label,
          rep,
          model: 'openai/gpt-image-2/edit', // falImageSubmit resolveImageModel 결과(ref 있음 → edit)
          prompt: arm === 'A' ? promptA : promptB,
          guardedPrompt: guarded,
          stripLocal: strip.local,
          stripSha: strip.sha,
          refOrder: ['<rough_strip>', ...fx.charNames, ...(frozen.styleAnchor ? [`style:${frozen.styleAnchor.key}`] : [])],
          charRefs: fx.charRefs,
          anchorRef: frozen.styleAnchor?.imageUrl ?? null,
          image_size_requested: '1024x1536',
        })
      }
    }
  }
  return jobs
}

function sanity(jobs: any[]): string[] {
  const errs: string[] = []
  const expected = frozen.fixtures.length * ARMS.length * REPS
  if (jobs.length !== expected) errs.push(`잡 수 ${jobs.length} != ${expected}`)
  for (const fx of frozen.fixtures) {
    const a = jobs.find((j) => j.shot_id === fx.shot_id && j.arm === 'A')
    const b = jobs.find((j) => j.shot_id === fx.shot_id && j.arm === 'B')
    if (!a || !b) { errs.push(`${fx.shot_id}: 팔 누락`); continue }
    // 유일 차이 보증: B에서 삽입 2문장만 제거하면 A와 바이트 동일이어야 한다.
    if (stripArmB(b.prompt) !== a.prompt) errs.push(`${fx.shot_id}: 팔 간 오염 — B-삽입분 != A`)
    if (b.prompt.length - a.prompt.length !== B_PATCHES.reduce((s, p) => s + p.add.length, 0))
      errs.push(`${fx.shot_id}: B 증분 길이 불일치`)
    for (const p of B_PATCHES) {
      if (a.prompt.includes(p.add)) errs.push(`${fx.shot_id}: A에 B 문장 누출(${p.id})`)
      if (!b.prompt.includes(p.add)) errs.push(`${fx.shot_id}: B에 문장 미삽입(${p.id})`)
    }
    if (a.stripSha !== b.stripSha) errs.push(`${fx.shot_id}: 스트립 참조 불일치`)
    if (JSON.stringify(a.charRefs) !== JSON.stringify(b.charRefs)) errs.push(`${fx.shot_id}: 캐릭터 참조 불일치`)
    if (a.anchorRef !== b.anchorRef) errs.push(`${fx.shot_id}: 스타일 앵커 불일치`)
    if (a.guardedPrompt !== b.guardedPrompt) errs.push(`${fx.shot_id}: 샷 주문서 불일치`)
  }
  for (const j of jobs) {
    if (!j.prompt.includes('3-panel vertical storyboard strip')) errs.push(`${j.key}: 스트립 문안 없음`)
    const expectedRefs = 1 + j.charRefs.length + (j.anchorRef ? 1 : 0)
    if (j.refOrder.length !== expectedRefs) errs.push(`${j.key}: 참조 수 ${j.refOrder.length} != ${expectedRefs}`)
    if (j.charRefs.length > 0 && !j.prompt.includes('Replace every wooden mannequin')) errs.push(`${j.key}: 마네킹 치환 절 없음`)
    if (j.anchorRef && !j.prompt.includes('LAST reference image')) errs.push(`${j.key}: 스타일 앵커 절 없음`)
  }
  return errs
}

/** 단가 근거 — fal 공개 가격표(2026-08-12 조회). 코드/설정에 이미지 단가 상수는 없다. */
function costTable(jobs: any[]) {
  const UNIT_LIST = 0.2 // openai/gpt-image-2/edit · high(기본) · 1024x1536
  const UNIT_CEIL = 0.413 // 같은 표의 최댓값(3840x2160 high) — 상한 시나리오
  return {
    calls: jobs.length,
    model: 'openai/gpt-image-2/edit',
    quality: 'high (엔드포인트 기본 — 코드가 quality 를 안 보냄)',
    imageSizeSent: "auto (라우트가 준 image_size '1024x1536' 은 FalImageOptions 에 없어 버려지고 arToImageSize(undefined)='auto' 가 나간다 — 프로덕션 실동작 그대로)",
    unitUsdList: UNIT_LIST,
    estUsd: +(jobs.length * UNIT_LIST).toFixed(2),
    ceilUsd: +(jobs.length * UNIT_CEIL).toFixed(2),
    basis: [
      'https://fal.ai/models/openai/gpt-image-2/edit — 1024x1536 high $0.178 (모델 페이지 표)',
      'https://fal.ai/learn/tools/gpt-image-2-review — edit high 1024x1536 $0.200, 기본 quality=high, 요청마다 토큰 과금 가산',
      '두 출처 중 큰 값 $0.20 을 단가로 채택. ceilUsd 는 표 최댓값(4K high $0.413) 기준 상한.',
    ],
  }
}

async function plan() {
  await loadProduct()
  mkdirSync(RUN, { recursive: true })
  const jobs = await buildJobs()
  const errs = sanity(jobs)
  const manifest = {
    plannedAt: new Date().toISOString(),
    fixturesFrozenAt: frozen.collectedAt,
    project: frozen.project,
    styleAnchor: frozen.styleAnchor,
    design: {
      reps: REPS,
      arms: { A: '현행 지시문 (buildRealStripPrompt 그대로)', B: '현행 + 제안 2문장 (화살표칸 발명금지 / 끝칸 도착상태)' },
      shots: frozen.fixtures.map((f) => ({ shot_id: f.shot_id, klass: f.klass, label: f.label, why: f.why })),
      bPatches: B_PATCHES,
    },
    cost: costTable(jobs),
    sanity: errs.length ? { ok: false, errors: errs } : { ok: true },
    jobs,
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
  console.log(JSON.stringify({ ...manifest, jobs: `${jobs.length} jobs` }, null, 2))
}

async function submit(smoke: boolean) {
  await loadProduct()
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  if (!m.sanity?.ok) throw new Error('sanity 실패 상태로는 제출 금지')
  mkdirSync(ASSETS, { recursive: true })
  const jobs: any[] = m.jobs
  const targets = smoke ? jobs.slice(0, 1) : jobs
  for (const job of targets) {
    if (job.request_id) { console.log(`skip ${job.key} (이미 제출됨)`); continue }
    if (!job.stripUrl) {
      // 같은 샷의 두 팔은 같은 스트립 URL 을 공유한다(이미 올렸으면 재사용).
      const sibling = jobs.find((j: any) => j.shot_id === job.shot_id && j.stripUrl)
      job.stripUrl = sibling
        ? sibling.stripUrl
        : await fal.storage.upload(new Blob([readFileSync(job.stripLocal)], { type: 'image/png' }))
    }
    // 라우트와 동일: AnchorableSubmit 를 spread 로 넘긴다(image_size 포함 — 실동작 재현).
    const opts: AnchorableSubmit = {
      prompt: job.prompt,
      image_size: job.image_size_requested,
      reference_image_urls: [job.stripUrl, ...job.charRefs, ...(job.anchorRef ? [job.anchorRef] : [])],
    }
    try {
      const { request_id, model, fal_request } = await P.falImageSubmit({ ...opts })
      job.request_id = request_id
      job.model_actual = model
      job.fal_request = fal_request
      job.submitted_at = new Date().toISOString()
      console.log(`submitted ${job.key} → ${request_id}`)
    } catch (e) {
      job.submit_error = (e as Error).message
      console.error(`FAILED ${job.key}: ${job.submit_error}`)
    }
    writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
  }
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
  console.log(`\n${targets.filter((j) => j.request_id).length}/${targets.length} 제출됨`)
}

async function collect() {
  await loadProduct()
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  mkdirSync(ASSETS, { recursive: true })
  const jobs: any[] = m.jobs.filter((j: any) => j.request_id)
  let pending = jobs.filter((j) => !j.done)
  const deadline = Date.now() + 25 * 60_000
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.model_actual, { requestId: job.request_id, logs: false })
        if (st.status !== 'COMPLETED') continue
        const { data } = await fal.queue.result(job.model_actual, { requestId: job.request_id })
        const d = data as any
        const img = d?.images?.[0] ?? d?.image
        const url = img?.url
        if (!url) throw new Error(`no url: ${JSON.stringify(d).slice(0, 200)}`)
        const dest = join(ASSETS, `${job.key}.png`)
        const res = await fetch(url)
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
        job.done = true
        job.out_url = url
        job.out_size = { width: img?.width ?? null, height: img?.height ?? null }
        job.local = dest
        job.collected_at = new Date().toISOString()
        console.log(`done ${job.key} ${job.out_size.width}x${job.out_size.height}`)
      } catch (e) {
        console.error(`poll ${job.key}: ${(e as Error).message}`)
      }
    }
    writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
    pending = jobs.filter((j) => !j.done)
    if (pending.length) await new Promise((r) => setTimeout(r, 15_000))
  }
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
  console.log(`\ncollected ${jobs.length - pending.length}/${jobs.length}`)
  if (pending.length) process.exitCode = 1
}

const mode = process.argv[2]
const smoke = process.argv.includes('--smoke')
if (mode === 'plan') await plan()
else if (mode === 'submit') await submit(smoke)
else if (mode === 'collect') await collect()
else throw new Error('usage: run.mts plan | submit [--smoke] | collect')
