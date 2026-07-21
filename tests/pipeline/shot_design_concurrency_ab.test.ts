// shotDesign 병렬화 A/B 실험 하네스(#parallel-shotdesign 2026-07-21).
//
// 목적: "씬 순차 실행이 shotDesign의 단일 병목"이라는 가설(downloads/writer-shotdesign-performance-2026-07-20.md)에
//   대해, runShotDesign의 concurrency 1(=기존 순차) vs 2/4/8(=병렬)의 wall-clock을 실측 비교하고,
//   병렬화가 산출물(샷 수·shot_id 순서)을 바꾸지 않음을 검증한다.
//
// 왜 vitest인가: 실험 대상은 실제 runShotDesign이다. scripts/*.mjs는 plain node라 TS(@/ alias)를
//   못 불러와 로직을 재구현하게 되고(ab-camera-experiment.mjs가 그래서 deprecated), 그러면 관측이 무효다.
//   여기선 dispatch만 스텁하고 runShotDesign 실물을 그대로 돌린다 → 스케줄링 변화만 순수 격리.
//
// LLM 시간 소스: 실제 완료 run "에일리언 2"(2beb605c…)의 per-call duration_ms를 리플레이한다
//   (gemini.ts가 raw_collector에 남긴 값 = 유저가 말한 "llm 호출시간 기록 파이프라인").
//   로그가 있으면 실측값을, 없으면 문서 모델(출력토큰 바운드)을 쓴다 → 항상 실행 가능.
//   벽시계를 초 단위로 재현하면 순차 baseline만 350초라 테스트가 못 끝나므로 TIME_SCALE로 축소하되,
//   speedup 비율은 스케일 불변이다. 리포트에 실척(projected real)을 함께 출력한다.
//
// 실행: npx vitest run tests/pipeline/shot_design_concurrency_ab.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const generateJsonMock = vi.fn()

vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: (...args: unknown[]) => generateJsonMock(...args),
  describeAxisConfig: () => 'stub-model',
}))

import { runShotDesign } from '@/lib/writer/pipeline/stages/v4_shots'
import type { PipelineLogger } from '@/lib/writer/logger'

const logger = {
  markStage: vi.fn(async () => {}),
  saveStage: vi.fn(async () => {}),
  saveLlmCall: vi.fn(async () => {}),
  flushRawLlm: vi.fn(async () => {}),
} as unknown as PipelineLogger
const axis = { provider: 'gemini', model: 'stub' } as never

const SHOT_CHUNK_SIZE = 8 // v4_shots.ts와 동일해야 함(청크 경계·콜 수 재현).
const TIME_SCALE = 120 // 실 duration_ms를 1/120로 축소(≈350s → ≈2.9s). 비율은 불변.
const REAL_RUN = '2beb605c-3892-4fc2-b493-b76b5b071286'
const CONCURRENCIES = [1, 2, 4, 8]

// ── 실데이터 로드 (없으면 문서 기반 합성) ──────────────────────────────────────
type SceneSpec = { id: string; shots: number }

/** 실 run의 decoupage에서 씬별 샷 분포. 없으면 문서의 에일리언2 분포로 합성. */
function loadDistribution(): { specs: SceneSpec[]; source: string } {
  const p = path.join(process.cwd(), 'logs', REAL_RUN, '10b_c_decoupage.json')
  try {
    const dec = JSON.parse(fs.readFileSync(p, 'utf8')) as { scenes: { scene_id: string; shots: unknown[] }[] }
    const specs = dec.scenes.map((s) => ({ id: s.scene_id, shots: s.shots.length }))
    if (specs.length > 0 && specs.every((s) => s.shots > 0)) return { specs, source: `real decoupage (${REAL_RUN})` }
  } catch {
    /* fall through */
  }
  // 문서 실측 분포(9/8/21/12/10/4/20 = 7씬 84샷).
  const dist = [9, 8, 21, 12, 10, 4, 20]
  return { specs: dist.map((n, i) => ({ id: `scene_${i + 1}`, shots: n })), source: 'synthetic (doc dist 9/8/21/12/10/4/20)' }
}

/** 실 run의 shotDesign per-call duration_ms(오름차순). 없으면 빈 배열. */
function loadRealDurations(): number[] {
  const dir = path.join(process.cwd(), 'logs', REAL_RUN, 'debug', 'llm_calls')
  try {
    const files = fs.readdirSync(dir).filter((f) => /shotDesign_gemini\.json$/.test(f))
    const ms = files
      .map((f) => (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { duration_ms?: number }).duration_ms ?? 0)
      .filter((n) => n > 0)
    return ms.sort((a, b) => a - b)
  } catch {
    return []
  }
}

