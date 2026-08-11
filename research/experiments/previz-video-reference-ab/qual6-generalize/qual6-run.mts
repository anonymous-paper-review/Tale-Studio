// 정성수집 6차 — "참조 역할 계약"이 샷 종류를 넘어 재현되는가 (3 시나리오 × 2팔 = 6클립).
//   티켓: research/backlog/t2-contract-generalize.md
//   변인은 **계약 문단 유무 하나**. 한 시나리오 안에서 참조물·길이·해상도·기본 계약문은 전부 동일.
//     ⓧ = 기본 모션 계약문 + 순서형 안무 블록            (qual4 ⓑ 와 같은 형태)
//     ⓨ = ⓧ + 참조 역할 계약 문단(qual4 inputs/prompt_c.txt 말미 문단 **verbatim 추출**)
//   시나리오:
//     S1 다른 이야기  sh_05_35 (Sample1 9d6efa6d) — 러프 DIRECTION 실판독 "TRACK LEFT"(label_scan.json)
//                     × 설계 dynamic_spec camera_motion=tracking/left 로 교차 확인된 이동 계열 샷
//     S2 다른 움직임  sh_01_02 (6d66cacd) — dolly_in 5s, ti2v-camera-cap-recheck/provenance.json T1 동결
//     S3 다른 연출    sh_02_10 (Sample1) — STATIC HOLD 8s, previz-channel-ablation/run/manifest.json A2 동결
//   재현성 규칙 1(복붙 금지): 기본 계약문은 제품 buildVideoPrompt/compileMotionContract 가 만든다.
//     동결 좌표(dynamic_spec·장면문·duration)를 넣고 재컴파일한 뒤 **동결 프롬프트와 문자열 일치**를
//     coords.json#checks 에 기록한다(S2·S3 는 일치해야 정상 — 일치가 곧 좌표 검산).
//   블록아웃: 이 세 샷에는 없다 → 양 팔 다 START 이미지 1장만(팔 사이 동일). Blender 실행 없음.
// 예산 하드캡 $14 — submit 전에 (기발주 지출 + 예상)을 검사하고 초과 시 발주 거부. 팔당 재시도 1회.
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/qual6-generalize/qual6-run.mts coords
//       … qual6-run.mts prompts | submit | collect | frames | finalize
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS, clampDuration } from '@/lib/video-models'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const REF_AB = join(DIR, '..')
const QUAL4 = join(REF_AB, 'qual4-grammar')
const EXPS = join(REF_AB, '..')
const TI2V = join(EXPS, 'ti2v-camera-cap-recheck')
const ABLATION = join(EXPS, 'previz-channel-ablation', 'run')
const COORDS = join(DIR, 'inputs', 'coords.json')
const MANIFEST = join(DIR, 'manifest.json')

const spec = VIDEO_MODELS.seedance
// 단가 실측(1~4차와 동일 출처, fal 모델 페이지 2026-08-11): 720p $0.3024/s,
// video input 동반 시 $0.1814/s, 오디오 무료. 이번 6클립은 전부 이미지 참조만 → 0.3024.
const RATE_IMAGE_ONLY = 0.3024
const BUDGET_CAP_USD = 14.0
const MAX_RETRY_PER_ARM = 1

type ArmKey = 'x' | 'y'
const ARMS: { arm: ArmKey; label: string }[] = [
  { arm: 'x', label: '계약 없음 — 기본 모션 계약문 + 순서형 안무 블록' },
  { arm: 'y', label: '계약 있음 — ⓧ 동일 문장 + 참조 역할 계약 문단(qual4 prompt_c 말미 verbatim)' },
]

