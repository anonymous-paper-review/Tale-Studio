// 카메라 계약 완화 A/B 프로브 — HYPOTHESIS.md 의 측정 절차.
//   재현성 3규칙: 제품 runDecoupage / runShotDesign / resolveModels / buildSystemInstruction 을
//   그대로 import(백엔드 로직 복붙 없음), 입력은 INTEGRATED.json fixture 로 고정, 좌표는 results.json.
//
// 팔 전환은 env(WRITER_CAMERA_CONTRACT)로 하되 **팔마다 별도 자식 프로세스**를 띄운다 —
//   모듈 로드 시점 캡처/모듈 캐시가 팔을 섞을 여지를 원천 차단하기 위함. 각 자식은 실제로 쓴
//   systemInstruction 의 sha256 을 기록해 팔이 먹었다는 증거를 남긴다.
//
// 실행:
//   pnpm dlx tsx research/experiments/camera-contract-relax/probe.mts             # 전체
//   pnpm dlx tsx research/experiments/camera-contract-relax/probe.mts --mode aggregate  # 재집계만
import { config } from 'dotenv'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'

config({ path: '.env.local' })

const FIXTURE = path.resolve('logs/064631aa-f6b2-4f7c-800b-66b0517a2769/INTEGRATED.json')
const OUTDIR = path.resolve('research/experiments/camera-contract-relax')
const RAWDIR = path.join(OUTDIR, 'raw')
const SELF = path.resolve('research/experiments/camera-contract-relax/probe.mts')
const REPS = [1, 2, 3]
const ARMS = ['control', 'relaxed'] as const
type Arm = (typeof ARMS)[number]
const SCENE_CONCURRENCY = 4

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(n)
  return i >= 0 ? process.argv[i + 1] : d
}
const MODE = arg('--mode', 'all') as string
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const readFixture = () => JSON.parse(readFileSync(FIXTURE, 'utf8'))
const rawPath = (f: string) => path.join(RAWDIR, f)
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const pct = (x: number) => Number((x * 100).toFixed(1))
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