/** 청크 크기 목록(씬 순서, 8단위 분할). 콜 1개 = 청크 1개. */
function chunkSizes(specs: SceneSpec[]): number[] {
  const out: number[] = []
  for (const s of specs) {
    for (let i = 0; i < s.shots; i += SHOT_CHUNK_SIZE) out.push(Math.min(SHOT_CHUNK_SIZE, s.shots - i))
  }
  return out
}

/**
 * 청크 크기 → duration_ms 모델. 실측이 있으면 rank-match(작은 청크↔짧은 시간; output_chars∝시간 관측 근거)로
 * 크기별 평균을 만들고, 없으면 문서 모델(출력토큰 바운드: intercept + slope×샷수)을 쓴다.
 */
function buildDurationModel(specs: SceneSpec[], real: number[]): { forN: (n: number) => number; source: string } {
  const sizes = chunkSizes(specs)
  if (real.length === sizes.length && real.length > 0) {
    const sortedSizes = [...sizes].sort((a, b) => a - b)
    const bucket = new Map<number, number[]>()
    sortedSizes.forEach((sz, i) => {
      const arr = bucket.get(sz) ?? []
      arr.push(real[i])
      bucket.set(sz, arr)
    })
    const avg = new Map<number, number>()
    for (const [sz, arr] of bucket) avg.set(sz, arr.reduce((a, b) => a + b, 0) / arr.length)
    return {
      forN: (n) => avg.get(n) ?? 7000 + 3000 * n, // 미관측 크기는 문서 선형모델로 보간
      source: `real per-call durations (${real.length} calls, ${(real.reduce((a, b) => a + b, 0) / 1000).toFixed(0)}s total)`,
    }
  }
  // 문서 모델: 8샷 청크≈31s, 1샷≈10s → intercept 7s + 3s/샷.
  return { forN: (n) => 7000 + 3000 * n, source: 'doc model (7s + 3s/shot)' }
}

// ── 입력 합성 (dispatch가 스텁이라 plan/decoupage 구조만 실제와 같으면 됨) ──────────
function makeDecoupageShot(shotId: string) {
  return {
    shot_id: shotId, operation: 'adopt', shot_function: 'beat', shot_size: 'MS',
    intended_duration_seconds: 5, source_beats: [0], camera_intent: 'static',
    rhythm_role: 'base', dramatic_purpose: 'p', beat_summary: 's',
  }
}
function makeShot(shotId: string) {
  return {
    intent: { shot_id: shotId, scene_id: '', story_beat_ref: 0, dramatic_purpose: 'p', duration_seconds: 5, duration_justification: 'j', audience_focus: 'a', shot_position_in_scene: 'developing' },
    static_spec: { shot_id: shotId },
    dynamic_spec: { shot_id: shotId },
  }
}
function buildInputs(specs: SceneSpec[]) {
  const scenes = { scenes: specs.map((s) => ({ scene_id: s.id, location: 'loc_1', characters_in_scene: [], estimated_seconds: 30, scene_actions: [] })) }
  const decoupage = { scenes: specs.map((s) => ({ scene_id: s.id, shots: Array.from({ length: s.shots }, (_, j) => makeDecoupageShot(`${s.id}_sh_${j + 1}`)) })) }
  const plans = specs.map((s) => ({ scene_id: s.id }))
  return { scenes, decoupage, plans, genre: { genre: 'x', tone: [] }, characters: { characters: [] }, visualIdentity: { style: {} }, worldVisual: { global_palette: [], locations: [] }, characterVisual: { characters: [] } }
}
function run(inputs: ReturnType<typeof buildInputs>, concurrency: number) {
  return runShotDesign(
    inputs.genre as never, inputs.characters as never, inputs.scenes as never,
    inputs.visualIdentity as never, inputs.worldVisual as never, inputs.characterVisual as never,
    inputs.plans as never, inputs.decoupage as never, '', logger, axis, { concurrency },
  )
}

// ── 스텁: 청크 크기만큼 샷을 돌려주되, 모델 duration만큼 (축소해) sleep → 네트워크 대기 모사 ──
function installTimingStub(model: (n: number) => number) {
  generateJsonMock.mockImplementation(async (userPrompt: string) => {
    const n = Number(/샷 수 = (\d+)개/.exec(userPrompt)?.[1] ?? 1)
    await new Promise((r) => setTimeout(r, model(n) / TIME_SCALE))
    return { shots: Array.from({ length: n }, (_, i) => makeShot(`stub_${i}`)) }
  })
}