type ScenId = 'S1' | 'S2' | 'S3'
interface ScenDef {
  id: ScenId
  axis: string
  shot_id: string
  project_id: string
  duration: number
  /** 동결 좌표 출처(사람이 읽는 경로) */
  source: string
}
const SCENARIOS: ScenDef[] = [
  {
    id: 'S1',
    axis: '다른 이야기 — 이동 계열(러프 라벨 TRACKING FORWARD)',
    // 1차 선정 sh_05_35("TRACK LEFT")는 Seedance 2.0 이 START 그림을 content_policy_violation
    // ("likenesses of real people", loc=image_urls, partner_validation_failed)로 2회 다 반려.
    // 티켓이 동결한 선정 규칙("Sample1 이동 계열 샷 1개, label_scan 실판독")은 그대로 두고,
    // 같은 label_scan 안에서 (a) 실제 병진 이동 계약이 컴파일되고 (b) 시작 그림에 식별 가능한
    // 얼굴이 거의 없는(두 인물 뒷모습) 샷으로 재선정했다.
    //   후보 검토: sh_04_27(tracking/right)·sh_09_69(tracking/up)은 정면 얼굴이 커서 같은 반려가 예상,
    //   sh_05_32(DRIFT UP)·sh_08_59 은 인물이 없지만 magnitude=minimal 이라 제품 컴파일러가
    //   "micro-drift only — never travels" 로 낮춰 S3(정지)와 축이 겹친다.
    shot_id: 'sh_05_38',
    project_id: '9d6efa6d-3216-40b0-8a2c-184ab56f02ec',
    duration: 5,
    source:
      'previz-channel-ablation/run/label_scan.json(러프 DIRECTION 실판독 kind=both, labels=["TRACKING FORWARD (MEDIUM)", …]) + live DB shots/writer_runs(design_ref 조인)',
  },
  {
    id: 'S2',
    axis: '다른 움직임 — dolly_in(발견 인서트)',
    shot_id: 'sh_01_02',
    project_id: '6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a',
    duration: 5,
    source: 'ti2v-camera-cap-recheck/provenance.json#jobs[key=sh_01_02__T1]',
  },
  {
    id: 'S3',
    axis: '다른 연출 — STATIC HOLD(정지 유지)',
    shot_id: 'sh_02_10',
    project_id: '9d6efa6d-3216-40b0-8a2c-184ab56f02ec',
    duration: 8,
    source: 'previz-channel-ablation/run/manifest.json#jobs.A2[sh_02_10/start_only/r1]',
  },
]

interface Coord {
  id: ScenId
  axis: string
  shot_id: string
  project_id: string
  duration: number
  source: string
  scene_text: string
  dynamic_spec: ShotDynamicSpec | null
  start_ref_url: string
  start_local: string
  /** 동결 프롬프트 원문(있으면) — 재컴파일 검산용 */
  frozen_prompt: string | null
  checks?: Record<string, unknown>
}

