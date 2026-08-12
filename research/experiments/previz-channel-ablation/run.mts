// previz 채널 ablation (축 A) — 실행기.
//   plan   : 유료 콜 0. 모든 팔의 입력을 실제로 조립해 manifest.json + 비용표를 만든다.
//   submit : fal 큐에 제출 (--smoke = 팔당 1건만).
//   collect: 결과 내려받기.
//
// 재현성 규칙 1(복붙 금지): 프롬프트·스트립 합성·모델 파라미터는 전부 제품 함수를 import 한다.
//   A1 = generate-storyboard 라우트와 동일 조립(composeRoughReferenceStrip + buildRealStripPrompt
//        + appendCheckConstraints + continuityLine + falImageSubmit).
//   A2 = generate-video 라우트와 동일 조립(buildVideoPrompt + VIDEO_MODELS 레지스트리).
//        라우트의 buildFalReferenceToVideoRequest 는 파일 지역 함수라 import 불가 —
//        ti2v-camera-cap-recheck/probe.mts 선례대로 레지스트리 spec 필드로 input 을 구성한다
//        (모델 카탈로그가 바뀌면 레지스트리가 따라오므로 하드코딩이 남지 않는다).
import { config } from 'dotenv'
config({ path: process.env.TALE_ENV_FILE ?? '.env.local' })

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fal } from '@fal-ai/client'

import type { AnchorableSubmit } from '@/lib/style-anchor'
import type { VideoModelKey } from '@/lib/video-models'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

// 제품 모듈은 **동적 import** 로만 불러온다.
//   src/lib/writer/llm/fal.ts:11 (`const apiKey = process.env.FAL_KEY`) 과
//   src/lib/supabase/admin.ts:6-8 은 모듈 스코프에서 env 를 읽는다 — 정적 import 는 호이스팅돼
//   dotenv config() 보다 먼저 평가되므로 키가 undefined 로 굳는다.
type Product = {
  composeRoughReferenceStrip: typeof import('@/lib/director/storyboard-strip')['composeRoughReferenceStrip']
  buildRealStripPrompt: typeof import('@/lib/director/storyboard-strip')['buildRealStripPrompt']
  appendCheckConstraints: typeof import('@/lib/writer/check-notes')['appendCheckConstraints']
  falImageSubmit: typeof import('@/lib/writer/llm/fal')['falImageSubmit']
  buildVideoPrompt: typeof import('@/lib/director/video-prompt')['buildVideoPrompt']
  VIDEO_MODELS: typeof import('@/lib/video-models')['VIDEO_MODELS']
  clampDuration: typeof import('@/lib/video-models')['clampDuration']
  normalizeProvider: typeof import('@/lib/video-models')['normalizeProvider']
  loadShotDesignByMainId: typeof import('@/lib/writer/shot-design-state')['loadShotDesignByMainId']
  resolveShotDesign: typeof import('@/lib/writer/shot-design-state')['resolveShotDesign']
  supabaseAdmin: typeof import('@/lib/supabase/admin')['supabaseAdmin']
}
let P: Product
async function loadProduct(): Promise<Product> {
  if (P) return P
  const [strip, notes, falLib, vp, vm, sds, admin] = await Promise.all([
    import('@/lib/director/storyboard-strip'),
    import('@/lib/writer/check-notes'),
    import('@/lib/writer/llm/fal'),
    import('@/lib/director/video-prompt'),
    import('@/lib/video-models'),
    import('@/lib/writer/shot-design-state'),
    import('@/lib/supabase/admin'),
  ])
  P = {
    composeRoughReferenceStrip: strip.composeRoughReferenceStrip,
    buildRealStripPrompt: strip.buildRealStripPrompt,
    appendCheckConstraints: notes.appendCheckConstraints,
    falImageSubmit: falLib.falImageSubmit,
    buildVideoPrompt: vp.buildVideoPrompt,
    VIDEO_MODELS: vm.VIDEO_MODELS,
    clampDuration: vm.clampDuration,
    normalizeProvider: vm.normalizeProvider,
    loadShotDesignByMainId: sds.loadShotDesignByMainId,
    resolveShotDesign: sds.resolveShotDesign,
    supabaseAdmin: admin.supabaseAdmin,
  }
  return P
}

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const RUN = join(DIR, 'run')
const ASSETS = join(RUN, 'assets')
const MANIFEST = join(RUN, 'manifest.json')