/** 리스트 스케줄링 이론적 makespan(워커 풀 하한 검산용). 씬비용 = 씬의 청크 duration 합. */
function analyticalMakespanMs(sceneCosts: number[], workers: number): number {
  const load = new Array(Math.max(1, Math.min(workers, sceneCosts.length))).fill(0)
  for (const c of sceneCosts) {
    let mi = 0
    for (let i = 1; i < load.length; i++) if (load[i] < load[mi]) mi = i
    load[mi] += c
  }
  return Math.max(...load)
}

beforeEach(() => {
  generateJsonMock.mockReset()
})

describe('shotDesign 병렬화 A/B — concurrency별 wall-clock & 산출물 동등성', () => {
  it('concurrency를 올리면 wall-clock이 줄고, 샷 수·shot_id 순서는 불변이다', async () => {
    const { specs, source: distSrc } = loadDistribution()
    const real = loadRealDurations()
    const model = buildDurationModel(specs, real)
    installTimingStub(model.forN)
    const inputs = buildInputs(specs)

    const totalShots = specs.reduce((a, s) => a + s.shots, 0)
    const totalCalls = chunkSizes(specs).length
    const expectedIds = specs.flatMap((s) => Array.from({ length: s.shots }, (_, j) => `${s.id}_sh_${j + 1}`))
    const sceneCosts = specs.map((s) => {
      let c = 0
      for (let i = 0; i < s.shots; i += SHOT_CHUNK_SIZE) c += model.forN(Math.min(SHOT_CHUNK_SIZE, s.shots - i))
      return c
    })
    const realSeqSec = sceneCosts.reduce((a, b) => a + b, 0) / 1000

    const rows: { c: number; wallMs: number; analyticalMs: number; shots: number }[] = []
    for (const c of CONCURRENCIES) {
      const t0 = performance.now()
      const res = await run(inputs, c)
      const wallMs = performance.now() - t0

      // 산출물 동등성: 어떤 concurrency에서도 완주·샷 수·shot_id 순서가 동일해야 한다.
      expect(res.done).toBe(true)
      expect(res.shots).toHaveLength(totalShots)
      expect(res.shots.map((s) => s.intent.shot_id)).toEqual(expectedIds)
      expect(res.doneSceneIds).toEqual(specs.map((s) => s.id))
      expect(generateJsonMock).toHaveBeenCalledTimes(totalCalls)

      rows.push({ c, wallMs, analyticalMs: analyticalMakespanMs(sceneCosts, c), shots: res.shots.length })
      generateJsonMock.mockClear()
    }

    const base = rows[0].wallMs
    const report = [
      '',
      '━━━ shotDesign 병렬화 A/B ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `분포: ${specs.length}씬 / ${totalShots}샷 / ${totalCalls}콜   [${distSrc}]`,
      `LLM 시간: ${model.source}`,
      `순차(concurrency=1) 실 LLM 합계 ≈ ${realSeqSec.toFixed(0)}s (측정은 1/${TIME_SCALE} 축소; 실척=측정×${TIME_SCALE})`,
      '',
      'conc │  측정 wall │ 이론 makespan │ projected 실척 │ speedup │ shots',
      '─────┼────────────┼───────────────┼────────────────┼─────────┼──────',
      ...rows.map((r) =>
        `  ${String(r.c).padStart(2)} │ ${(r.wallMs).toFixed(0).padStart(7)}ms │ ${(r.analyticalMs / TIME_SCALE).toFixed(0).padStart(10)}ms │ ${(r.wallMs * TIME_SCALE / 1000).toFixed(0).padStart(11)}s │ ${(base / r.wallMs).toFixed(2).padStart(6)}x │ ${String(r.shots).padStart(4)}`,
      ),
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n')
    console.log(report)

    // 핵심 주장: 병렬(4)이 순차(1)보다 유의하게 빠르다. (이론상 ~3x; jitter 여유 두고 0.7배 미만)
    const wall = (c: number) => rows.find((r) => r.c === c)!.wallMs
    expect(wall(4)).toBeLessThan(wall(1) * 0.7)
    expect(wall(2)).toBeLessThan(wall(1))
    // 롱폴 하한: 최장 씬(청크 순차)보다 빨라질 수 없다 → 8워커가 4워커보다 크게 못 준다면 그게 정상(병목=최장 씬).
    expect(wall(8)).toBeLessThanOrEqual(wall(4) * 1.15)
  }, 60_000)
})