// ── coords: 동결 좌표 회수 (DB 1회 + 기존 실험 manifest) → inputs/coords.json ──
async function coords() {
  // 이미 동결된 항목은 그대로 두고, 정의(SCENARIOS)의 shot_id 와 어긋난 항목만 다시 회수한다.
  //   (S1 은 1차 선정 샷이 프로바이더 content policy 로 반려돼 같은 규칙 안에서 재선정됐다)
  const prev: Coord[] = existsSync(COORDS) ? JSON.parse(readFileSync(COORDS, 'utf8')) : []
  const keep = new Map(prev.filter((c) => SCENARIOS.some((s) => s.id === c.id && s.shot_id === c.shot_id && s.duration === c.duration)).map((c) => [c.id, c]))
  if (keep.size === SCENARIOS.length) {
    console.log(`skip coords — 이미 동결됨: ${COORDS}`)
    return
  }
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false } },
  )

  /** 프로젝트의 writer_runs.state.shotDesign 을 design id 로 색인 (제품 조인 키와 동일) */
  async function designs(projectId: string): Promise<Map<string, any>> {
    const { data: runs } = await db
      .from('writer_runs')
      .select('status, shotDesign:state->shotDesign')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5)
    const rows = (runs ?? []) as Array<{ status: string; shotDesign: unknown }>
    const row =
      rows.find((r) => r.status === 'completed' && Array.isArray(r.shotDesign)) ??
      rows.find((r) => Array.isArray(r.shotDesign))
    const m = new Map<string, any>()
    for (const d of ((row?.shotDesign ?? []) as any[])) {
      const sid = d?.static_spec?.shot_id ?? d?.intent?.shot_id
      if (sid) m.set(String(sid), d)
    }
    return m
  }

  const out: Coord[] = []
  for (const s of SCENARIOS) {
    const cached = keep.get(s.id)
    if (cached) {
      out.push(cached)
      console.log(`coords ${s.id} — 기존 동결 유지 (${cached.shot_id})`)
      continue
    }
    const { data: shots } = await db
      .from('shots')
      .select('shot_id,action_description,prompt,duration_seconds,design_ref,dynamic_spec,storyboard_image')
      .eq('project_id', s.project_id)
      .eq('shot_id', s.shot_id)
    const shot = (shots ?? [])[0] as any
    if (!shot) throw new Error(`${s.id}: shots 행 회수 실패 (${s.shot_id})`)
    const byId = await designs(s.project_id)
    const design = shot.design_ref ? byId.get(String(shot.design_ref)) : null
    let dynamic: ShotDynamicSpec | null = shot.dynamic_spec ?? design?.dynamic_spec ?? null
    let sceneText: string = (shot.prompt || shot.action_description || '').trim()
    let startUrl: string | undefined = shot.storyboard_image?.frames?.start
    let frozen: string | null = null

    if (s.id === 'S2') {
      const prov = JSON.parse(readFileSync(join(TI2V, 'provenance.json'), 'utf8'))
      const job = prov.jobs.find((j: any) => j.key === 'sh_01_02__T1')
      if (!job) throw new Error('S2: ti2v provenance sh_01_02__T1 회수 실패')
      dynamic = job.dynamic_spec
      frozen = job.input.prompt
      startUrl = job.input.image_urls[0]
      // 동결 프롬프트에서 장면문만 분리 (계약문 뒤 '. ' 결합 — buildVideoPrompt 의 join 규칙)
      sceneText = String(frozen).slice(String(job.motion_contract).length + 2).trim()
    }
    if (s.id === 'S3') {
      const man = JSON.parse(readFileSync(join(ABLATION, 'manifest.json'), 'utf8'))
      const job = man.jobs.A2.find(
        (j: any) => j.shot_id === 'sh_02_10' && j.a2arm === 'start_only' && j.rep === 1,
      )
      if (!job) throw new Error('S3: ablation manifest A2 회수 실패')
      frozen = job.input.prompt
      startUrl = job.refs[0]
      sceneText = String(frozen).slice(String(job.motionContract).length + 2).trim()
    }
    if (!startUrl) throw new Error(`${s.id}: START 참조 URL 회수 실패`)
    if (!dynamic) throw new Error(`${s.id}: dynamic_spec 회수 실패`)

    const local = join(DIR, 'inputs', `${s.id}_start.jpg`)
    if (!existsSync(local)) {
      const r = await fetch(startUrl)
      const png = join(DIR, 'inputs', `.${s.id}_start.png`)
      writeFileSync(png, Buffer.from(await r.arrayBuffer()))
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', png, '-q:v', '3', local])
    }
    out.push({
      id: s.id,
      axis: s.axis,
      shot_id: s.shot_id,
      project_id: s.project_id,
      duration: s.duration,
      source: s.source,
      scene_text: sceneText,
      dynamic_spec: dynamic,
      start_ref_url: startUrl,
      start_local: `inputs/${s.id}_start.jpg`,
      frozen_prompt: frozen,
      checks: {
        shot_duration_seconds_db: shot.duration_seconds,
        duration_used: s.duration,
        duration_note:
          s.duration === shot.duration_seconds
            ? '샷 duration 그대로'
            : `예산 하드캡 $${BUDGET_CAP_USD} 안에 팔당 재시도 1회분을 남기려 ${shot.duration_seconds}s → ${s.duration}s 로 축소(계약문은 축소된 초로 재컴파일)`,
      },
    })
    console.log(`coords ${s.id} ✓ ${s.shot_id}  dur=${s.duration}s  start=${local}`)
  }
  mkdirSync(join(DIR, 'inputs'), { recursive: true })
  writeFileSync(COORDS, JSON.stringify(out, null, 2))
  console.log(`coords → ${COORDS}`)
}

function loadCoords(): Coord[] {
  if (!existsSync(COORDS)) throw new Error(`좌표 미동결: ${COORDS} — 먼저 coords 모드 실행`)
  return JSON.parse(readFileSync(COORDS, 'utf8'))
}