// ── 사전 등록 상수 ──
const REPS = 3
const A2_ARMS = ['start_only', 'start_end'] as const
type A2Arm = (typeof A2_ARMS)[number]
const ASPECT = '16:9'
/** 제품 기본 영상 모델. 라우트는 body.model 로 받지만 store 가 eff.provider 를 normalizeProvider 로 넘긴다.
 *  (동적 import 이후에만 확정 가능 — loadProduct() 뒤에 initModel() 로 채운다.) */
let MODEL_KEY: VideoModelKey
let SPEC: (typeof import('@/lib/video-models'))['VIDEO_MODELS'][VideoModelKey]
function initModel() {
  MODEL_KEY = P.normalizeProvider('')
  SPEC = P.VIDEO_MODELS[MODEL_KEY]
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

// ── A1: 리페인트 잡 ──
async function stripFor(fx: Fixture): Promise<{ local: string; sha: string }> {
  mkdirSync(join(RUN, 'strips'), { recursive: true })
  const local = join(RUN, 'strips', `${fx.shot_id}_ref_strip.png`)
  if (!existsSync(local)) {
    const buf = await P.composeRoughReferenceStrip(fx.roughFrames)
    writeFileSync(local, buf)
  }
  return { local, sha: sha(readFileSync(local)) }
}

async function buildA1(): Promise<any[]> {
  const jobs: any[] = []
  for (const fx of frozen.fixtures) {
    const strip = await stripFor(fx)
    const guarded = P.appendCheckConstraints(effectivePrompt(fx), fx.shot.check_notes) + continuityLine(fx)
    const prompt = P.buildRealStripPrompt(guarded, {
      characterRefCount: fx.charRefs.length,
      hasStyleRef: !!frozen.styleAnchor,
    })
    for (let rep = 1; rep <= REPS; rep++) {
      jobs.push({
        arm: 'A1',
        key: `A1__${fx.shot_id}__r${rep}`,
        shot_id: fx.shot_id,
        klass: fx.klass,
        rep,
        model: 'openai/gpt-image-2/edit', // falImageSubmit 의 resolveImageModel 결과(ref 있음 → edit)
        prompt,
        guardedPrompt: guarded,
        stripLocal: strip.local,
        stripSha: strip.sha,
        // 레퍼런스 순서 계약: [스트립, ...캐릭터/월드, 스타일 앵커]
        refOrder: ['<rough_strip>', ...fx.charNames, ...(frozen.styleAnchor ? [`style:${frozen.styleAnchor.key}`] : [])],
        charRefs: fx.charRefs,
        anchorRef: frozen.styleAnchor?.imageUrl ?? null,
        image_size_requested: '1024x1536',
      })
    }
  }
  return jobs
}

// ── A2: 영상 잡 ──
async function buildA2(): Promise<any[]> {
  // 라우트와 동일한 dynamic_spec 해석 (generate-video/route.ts:461-479)
  const designById = await P.loadShotDesignByMainId(frozen.project.id)
  const { count } = await P.supabaseAdmin
    .from('shots')
    .select('shot_id', { count: 'exact', head: true })
    .eq('project_id', frozen.project.id)
    .not('design_ref', 'is', null)

  const jobs: any[] = []
  for (const fx of frozen.fixtures) {
    let dynamicSpec = (fx.shot.dynamic_spec as ShotDynamicSpec | null) ?? null
    if (!dynamicSpec) {
      dynamicSpec =
        P.resolveShotDesign(designById, { shotId: fx.shot_id, designRef: fx.shot.design_ref ?? null }, (count ?? 0) > 0)
          ?.dynamicSpec ?? null
    }
    const dur = (fx.shot.duration_seconds as number) ?? 5
    const cameraPreset = {
      brand: fx.shot.camera_brand,
      focalLength: fx.shot.focal_length,
      aperture: fx.shot.aperture,
      whiteBalance: fx.shot.white_balance,
    }
    for (const arm of A2_ARMS) {
      // 유일한 조작: END 참조의 유무. startEndReference 는 라우트가 refs 길이에서 유도하는 값이라
      //   (route.ts:494) 팔에 따라 자동으로 따라온다 — 프롬프트를 손으로 바꾸지 않는다.
      const refs = arm === 'start_end' ? [fx.realFrames.start, fx.realFrames.end] : [fx.realFrames.start]
      const { fullPrompt, prompt_parts } = P.buildVideoPrompt({
        prompt: effectivePrompt(fx),
        camera: fx.shot.camera_config ?? null,
        movementPreset: fx.shot.movement_preset ?? null,
        cameraPreset: cameraPreset as any,
        generationMethod: 'I2V',
        modelKey: MODEL_KEY,
        durationSeconds: dur,
        startEndReference: refs.length >= 2,
        dynamicSpec,
      })
      // 라우트 buildFalReferenceToVideoRequest(route.ts:145-183) 와 동일 구성
      const input: Record<string, unknown> = {
        prompt: fullPrompt,
        negative_prompt: 'blurry, low quality, distorted, deformed',
        [SPEC.refParam]: refs,
      }
      input.duration = SPEC.duration.mode === 'fixed' ? SPEC.duration.value : P.clampDuration(SPEC, dur)
      if (SPEC.audioParam) input[SPEC.audioParam] = SPEC.audioDefault
      if (SPEC.resolutions.length > 0) input.resolution = SPEC.defaultResolution
      if (MODEL_KEY !== 'kling-o3') input.aspect_ratio = ASPECT
      for (let rep = 1; rep <= REPS; rep++) {
        jobs.push({
          arm: `A2:${arm}`,
          a2arm: arm,
          key: `A2__${fx.shot_id}__${arm}__r${rep}`,
          shot_id: fx.shot_id,
          klass: fx.klass,
          rep,
          endpoint: SPEC.endpoint,
          durationSeconds: dur,
          refs,
          startEndReference: refs.length >= 2,
          motionContract: prompt_parts.motionContract ?? null,
          startEndClause: prompt_parts.startEnd ?? null,
          input,
        })
      }
    }
  }
  return jobs
}

// ── 비용 ──
function costTable(a1: any[], a2: any[]) {
  const a2Secs = a2.reduce((s, j) => s + (j.input.duration as number), 0)
  const a2Usd = a2Secs * SPEC.pricePerSecNoAudio
  // gpt-image-2/edit 단가는 코드/설정 어디에도 없다 → 추정치임을 명시.
  const A1_UNIT_EST = 0.02
  return {
    A1: {
      calls: a1.length,
      model: 'openai/gpt-image-2/edit',
      unitUsd: A1_UNIT_EST,
      estUsd: +(a1.length * A1_UNIT_EST).toFixed(2),
      basis: '추정 — 저장소·설정에 이미지 단가 상수 없음(video-models.ts 의 pricePerSecNoAudio 만 존재). 실비는 fal 대시보드로 사후 확인 필요.',
    },
    A2: {
      clips: a2.length,
      model: SPEC.endpoint,
      seconds: a2Secs,
      unitUsdPerSec: SPEC.pricePerSecNoAudio,
      estUsd: +a2Usd.toFixed(2),
      basis: `src/lib/video-models.ts:62 pricePerSecNoAudio=${SPEC.pricePerSecNoAudio} (UI 힌트값 — 오디오 off 기준)`,
    },
    totalEstUsd: +(a1.length * A1_UNIT_EST + a2Usd).toFixed(2),
  }
}

// ── 새니티 ──
function sanity(a1: any[], a2: any[]): string[] {
  const errs: string[] = []
  if (a1.length !== frozen.fixtures.length * REPS) errs.push(`A1 잡 수 ${a1.length} != ${frozen.fixtures.length * REPS}`)
  if (a2.length !== frozen.fixtures.length * REPS * 2) errs.push(`A2 잡 수 ${a2.length} != ${frozen.fixtures.length * REPS * 2}`)
  for (const j of a1) {
    if (!j.prompt.includes('3-panel vertical storyboard strip')) errs.push(`${j.key}: 스트립 프롬프트 문안 없음`)
    const expected = 1 + j.charRefs.length + (j.anchorRef ? 1 : 0)
    if (j.refOrder.length !== expected) errs.push(`${j.key}: 참조 수 ${j.refOrder.length} != ${expected}`)
    if (j.charRefs.length > 0 && !j.prompt.includes('Replace every wooden mannequin')) errs.push(`${j.key}: 마네킹 치환 절 없음`)
    if (j.anchorRef && !j.prompt.includes('LAST reference image')) errs.push(`${j.key}: 스타일 앵커 절 없음`)
  }
  // A2: 팔 간 차이가 END 참조(+그에 유도된 절) 뿐인지 확인
  for (const fx of frozen.fixtures) {
    const so = a2.find((j) => j.shot_id === fx.shot_id && j.a2arm === 'start_only')
    const se = a2.find((j) => j.shot_id === fx.shot_id && j.a2arm === 'start_end')
    if (!so || !se) { errs.push(`${fx.shot_id}: 팔 누락`); continue }
    if ((so.refs as string[]).length !== 1) errs.push(`${fx.shot_id}: start_only 참조가 1장이 아님`)
    if ((se.refs as string[]).length !== 2) errs.push(`${fx.shot_id}: start_end 참조가 2장이 아님`)
    if (so.refs[0] !== se.refs[0]) errs.push(`${fx.shot_id}: 두 팔의 START 참조가 다름`)
    if (se.refs[1] !== fx.realFrames.end) errs.push(`${fx.shot_id}: start_end 의 2번째가 END 프레임이 아님`)
    if (so.startEndReference !== false || se.startEndReference !== true) errs.push(`${fx.shot_id}: startEndReference 유도 실패`)
    const stripClause = (p: string) => p.replace(se.startEndClause ?? ' ', '').trim()
    if (stripClause(se.input.prompt) !== stripClause(so.input.prompt))
      errs.push(`${fx.shot_id}: START/END 절을 제거해도 프롬프트가 다름 — 팔 간 오염`)
    if (so.input.duration !== se.input.duration) errs.push(`${fx.shot_id}: duration 불일치`)
  }
  return errs
}

async function plan() {
  await loadProduct(); initModel()
  mkdirSync(RUN, { recursive: true })
  const a1 = await buildA1()
  const a2 = await buildA2()
  const errs = sanity(a1, a2)
  const manifest = {
    plannedAt: new Date().toISOString(),
    fixturesFrozenAt: frozen.collectedAt,
    project: frozen.project,
    styleAnchor: frozen.styleAnchor,
    design: {
      reps: REPS,
      a1: 'shots × 3 리페인트 (프로덕션 스트립 경로 그대로)',
      a2: 'shots × {START-only, START+END} × 3 (END 참조만 제거)',
      judgeModel: 'gemini-3-flash-preview (judge.mts, temperature 0)',
    },
    videoModel: { ...SPEC },
    cost: costTable(a1, a2),
    sanity: errs.length ? { ok: false, errors: errs } : { ok: true },
    jobs: { A1: a1, A2: a2 },
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
  console.log(JSON.stringify({ ...manifest, jobs: { A1: `${a1.length} jobs`, A2: `${a2.length} jobs` } }, null, 2))
}

async function submit(which: 'a1' | 'a2', smoke: boolean) {
  await loadProduct(); initModel()
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  mkdirSync(ASSETS, { recursive: true })
  const jobs: any[] = which === 'a1' ? m.jobs.A1 : m.jobs.A2
  const targets = smoke ? jobs.slice(0, 1) : jobs
  for (const job of targets) {
    if (job.request_id) { console.log(`skip ${job.key} (이미 제출됨)`); continue }
    if (which === 'a1') {
      if (!job.stripUrl) {
        const buf = readFileSync(job.stripLocal)
        job.stripUrl = await fal.storage.upload(new Blob([buf], { type: 'image/png' }))
      }
      // 라우트와 동일: AnchorableSubmit 를 spread 로 넘긴다.
      //   image_size 는 FalImageOptions(fal.ts:85-94)에 없어 실제로는 버려지고
      //   buildFalImageInput 이 arToImageSize(undefined)='auto' 를 넣는다 — 프로덕션 실동작 그대로 재현.
      const opts: AnchorableSubmit = {
        prompt: job.prompt,
        image_size: job.image_size_requested,
        reference_image_urls: [job.stripUrl, ...job.charRefs, ...(job.anchorRef ? [job.anchorRef] : [])],
      }
      const { request_id, model, fal_request } = await P.falImageSubmit({ ...opts })
      job.request_id = request_id
      job.model_actual = model
      job.fal_request = fal_request
    } else {
      const { request_id } = await fal.queue.submit(job.endpoint, { input: job.input })
      job.request_id = request_id
    }
    job.submitted_at = new Date().toISOString()
    console.log(`submitted ${job.key} → ${job.request_id}`)
    writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
  }
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
  console.log(`\n${targets.filter((j) => j.request_id).length}/${targets.length} 제출됨`)
}

async function collect(which: 'a1' | 'a2') {
  await loadProduct(); initModel()
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  mkdirSync(ASSETS, { recursive: true })
  const jobs: any[] = (which === 'a1' ? m.jobs.A1 : m.jobs.A2).filter((j: any) => j.request_id)
  const ext = which === 'a1' ? 'png' : 'mp4'
  const endpointOf = (j: any) => (which === 'a1' ? j.model_actual : j.endpoint)
  let pending = jobs.filter((j) => !j.done)
  const deadline = Date.now() + 25 * 60_000
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(endpointOf(job), { requestId: job.request_id, logs: false })
        if (st.status !== 'COMPLETED') continue
        const { data } = await fal.queue.result(endpointOf(job), { requestId: job.request_id })
        const d = data as any
        const url = which === 'a1' ? (d?.images?.[0]?.url ?? d?.image?.url) : (d?.video?.url ?? d?.video_url)
        if (!url) throw new Error(`no url: ${JSON.stringify(d).slice(0, 200)}`)
        const dest = join(ASSETS, `${job.key}.${ext}`)
        const res = await fetch(url)
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
        job.done = true
        job.out_url = url
        job.local = dest
        console.log(`done ${job.key}`)
      } catch (e) {
        console.error(`poll ${job.key}: ${(e as Error).message}`)
      }
    }
    writeFileSync(MANIFEST, JSON.stringify(m, null, 2))
    pending = jobs.filter((j) => !j.done)
    if (pending.length) await new Promise((r) => setTimeout(r, 15_000))
  }
  console.log(`\ncollected ${jobs.length - pending.length}/${jobs.length}`)
  if (pending.length) process.exitCode = 1
}

const mode = process.argv[2]
const arg = process.argv[3]
const smoke = process.argv.includes('--smoke')
if (mode === 'plan') await plan()
else if (mode === 'submit') await submit(arg as 'a1' | 'a2', smoke)
else if (mode === 'collect') await collect(arg as 'a1' | 'a2')
else throw new Error('usage: run.mts plan | submit a1|a2 [--smoke] | collect a1|a2')