// ─────────────────────────────────────────────────────────────────────────────
// 자식: decoupage 1패스 (팔 × 회차)
// ─────────────────────────────────────────────────────────────────────────────
async function childDecoupage(armArg: string, rep: number) {
  const arm = armArg as Arm
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const fx = readFixture()
  const { runDecoupage, buildSystemInstruction } = await import(
    '../../../src/lib/writer/pipeline/stages/decoupage'
  )
  const { resolveModels } = await import('../../../src/lib/writer/pipeline')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')
  const { resetRawSeq, getPendingRawCalls, flushRawCalls, getUsageTotals } = await import(
    '../../../src/lib/writer/llm/raw_collector'
  )

  const si = buildSystemInstruction()
  const camStart = si.indexOf('== 카메라 규율 ==')
  const camEnd = si.indexOf('== 시간 제약')
  const cameraBlock = si.slice(camStart, camEnd).trim()

  const models = resolveModels(fx.input)
  const logger = new PipelineLogger(`probe-camrelax-${arm}-r${rep}`)
  await logger.init()
  resetRawSeq()
  const usage0 = getUsageTotals()

  const t0 = Date.now()
  let error: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = null
  try {
    result = await runDecoupage(
      fx.genre,
      fx.characters,
      fx.scenes,
      fx.worldVisual,
      fx.sceneCinematography,
      logger,
      models.V,
      { concurrency: SCENE_CONCURRENCY },
    )
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const wallMs = Date.now() - t0

  const raw = getPendingRawCalls()
  flushRawCalls()
  const usage1 = getUsageTotals()
  // 실제 호출에 실린 systemInstruction 의 지문 — 팔이 먹었다는 1차 증거(계산값이 아니라 관측값).
  const siHashesObserved = Array.from(new Set(raw.map((c) => (c.systemInstruction ? sha(c.systemInstruction) : 'none'))))

  const out = {
    arm,
    rep,
    env_WRITER_CAMERA_CONTRACT: process.env.WRITER_CAMERA_CONTRACT ?? null,
    system_instruction_sha256: sha(si),
    system_instruction_len: si.length,
    camera_block: cameraBlock,
    camera_block_sha256: sha(cameraBlock),
    observed_call_system_instruction_sha256: siHashesObserved,
    model_axis_V: models.V,
    scene_concurrency: SCENE_CONCURRENCY,
    wall_ms: wallMs,
    error,
    done: result?.done ?? null,
    llm_calls: raw.length,
    llm_call_errors: raw.filter((c) => c.error).length,
    usage_delta: {
      calls: usage1.calls - usage0.calls,
      inputTokens: usage1.inputTokens - usage0.inputTokens,
      outputTokens: usage1.outputTokens - usage0.outputTokens,
      rateLimitHits: usage1.rateLimitHits - usage0.rateLimitHits,
    },
    plan: result?.plan ?? null,
  }
  writeFileSync(rawPath(`decoupage_${arm}_r${rep}.json`), JSON.stringify(out, null, 2))
  const shots = out.plan?.scenes?.flatMap((s: { shots: unknown[] }) => s.shots) ?? []
  const mm = shots.filter((s: { camera_intent?: string }) => s.camera_intent === 'motivated_move').length
  console.log(
    `[decoupage ${arm} r${rep}] wall ${(wallMs / 1000).toFixed(1)}s · shots ${shots.length} · motivated_move ${mm} (${shots.length ? pct(mm / shots.length) : 0}%) · siHash ${sha(si).slice(0, 12)}` +
      (error ? ` · ERROR ${error}` : ''),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 자식: v4 전파 (팔당 1회 — A 의 rep1 산출물 입력)
// ─────────────────────────────────────────────────────────────────────────────
async function childShotDesign(armArg: string) {
  const arm = armArg as Arm
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const fx = readFixture()
  const dec = readJson(rawPath(`decoupage_${arm}_r1.json`))
  if (!dec.plan) throw new Error(`decoupage plan 없음 (${arm} r1)`)

  const { runShotDesign } = await import('../../../src/lib/writer/pipeline/stages/v4_shots')
  const { resolveModels } = await import('../../../src/lib/writer/pipeline')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')
  const { resetRawSeq, getPendingRawCalls, flushRawCalls, getUsageTotals } = await import(
    '../../../src/lib/writer/llm/raw_collector'
  )

  const models = resolveModels(fx.input)
  const logger = new PipelineLogger(`probe-camrelax-v4-${arm}`)
  await logger.init()
  resetRawSeq()
  const usage0 = getUsageTotals()

  const t0 = Date.now()
  let error: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = null
  try {
    result = await runShotDesign(
      fx.genre,
      fx.characters,
      fx.scenes,
      fx.visualIdentity,
      fx.worldVisual,
      fx.characterVisual,
      fx.sceneCinematography,
      dec.plan,
      '',
      logger,
      models.V,
      { concurrency: SCENE_CONCURRENCY },
    )
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const wallMs = Date.now() - t0
  const raw = getPendingRawCalls()
  flushRawCalls()
  const usage1 = getUsageTotals()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shots: any[] = result?.shots ?? []
  const out = {
    arm,
    source: `decoupage_${arm}_r1.json`,
    env_WRITER_CAMERA_CONTRACT: process.env.WRITER_CAMERA_CONTRACT ?? null,
    model_axis_V: models.V,
    wall_ms: wallMs,
    error,
    done: result?.done ?? null,
    llm_calls: raw.length,
    llm_call_errors: raw.filter((c) => c.error).length,
    usage_delta: {
      calls: usage1.calls - usage0.calls,
      inputTokens: usage1.inputTokens - usage0.inputTokens,
      outputTokens: usage1.outputTokens - usage0.outputTokens,
      rateLimitHits: usage1.rateLimitHits - usage0.rateLimitHits,
    },
    shot_count: shots.length,
    camera_motion_raw: shots.map((s) => ({
      shot_id: s.shot_id,
      scene_id: s.scene_id,
      camera_motion: s.dynamic_spec?.camera_motion ?? null,
    })),
  }
  writeFileSync(rawPath(`shotdesign_${arm}.json`), JSON.stringify(out, null, 2))
  writeFileSync(rawPath(`shotdesign_${arm}_full.json`), JSON.stringify(shots, null, 2))
  const dyn = out.camera_motion_raw.filter((s) => s.camera_motion && s.camera_motion.type !== 'static').length
  console.log(
    `[v4 ${arm}] wall ${(wallMs / 1000).toFixed(1)}s · shots ${shots.length} · non-static ${dyn} (${shots.length ? pct(dyn / shots.length) : 0}%)` +
      (error ? ` · ERROR ${error}` : ''),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 자식: 눈가림 비트 라벨링 (양 팔 공유 — 비트 텍스트만 노출)
// ─────────────────────────────────────────────────────────────────────────────
const LABEL_SYSTEM = `당신은 영상 연출 분석가다. 아래는 어떤 이야기의 "내러티브 비트" 목록이다 — 각 비트는 한 문장으로 쓰인 사건이다.
각 비트에 대해 **이 사건을 화면에 담으려면 카메라가 움직여야 하는가**를 판정하라.

판정 기준:
- "모션 요구"(needs_motion=true): 피사체가 공간을 가로지르거나(달리기·추격·퇴장·진입·낙하·비산), 사건이 한 프레임에 안 담겨 카메라가 따라가거나 드러내야 하거나(리빌·발견·공간 확장), 물리적 규모/힘이 밀려오는 사건.
- "정적"(needs_motion=false): 사건이 프레임 안에서 완결되는 것 — 표정·시선·대사·대치·응시·소품 클로즈업·미세한 반응.

주의: 감정이 강한지 여부가 아니라 **공간적 이동/전개가 있는지**로 판정한다. 판단이 애매하면 false 로 한다.
각 비트를 독립적으로 판정하라. 출력은 입력에 준 모든 인덱스를 빠짐없이 포함해야 한다.

[출력 형식 - JSON]
{"labels":[{"i":<입력 인덱스>,"needs_motion":true|false,"reason":"10자 내외 근거"}]}`

async function childLabel() {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 32 }))

  const fx = readFixture()
  const { generateJson } = await import('../../../src/lib/writer/llm/dispatch')
  const { resolveModels } = await import('../../../src/lib/writer/pipeline')
  const models = resolveModels(fx.input)

  // 비트 평탄화 — 라벨러에는 텍스트와 인덱스만 준다(씬 id·샷·팔 정보 일절 미제공).
  const beats: { gi: number; scene_id: string; li: number; text: string }[] = []
  for (const sc of fx.scenes.scenes) {
    sc.scene_actions.forEach((t: string, li: number) => {
      beats.push({ gi: beats.length, scene_id: sc.scene_id, li, text: t })
    })
  }

  const BATCH = 40
  const prompts: string[] = []
  const labels = new Map<number, { needs_motion: boolean; reason: string }>()
  for (let i = 0; i < beats.length; i += BATCH) {
    const chunk = beats.slice(i, i + BATCH)
    const userPrompt = `[비트 목록]\n${chunk.map((b) => `[${b.gi}] ${b.text}`).join('\n')}\n\n위 ${chunk.length}개 비트 전부를 판정해 JSON 으로 출력하라.`
    prompts.push(userPrompt)
    const res = await generateJson<{ labels?: { i: number; needs_motion: boolean; reason?: string }[] }>(
      userPrompt,
      models.V,
      { systemInstruction: LABEL_SYSTEM, temperature: 0 },
    )
    for (const l of res.labels ?? []) {
      labels.set(l.i, { needs_motion: Boolean(l.needs_motion), reason: l.reason ?? '' })
    }
    console.log(`[label] batch ${i}~${i + chunk.length - 1} → ${res.labels?.length ?? 0} labels (누적 ${labels.size}/${beats.length})`)
  }

  const missing = beats.filter((b) => !labels.has(b.gi)).map((b) => b.gi)
  const out = {
    judge: { ...models.V, temperature: 0 },
    system_prompt: LABEL_SYSTEM,
    user_prompts: prompts,
    batch_size: BATCH,
    beat_count: beats.length,
    missing_indices: missing,
    beats: beats.map((b) => ({
      ...b,
      needs_motion: labels.get(b.gi)?.needs_motion ?? null,
      reason: labels.get(b.gi)?.reason ?? null,
    })),
  }
  writeFileSync(rawPath('beat_labels.json'), JSON.stringify(out, null, 2))
  const motion = out.beats.filter((b) => b.needs_motion === true).length
  console.log(`[label] 완료 — 모션요구 ${motion}/${beats.length} (${pct(motion / beats.length)}%) · 누락 ${missing.length}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 집계
// ─────────────────────────────────────────────────────────────────────────────
interface ShotLite {
  shot_id: string
  scene_id: string
  operation: string
  source_beats: number[]
  camera_intent?: string
  camera_move_motivation?: string
  intended_duration_seconds?: number
}

function summarizePass(dec: {
  arm: string
  rep: number
  plan: { scenes: { scene_id: string; shots: ShotLite[] }[] } | null
}, labels: { scene_id: string; li: number; needs_motion: boolean | null }[]) {
  const shots: ShotLite[] = dec.plan?.scenes.flatMap((s) => s.shots) ?? []
  const mm = shots.filter((s) => s.camera_intent === 'motivated_move')
  const added = shots.filter((s) => (s.source_beats?.length ?? 0) === 0)
  const addedMm = added.filter((s) => s.camera_intent === 'motivated_move')

  // 비트 단위 적중/오발: 비트를 덮는 샷(source_beats 에 그 인덱스 포함) 중 하나라도 motivated_move 면 hit.
  const bySceneShots = new Map<string, ShotLite[]>()
  for (const s of shots) {
    const arr = bySceneShots.get(s.scene_id) ?? []
    arr.push(s)
    bySceneShots.set(s.scene_id, arr)
  }
  let motionTotal = 0, motionHit = 0, motionUncovered = 0
  let staticTotal = 0, staticHit = 0, staticUncovered = 0
  const perBeat: { scene_id: string; li: number; needs_motion: boolean | null; covering_shots: number; any_motivated: boolean }[] = []
  for (const b of labels) {
    const covering = (bySceneShots.get(b.scene_id) ?? []).filter((s) => (s.source_beats ?? []).includes(b.li))
    const any = covering.some((s) => s.camera_intent === 'motivated_move')
    perBeat.push({ scene_id: b.scene_id, li: b.li, needs_motion: b.needs_motion, covering_shots: covering.length, any_motivated: any })
    if (b.needs_motion === true) {
      motionTotal += 1
      if (any) motionHit += 1
      if (covering.length === 0) motionUncovered += 1
    } else if (b.needs_motion === false) {
      staticTotal += 1
      if (any) staticHit += 1
      if (covering.length === 0) staticUncovered += 1
    }
  }

  const durs = shots.map((s) => Number(s.intended_duration_seconds ?? 0)).filter((x) => x > 0)
  return {
    arm: dec.arm,
    rep: dec.rep,
    shot_count: shots.length,
    motivated_move_count: mm.length,
    motivated_move_ratio_pct: shots.length ? pct(mm.length / shots.length) : 0,
    hit_rate_pct: motionTotal ? pct(motionHit / motionTotal) : 0,
    hit_n: `${motionHit}/${motionTotal}`,
    false_alarm_rate_pct: staticTotal ? pct(staticHit / staticTotal) : 0,
    false_alarm_n: `${staticHit}/${staticTotal}`,
    uncovered_motion_beats: motionUncovered,
    uncovered_static_beats: staticUncovered,
    added_shots: added.length,
    added_motivated_move: addedMm.length,
    added_motivated_move_ratio_pct: added.length ? pct(addedMm.length / added.length) : 0,
    avg_intended_duration_s: durs.length ? Number(mean(durs).toFixed(2)) : 0,
    total_intended_duration_s: Number(durs.reduce((a, b) => a + b, 0).toFixed(1)),
    operations: {
      derived: shots.filter((s) => s.operation === 'derived').length,
      added: shots.filter((s) => s.operation === 'added').length,
      merged: shots.filter((s) => s.operation === 'merged').length,
      split: shots.filter((s) => s.operation === 'split').length,
    },
    per_beat: perBeat,
  }
}

function summarizeV4(v4: { arm: string; camera_motion_raw: { camera_motion: { type: string; magnitude: string; speed?: string } | null }[] }) {
  const cms = v4.camera_motion_raw
  const byType: Record<string, number> = {}
  const byMag: Record<string, number> = {}
  for (const s of cms) {
    const t = s.camera_motion?.type ?? '(null)'
    byType[t] = (byType[t] ?? 0) + 1
    const m = s.camera_motion?.magnitude ?? '(null)'
    byMag[m] = (byMag[m] ?? 0) + 1
  }
  const dyn = cms.filter((s) => s.camera_motion && s.camera_motion.type !== 'static').length
  return {
    arm: v4.arm,
    shot_count: cms.length,
    dynamic_count: dyn,
    dynamic_ratio_pct: cms.length ? pct(dyn / cms.length) : 0,
    by_type: byType,
    by_magnitude: byMag,
  }
}

function aggregate() {
  const fx = readFixture()
  const labelsFile = readJson(rawPath('beat_labels.json'))
  const labels = labelsFile.beats as { scene_id: string; li: number; needs_motion: boolean | null }[]

  const passes: Record<string, ReturnType<typeof summarizePass>[]> = { control: [], relaxed: [] }
  const rawPasses: Record<string, unknown[]> = { control: [], relaxed: [] }
  for (const arm of ARMS) {
    for (const rep of REPS) {
      const p = rawPath(`decoupage_${arm}_r${rep}.json`)
      if (!existsSync(p)) continue
      const dec = readJson(p)
      passes[arm].push(summarizePass(dec, labels))
      rawPasses[arm].push({
        arm: dec.arm,
        rep: dec.rep,
        env_WRITER_CAMERA_CONTRACT: dec.env_WRITER_CAMERA_CONTRACT,
        system_instruction_sha256: dec.system_instruction_sha256,
        camera_block_sha256: dec.camera_block_sha256,
        camera_block: dec.camera_block,
        observed_call_system_instruction_sha256: dec.observed_call_system_instruction_sha256,
        model_axis_V: dec.model_axis_V,
        wall_ms: dec.wall_ms,
        error: dec.error,
        llm_calls: dec.llm_calls,
        llm_call_errors: dec.llm_call_errors,
        usage_delta: dec.usage_delta,
        // 원자료 — 이 패스가 만든 샷 배열 전문.
        shots: dec.plan?.scenes.flatMap((s: { shots: unknown[] }) => s.shots) ?? [],
      })
    }
  }

  const armMean = (arm: Arm, k: 'motivated_move_ratio_pct' | 'hit_rate_pct' | 'false_alarm_rate_pct' | 'shot_count' | 'avg_intended_duration_s' | 'added_shots' | 'added_motivated_move_ratio_pct') =>
    Number(mean(passes[arm].map((p) => p[k] as number)).toFixed(2))

  const v4: Record<string, ReturnType<typeof summarizeV4> | null> = { control: null, relaxed: null }
  for (const arm of ARMS) {
    const p = rawPath(`shotdesign_${arm}.json`)
    if (existsSync(p)) v4[arm] = summarizeV4(readJson(p))
  }

  // ── 기각 조건 대입 (사전 등록) ──
  const cMM = armMean('control', 'motivated_move_ratio_pct')
  const rMM = armMean('relaxed', 'motivated_move_ratio_pct')
  const ratio = cMM > 0 ? Number((rMM / cMM).toFixed(2)) : null
  const cond1_fired = cMM > 0 ? rMM < cMM * 1.5 : rMM === 0
  const cFA = armMean('control', 'false_alarm_rate_pct')
  const rFA = armMean('relaxed', 'false_alarm_rate_pct')
  const faDelta = Number((rFA - cFA).toFixed(2))
  const cond2_fired = faDelta > 15

  // ③ 전파: v4 역동 비율 증가폭 vs decoupage 증가폭. B 는 rep1 산출물이 입력이므로
  //    주 판정은 **rep1 매칭**(같은 재료의 전파 손실), 3회 평균 기준은 보조로 병기한다.
  const cMM_r1 = passes.control.find((p) => p.rep === 1)?.motivated_move_ratio_pct ?? null
  const rMM_r1 = passes.relaxed.find((p) => p.rep === 1)?.motivated_move_ratio_pct ?? null
  const decDelta_r1 = cMM_r1 !== null && rMM_r1 !== null ? Number((rMM_r1 - cMM_r1).toFixed(2)) : null
  const decDelta_mean = Number((rMM - cMM).toFixed(2))
  const v4Delta = v4.control && v4.relaxed ? Number((v4.relaxed.dynamic_ratio_pct - v4.control.dynamic_ratio_pct).toFixed(2)) : null
  const cond3_fired = v4Delta !== null && decDelta_r1 !== null ? v4Delta < decDelta_r1 / 2 : null
  const cond3_fired_meanbase = v4Delta !== null ? v4Delta < decDelta_mean / 2 : null

  const cHit = armMean('control', 'hit_rate_pct')
  const rHit = armMean('relaxed', 'hit_rate_pct')
  const hitDelta = Number((rHit - cHit).toFixed(2))
  const cond4_fired = cond1_fired === false && cond2_fired === false && cond3_fired === false && hitDelta > 0

  const usageSum = (files: string[]) => {
    let inTok = 0, outTok = 0, calls = 0, rl = 0
    for (const f of files) {
      if (!existsSync(rawPath(f))) continue
      const j = readJson(rawPath(f))
      inTok += j.usage_delta?.inputTokens ?? 0
      outTok += j.usage_delta?.outputTokens ?? 0
      calls += j.usage_delta?.calls ?? 0
      rl += j.usage_delta?.rateLimitHits ?? 0
    }
    return { calls, input_tokens: inTok, output_tokens: outTok, rate_limit_hits: rl }
  }

  const results = {
    experiment: 'camera-contract-relax',
    finished_at: new Date().toISOString(),
    coordinates: {
      fixture: path.relative(process.cwd(), FIXTURE),
      fixture_scenes: fx.scenes.scenes.length,
      fixture_beats: labels.length,
      model_axis_V: (rawPasses.control[0] as { model_axis_V?: unknown } | undefined)?.model_axis_V ?? null,
      decoupage_temperature: 0.7,
      scene_concurrency: SCENE_CONCURRENCY,
      arm_switch_method:
        '팔마다 별도 자식 프로세스(spawn) — 부모가 WRITER_CAMERA_CONTRACT 를 자식 env 로 주입. ' +
        '모듈 캐시 공유 없음. 각 패스가 실제 호출에 실린 systemInstruction 의 sha256 을 관측값으로 기록.',
      product_functions: ['runDecoupage', 'runShotDesign', 'buildSystemInstruction', 'resolveModels', 'PipelineLogger'],
      cost_note: '영상/이미지 생성 없음 — LLM(텍스트) only.',
    },
    beat_labeling: {
      judge: labelsFile.judge,
      system_prompt: labelsFile.system_prompt,
      user_prompts: labelsFile.user_prompts,
      batch_size: labelsFile.batch_size,
      beat_count: labelsFile.beat_count,
      missing_indices: labelsFile.missing_indices,
      motion_required: labels.filter((b) => b.needs_motion === true).length,
      static_required: labels.filter((b) => b.needs_motion === false).length,
      unlabeled: labels.filter((b) => b.needs_motion === null).length,
      beats: labelsFile.beats,
    },
    per_pass: passes,
    arm_means: {
      control: {
        motivated_move_ratio_pct: cMM,
        hit_rate_pct: cHit,
        false_alarm_rate_pct: cFA,
        shot_count: armMean('control', 'shot_count'),
        avg_intended_duration_s: armMean('control', 'avg_intended_duration_s'),
        added_shots: armMean('control', 'added_shots'),
        added_motivated_move_ratio_pct: armMean('control', 'added_motivated_move_ratio_pct'),
      },
      relaxed: {
        motivated_move_ratio_pct: rMM,
        hit_rate_pct: rHit,
        false_alarm_rate_pct: rFA,
        shot_count: armMean('relaxed', 'shot_count'),
        avg_intended_duration_s: armMean('relaxed', 'avg_intended_duration_s'),
        added_shots: armMean('relaxed', 'added_shots'),
        added_motivated_move_ratio_pct: armMean('relaxed', 'added_motivated_move_ratio_pct'),
      },
    },
    v4_propagation: v4,
    rejection_conditions: {
      '1_motivated_move_under_1.5x': {
        rule: '완화군 motivated_move 비율 < 대조군 × 1.5 → 발동("A1은 주 범인 아님")',
        control_pct: cMM,
        relaxed_pct: rMM,
        threshold_pct: Number((cMM * 1.5).toFixed(2)),
        ratio_x: ratio,
        fired: cond1_fired,
      },
      '2_false_alarm_over_15pp': {
        rule: '정적 비트 오발률 증가 > +15%p → 발동("무분별 완화")',
        control_pct: cFA,
        relaxed_pct: rFA,
        delta_pp: faDelta,
        fired: cond2_fired,
      },
      '3_v4_propagation_under_half': {
        rule: 'v4 최종 역동 비율 증가폭 < decoupage 증가폭의 1/2 → 발동("하류 5겹 잔존")',
        decoupage_delta_pp_rep1_primary: decDelta_r1,
        decoupage_delta_pp_3rep_mean_secondary: decDelta_mean,
        v4_delta_pp: v4Delta,
        half_of_decoupage_rep1: decDelta_r1 !== null ? Number((decDelta_r1 / 2).toFixed(2)) : null,
        fired: cond3_fired,
        fired_if_mean_base: cond3_fired_meanbase,
      },
      '4_adopt_recommendation': {
        rule: '①②③ 모두 비발동 + 적중률 상승 → "A1 단독 완화 채택 권고"',
        hit_rate_delta_pp: hitDelta,
        fired: cond4_fired,
      },
    },
    side_effects: {
      shot_count: { control: armMean('control', 'shot_count'), relaxed: armMean('relaxed', 'shot_count') },
      avg_intended_duration_s: {
        control: armMean('control', 'avg_intended_duration_s'),
        relaxed: armMean('relaxed', 'avg_intended_duration_s'),
      },
    },
    cost: {
      decoupage_passes: usageSum(ARMS.flatMap((a) => REPS.map((r) => `decoupage_${a}_r${r}.json`))),
      shotdesign_passes: usageSum(ARMS.map((a) => `shotdesign_${a}.json`)),
      note: '토큰은 프로바이더 보고값 누계. 가격표는 리포지토리에 없어 금액 환산은 하지 않는다.',
    },
    raw: rawPasses,
  }

  writeFileSync(path.join(OUTDIR, 'results.json'), JSON.stringify(results, null, 2))
  console.log('\n=== 집계 ===')
  console.log(`motivated_move: control ${cMM}% → relaxed ${rMM}% (×${ratio})`)
  console.log(`적중: ${cHit}% → ${rHit}% (Δ${hitDelta}%p) · 오발: ${cFA}% → ${rFA}% (Δ${faDelta}%p)`)
  if (v4.control && v4.relaxed) console.log(`v4 역동: ${v4.control.dynamic_ratio_pct}% → ${v4.relaxed.dynamic_ratio_pct}% (Δ${v4Delta}%p)`)
  console.log(`기각조건 ①${cond1_fired} ②${cond2_fired} ③${cond3_fired} ④${cond4_fired}`)
  console.log('[완료] results.json 기록')
}

// ─────────────────────────────────────────────────────────────────────────────
// 사후 분석 (supplementary) — 주 판정을 대체하지 않는다. results.json 에 별도 섹션으로만 붙인다.
// ─────────────────────────────────────────────────────────────────────────────
function supplementary() {
  const results = readJson(path.join(OUTDIR, 'results.json'))
  const labels = results.beat_labeling.beats as { scene_id: string; li: number; needs_motion: boolean | null }[]

  // S1. 오발의 분해 — "정적 비트를 덮은 motivated_move 샷"이 사실은 같은 샷으로 모션 비트도
  //     덮고 있었나(merged 오염) vs 정적 비트만 덮는데도 무빙이 붙었나(순수 오발).
  const s1: Record<string, unknown[]> = { control: [], relaxed: [] }
  for (const arm of ARMS) {
    for (const rep of REPS) {
      const p = rawPath(`decoupage_${arm}_r${rep}.json`)
      if (!existsSync(p)) continue
      const shots: ShotLite[] = readJson(p).plan?.scenes.flatMap((s: { shots: ShotLite[] }) => s.shots) ?? []
      const motionSet = new Set(labels.filter((b) => b.needs_motion === true).map((b) => `${b.scene_id}#${b.li}`))
      let contaminated = 0, pure = 0
      for (const b of labels.filter((x) => x.needs_motion === false)) {
        const covering = shots.filter((s) => s.scene_id === b.scene_id && (s.source_beats ?? []).includes(b.li))
        const mm = covering.filter((s) => s.camera_intent === 'motivated_move')
        if (mm.length === 0) continue
        // 이 정적 비트에 무빙을 붙인 샷들이 전부 "모션 비트도 같이 덮는" 샷이면 merged 오염.
        const allAlsoCoverMotion = mm.every((s) => (s.source_beats ?? []).some((i) => motionSet.has(`${b.scene_id}#${i}`)))
        if (allAlsoCoverMotion) contaminated += 1
        else pure += 1
      }
      const staticTotal = labels.filter((x) => x.needs_motion === false).length
      s1[arm].push({
        rep,
        false_alarm_total: contaminated + pure,
        merged_contaminated: contaminated,
        pure_false_alarm: pure,
        pure_false_alarm_rate_pct: pct(pure / staticTotal),
      })
    }
  }
  const pureMean = (arm: Arm) => Number(mean((s1[arm] as { pure_false_alarm_rate_pct: number }[]).map((x) => x.pure_false_alarm_rate_pct)).toFixed(2))

  // S2. 회차 매칭 오발 증가폭 — 평균값이 임계선을 어느 정도 여유로 넘었는지 회차별로 본다.
  const perRepFa = REPS.map((rep) => {
    const c = results.per_pass.control.find((p: { rep: number }) => p.rep === rep)
    const r = results.per_pass.relaxed.find((p: { rep: number }) => p.rep === rep)
    return c && r ? { rep, control_pct: c.false_alarm_rate_pct, relaxed_pct: r.false_alarm_rate_pct, delta_pp: Number((r.false_alarm_rate_pct - c.false_alarm_rate_pct).toFixed(2)) } : null
  }).filter(Boolean)

  // S3. v4 비정적 샷의 magnitude 분포 + 선언 enum 밖 값(제품 계약 이탈 — 양 팔 공통 현상).
  const DECLARED_TYPES = ['static', 'pan', 'tilt', 'dolly_in', 'dolly_out', 'tracking', 'crane', 'handheld_drift', 'rack_focus']
  const DECLARED_MAGS = ['minimal', 'moderate', 'large']
  const s3: Record<string, unknown> = {}
  for (const arm of ARMS) {
    const p = rawPath(`shotdesign_${arm}.json`)
    if (!existsSync(p)) continue
    const cms = readJson(p).camera_motion_raw as { camera_motion: { type: string; magnitude: string } | null }[]
    const nonStatic = cms.filter((s) => s.camera_motion && s.camera_motion.type !== 'static')
    const mag: Record<string, number> = {}
    for (const s of nonStatic) mag[s.camera_motion!.magnitude] = (mag[s.camera_motion!.magnitude] ?? 0) + 1
    s3[arm] = {
      non_static_count: nonStatic.length,
      magnitude_among_non_static: mag,
      large_or_moderate: nonStatic.filter((s) => ['large', 'moderate', 'medium'].includes(s.camera_motion!.magnitude)).length,
      out_of_enum_types: Array.from(new Set(cms.map((s) => s.camera_motion?.type).filter((t) => t && !DECLARED_TYPES.includes(t)))),
      out_of_enum_magnitudes: Array.from(new Set(cms.map((s) => s.camera_motion?.magnitude).filter((m) => m && !DECLARED_MAGS.includes(m)))),
    }
  }

  results.supplementary = {
    note: '사후 분석 — 사전 등록 판정(rejection_conditions)을 대체하지 않는다. 해석 보조용.',
    s1_false_alarm_decomposition: {
      rule: '정적 비트에 붙은 무빙이 같은 샷의 모션 비트 때문인지(merged 오염) 분리',
      per_pass: s1,
      pure_false_alarm_mean_pct: { control: pureMean('control'), relaxed: pureMean('relaxed') },
      pure_delta_pp: Number((pureMean('relaxed') - pureMean('control')).toFixed(2)),
    },
    s2_false_alarm_delta_per_rep: perRepFa,
    s3_v4_magnitude_and_enum_drift: s3,
  }
  writeFileSync(path.join(OUTDIR, 'results.json'), JSON.stringify(results, null, 2))
  console.log('[supplementary] 기록')
  console.log('  순수 오발(merged 오염 제외):', pureMean('control'), '% →', pureMean('relaxed'), '%  Δ', Number((pureMean('relaxed') - pureMean('control')).toFixed(2)), '%p')
  console.log('  회차별 오발 Δ:', JSON.stringify(perRepFa))
  console.log('  v4 비정적 magnitude:', JSON.stringify(s3))
}

// ─────────────────────────────────────────────────────────────────────────────
// 오케스트레이터
// ─────────────────────────────────────────────────────────────────────────────
function run(args: string[], env: Record<string, string | undefined>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['dlx', 'tsx', SELF, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: 'inherit',
    })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`child ${args.join(' ')} exit ${code}`))))
    child.on('error', reject)
  })
}
const armEnv = (arm: Arm) => ({ WRITER_CAMERA_CONTRACT: arm === 'relaxed' ? 'relaxed' : undefined })