/** qual4 ⓒ 프롬프트 말미의 참조 역할 계약 문단을 **verbatim 추출**(재작성 금지) */
function referenceRolesParagraph(): string {
  const c = readFileSync(join(QUAL4, 'inputs', 'prompt_c.txt'), 'utf8')
  const para = c
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .find((p) => p.startsWith('Reference roles:'))
  if (!para) throw new Error('qual4 prompt_c.txt 에서 Reference roles 문단 추출 실패')
  return para
}

/** 기본 모션 계약문 + 장면문 — 제품 buildVideoPrompt 가 만든다(복붙 금지) */
function baseContract(c: Coord): string {
  return buildVideoPrompt({
    prompt: c.scene_text,
    generationMethod: 'I2V',
    modelKey: spec.key,
    durationSeconds: c.duration,
    startEndReference: false,
    dynamicSpec: c.dynamic_spec,
  }).fullPrompt
}

// ── prompts: 시나리오별 두 팔 프롬프트 전문 조립 (동결) ──
function prompts() {
  const cs = loadCoords()
  const roles = referenceRolesParagraph()
  for (const c of cs) {
    const head = baseContract(c)
    const block = readFileSync(join(DIR, 'inputs', `block_${c.id}.txt`), 'utf8').trim()
    writeFileSync(join(DIR, 'inputs', `prompt_${c.id}_x.txt`), `${head}\n\n${block}\n`)
    writeFileSync(join(DIR, 'inputs', `prompt_${c.id}_y.txt`), `${head}\n\n${block}\n\n${roles}\n`)
    // 좌표 검산: 동결 프롬프트가 있으면 재컴파일 결과와 문자열 비교
    if (c.frozen_prompt) {
      const same = c.frozen_prompt.startsWith(head)
      c.checks = {
        ...(c.checks ?? {}),
        recompiled_matches_frozen: same,
        frozen_tail_dropped: same ? c.frozen_prompt.slice(head.length).trim() : null,
        note: same
          ? '재컴파일 계약문이 동결 프롬프트의 머리와 문자열 일치 — 좌표 검산 통과'
          : '불일치 — duration 축소로 계약문이 재컴파일된 경우 정상(위 duration_note 참조)',
      }
    }
  }
  writeFileSync(COORDS, JSON.stringify(cs, null, 2))
  console.log('prompts → inputs/prompt_S{1,2,3}_{x,y}.txt  (계약 문단은 qual4 prompt_c 말미 verbatim)')
  for (const c of cs) console.log(`  ${c.id}: checks=${JSON.stringify(c.checks)}`)
}

function scenarioMeta(c: Coord) {
  return {
    id: c.id,
    axis: c.axis,
    shot_id: c.shot_id,
    project_id: c.project_id,
    duration: c.duration,
    source: c.source,
    refs: [c.start_ref_url],
    refs_note: '이 세 샷에는 3D 블록아웃이 없다 → 양 팔 다 START 이미지 1장(팔 사이 동일). Blender 실행 없음',
    start_local: c.start_local,
    dynamic_spec: c.dynamic_spec,
    checks: c.checks,
  }
}

interface Job {
  scenario: ScenId
  arm: ArmKey
  key: string
  attempt: number
  label: string
  shot_id: string
  request_id: string
  endpoint: string
  model_key: string
  resolution?: unknown
  duration_seconds: number
  est_cost_usd: number
  rate_per_sec_usd: number
  refs: string[]
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

function readManifest(): { jobs: Job[]; [k: string]: unknown } {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const cs = loadCoords()
  return {
    purpose:
      '참조 역할 계약 문단의 일반화 점검 — 3 시나리오(다른 이야기/다른 움직임/다른 연출) × ⓧ계약없음·ⓨ계약있음 × 1회. 관찰 전용, 판정·점수 없음',
    ticket: 'research/backlog/t2-contract-generalize.md',
    prior: 'research/experiments/previz-video-reference-ab/qual4-grammar (동일 문단이 질주 샷 1개에서 최우수)',
    model: spec.endpoint,
    model_note: 'Seedance 2.0 고정 — 2.5 전환은 별건이라 통제',
    variable: '프롬프트 말미 참조 역할 계약 문단 유무 하나. 시나리오 안에서 참조물·duration·해상도·기본 계약문·안무 블록 전부 동일',
    arms: ARMS,
    scenarios: cs.map((c) => scenarioMeta(c)),
    reference_roles_paragraph_source:
      'research/experiments/previz-video-reference-ab/qual4-grammar/inputs/prompt_c.txt 말미 문단 verbatim 추출',
    reference_roles_caveat:
      '문단은 @Video1(무빙/프레이밍)과 @Image1(첫 프레임·인물·세트)에 담당을 나눈다. 이번 6클립에는 블록아웃 영상이 없어 @Video1 의 지시 대상은 부재 — 살아있는 절은 @Image1 역할 선언과 "복사 금지"뿐이다. 티켓이 문단을 그대로 쓰라고 동결했으므로 재작성하지 않았다.',
    pricing_source:
      'fal.ai/models/bytedance/seedance-2.0/reference-to-video (2026-08-11 실측): 720p $0.3024/s, video input 동반 $0.1814/s, 오디오 무료. 이번엔 이미지 참조만이라 0.3024/s',
    budget_cap_usd: BUDGET_CAP_USD,
    max_retry_per_arm: MAX_RETRY_PER_ARM,
    jobs: [] as Job[],
  }
}

/** 생성 전 반려(content_policy_violation)는 출력 0초 — fal 단가가 "출력 영상 1초당"이라 청구 대상이 아니다 */
function rejectedBeforeGeneration(j: Job): boolean {
  return !!j.failed && /content_policy_violation/.test(j.error ?? '')
}
/** 청구 예상액 — 하드캡은 이 값으로 건다(출력이 나온/나올 시도만 계상) */
function spent(jobs: Job[]): number {
  return +jobs
    .filter((j) => !rejectedBeforeGeneration(j))
    .reduce((s, j) => s + (j.est_cost_usd ?? 0), 0)
    .toFixed(4)
}
/** 발주한 모든 시도(생성 전 반려 포함) — 대조용 보수 집계 */
function committed(jobs: Job[]): number {
  return +jobs.reduce((s, j) => s + (j.est_cost_usd ?? 0), 0).toFixed(4)
}

async function submitOne(
  prov: { jobs: Job[] },
  c: Coord,
  armDef: { arm: ArmKey; label: string },
  attempt: number,
): Promise<void> {
  const p = join(DIR, 'inputs', `prompt_${c.id}_${armDef.arm}.txt`)
  if (!existsSync(p)) throw new Error(`프롬프트 미조립: ${p} — 먼저 prompts 모드 실행`)
  const prompt = readFileSync(p, 'utf8').trim()
  // 팔 간 통제 재확인: 기본 계약문 + 안무 블록이 동일해야 한다
  const head = `${baseContract(c)}\n\n${readFileSync(join(DIR, 'inputs', `block_${c.id}.txt`), 'utf8').trim()}`
  if (!prompt.startsWith(head)) throw new Error(`${c.id}/${armDef.arm}: 기본 계약문·안무 블록 불일치`)
  const duration = clampDuration(spec, c.duration)
  const est = +(RATE_IMAGE_ONLY * duration).toFixed(4)
  const already = spent(prov.jobs)
  if (already + est > BUDGET_CAP_USD)
    throw new Error(
      `예산 하드캡 초과(${c.id}/${armDef.arm} attempt ${attempt}): spent $${already} + est $${est} > $${BUDGET_CAP_USD}`,
    )
  const input: Record<string, unknown> = {
    prompt,
    duration,
    ...(spec.resolutions.length > 0 ? { resolution: spec.defaultResolution } : {}),
    ...(spec.audioParam ? { [spec.audioParam]: spec.audioDefault } : {}),
    [spec.refParam]: [c.start_ref_url],
  }
  const { request_id } = await fal.queue.submit(spec.endpoint, { input })
  prov.jobs.push({
    scenario: c.id,
    arm: armDef.arm,
    key: `${c.id}_${armDef.arm}`,
    attempt,
    label: armDef.label,
    shot_id: c.shot_id,
    request_id,
    endpoint: spec.endpoint,
    model_key: spec.key,
    resolution: input.resolution,
    duration_seconds: duration,
    est_cost_usd: est,
    rate_per_sec_usd: RATE_IMAGE_ONLY,
    refs: [c.start_ref_url],
    input,
    submitted_at: new Date().toISOString(),
  })
  console.log(`submitted ${c.id}/${armDef.arm} (attempt ${attempt}) → ${request_id}  [est $${est}]`)
}

async function submit() {
  const prov = readManifest()
  const cs = loadCoords()
  // 선택적 필터: `submit S1 x` — 반려 위험이 있는 시나리오는 한 팔만 먼저 넣어 검증 통과를 확인한다
  const onlyScen = process.argv[3]
  const onlyArm = process.argv[4]
  for (const c of cs) {
    if (onlyScen && c.id !== onlyScen) continue
    for (const armDef of ARMS) {
      if (onlyArm && armDef.arm !== onlyArm) continue
      if (prov.jobs.some((j) => j.scenario === c.id && j.arm === armDef.arm)) {
        console.log(`skip ${c.id}/${armDef.arm} — 이미 발주됨`)
        continue
      }
      await submitOne(prov, c, armDef, 1)
      writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    }
  }
  prov.scenarios = cs.map((c) => scenarioMeta(c))
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`manifest → ${MANIFEST}  (billed est $${spent(prov.jobs)} / committed $${committed(prov.jobs)})`)
}