async function orchestrate() {
  mkdirSync(RAWDIR, { recursive: true })
  // A: 팔 2 × 3회 = 6패스. 회차마다 양 팔을 **같은 시간대에 나란히** 돌려 모델 상태 변동을 공유시킨다.
  for (const rep of REPS) {
    console.log(`\n──── A rep${rep} (control ∥ relaxed) ────`)
    await Promise.all(ARMS.map((arm) => run(['--mode', 'decoupage', '--arm', arm, '--rep', String(rep)], armEnv(arm))))
  }
  // B: 팔당 1회 — A rep1 산출물을 v4 까지 통과. v4 문구는 무변경(계약 분기는 decoupage 에만 존재).
  console.log('\n──── B: v4 전파 (control ∥ relaxed) ────')
  await Promise.all(ARMS.map((arm) => run(['--mode', 'shotdesign', '--arm', arm], armEnv(arm))))
  // 라벨링: 팔·샷 정보 없이 비트 텍스트만 — 1회 산출해 양 팔이 공유.
  console.log('\n──── 눈가림 비트 라벨링 ────')
  await run(['--mode', 'label'], {})
  aggregate()
}

async function main() {
  mkdirSync(RAWDIR, { recursive: true })
  switch (MODE) {
    case 'decoupage':
      return childDecoupage(arg('--arm', 'control')!, Number(arg('--rep', '1')))
    case 'shotdesign':
      return childShotDesign(arg('--arm', 'control')!)
    case 'label':
      return childLabel()
    case 'aggregate':
      return aggregate()
    case 'supplementary':
      return supplementary()
    default:
      return orchestrate()
  }
}

main().catch((e) => {
  console.error('[프로브 실패]', e)
  process.exit(1)
})