async function collect() {
  const prov = readManifest()
  const cs = loadCoords()
  const deadline = Date.now() + 45 * 60_000
  let pending = prov.jobs.filter((j) => !j.done && !j.failed)
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (st.status !== 'COMPLETED') {
          console.log(`... ${job.key}#${job.attempt}: ${st.status}`)
          continue
        }
        let data: unknown
        try {
          ;({ data } = await fal.queue.result(job.endpoint, { requestId: job.request_id }))
        } catch (e) {
          // fal 큐는 처리 중 실패도 COMPLETED 로 두고 result 422 가 실패 상세를 돌려준다
          if ((e as { status?: number })?.status === 422) {
            job.failed = true
            // message 가 빈 문자열로 오는 경우가 있어 body(detail)까지 남긴다 — 반려 사유 분류에 필요
            job.error = `${(e as Error).message ?? ''} ${JSON.stringify((e as { body?: unknown }).body ?? '')}`.trim()
            console.error(`FAILED ${job.key}#${job.attempt}: ${job.error}`)
            continue
          }
          throw e
        }
        const url =
          (data as { video?: { url?: string } })?.video?.url ??
          (data as { video_url?: string })?.video_url
        if (!url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`)
        const dest = join(DIR, `out_${job.key}.mp4`)
        const res = await fetch(url)
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
        job.done = true
        job.video_url = url
        job.local = dest
        console.log(`done ${job.key}#${job.attempt} → ${dest}`)
      } catch (e) {
        console.error(`poll ${job.key}#${job.attempt}: ${(e as Error).message}`)
      }
    }
    // 실패 팔 자동 재시도 (팔당 최대 MAX_RETRY_PER_ARM 회, 예산 캡 재검사)
    for (const c of cs) {
      for (const armDef of ARMS) {
        const tries = prov.jobs.filter((j) => j.scenario === c.id && j.arm === armDef.arm)
        const live = tries.some((j) => j.done || (!j.done && !j.failed))
        if (live || tries.length === 0 || tries.length > MAX_RETRY_PER_ARM) continue
        try {
          await submitOne(prov, c, armDef, tries.length + 1)
        } catch (e) {
          console.error(`retry ${c.id}/${armDef.arm} 거부: ${(e as Error).message}`)
        }
      }
    }
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j) => !j.done && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  const keys = cs.flatMap((c) => ARMS.map((a) => `${c.id}_${a.arm}`))
  const doneKeys = keys.filter((k) => prov.jobs.some((j) => j.key === k && j.done))
  console.log(`\ncollected ${doneKeys.length}/${keys.length}  (billed est $${spent(prov.jobs)} / committed $${committed(prov.jobs)})`)
  if (doneKeys.length < keys.length) process.exitCode = 1
}

/** 480p 프리뷰(-crf 28 무음) + 1fps 타일 + 첫/끝 프레임 — 6클립 전부 동일 파라미터 */
function frames() {
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args])
  mkdirSync(join(DIR, 'frames'), { recursive: true })
  const cs = loadCoords()
  for (const c of cs) {
    for (const { arm } of ARMS) {
      const key = `${c.id}_${arm}`
      const src = join(DIR, `out_${key}.mp4`)
      if (!existsSync(src)) {
        console.log(`skip frames ${key} — 클립 없음`)
        continue
      }
      const f = (n: string) => join(DIR, 'frames', `${key}_${n}`)
      // 1fps 타일 — 5s 는 5칸, 8s 는 8칸이라 4x2 로 통일(빈 칸은 검정)
      ff(['-i', src, '-vf', 'fps=1,scale=480:-1,tile=4x2', '-frames:v', '1', '-q:v', '3', f('tile.jpg')])
      ff(['-ss', '0', '-i', src, '-frames:v', '1', '-q:v', '2', f('f0.jpg')])
      ff(['-sseof', '-0.1', '-i', src, '-update', '1', '-q:v', '2', f('last.jpg')])
      ff([
        '-i', src, '-vf', 'scale=-2:480', '-an',
        '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-movflags', '+faststart',
        join(DIR, `out_${key}_preview.mp4`),
      ])
      console.log(`frames ${key} ✓`)
    }
    // 시나리오별 팔 비교 시트: 첫 프레임 (시작 그림 | ⓧ | ⓨ)
    const trio = [join(DIR, 'inputs', `${c.id}_start.jpg`), join(DIR, 'frames', `${c.id}_x_f0.jpg`), join(DIR, 'frames', `${c.id}_y_f0.jpg`)]
    if (trio.every((p) => existsSync(p))) {
      // 시작 그림(스트립 크롭)과 영상 프레임은 종횡비가 달라 공통 캔버스(480×270)에 레터박스로 맞춘다
      const fit = 'scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:black'
      ff([
        ...trio.flatMap((p) => ['-i', p]),
        '-filter_complex', `[0:v]${fit}[a];[1:v]${fit}[b];[2:v]${fit}[c];[a][b][c]hstack=inputs=3`,
        '-frames:v', '1', '-q:v', '3', join(DIR, 'frames', `${c.id}_firstframe_compare.jpg`),
      ])
    }
  }
  console.log('frames/ 파라미터: 1fps 4x2 타일(480px) / f0 / last(-0.1s) / 시나리오별 첫프레임 3연 비교시트. 프리뷰는 480p crf28 무음')
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
      preview: `out_${job.key}_preview.mp4`,
      frames_tile: `frames/${job.key}_tile.jpg`,
      first_frame: `frames/${job.key}_f0.jpg`,
      last_frame: `frames/${job.key}_last.jpg`,
    }
    job.confirmed_cost_usd = job.est_cost_usd
  }
  const blocked = ((prov.blocked_attempts as { attempts?: Job[] } | undefined)?.attempts ?? [])
  prov.total_cost_usd = spent(prov.jobs)
  prov.total_committed_usd = +(committed(prov.jobs) + committed(blocked)).toFixed(4)
  prov.cost_note =
    '단가는 fal 모델 페이지 2026-08-11 실측(720p 이미지 참조만 $0.3024/s). fal 에 요청별 청구 조회 API 가 없어 비용 = 단가 × 발주 duration 으로 확정. ' +
    'total_cost_usd = 청구 예상액(생성이 실제로 돈 시도만). total_committed_usd = 발주한 모든 시도(blocked_attempts 포함). ' +
    '둘의 차액은 Seedance 가 생성 전 검증에서 반려한 시도(content_policy_violation, 출력 0초)다 — fal 단가가 출력 영상 1초당이라 청구되지 않을 것으로 본다. 실제 청구는 fal 대시보드로 사후 확인 필요.'
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized → ${MANIFEST}  total $${prov.total_cost_usd}`)
}

const mode = process.argv[2]
if (mode === 'coords') await coords()
else if (mode === 'prompts') prompts()
else if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'frames') frames()
else if (mode === 'finalize') finalize()
else throw new Error('usage: qual6-run.mts coords|prompts|submit|collect|frames|finalize')
