// shotDesign 씬 동시성 프로브 — HYPOTHESIS.md(v1) / HYPOTHESIS_v2.md(재측정) 절차.
//   제품 runShotDesign 직접 호출(복붙 없음). fixture 고정, opts.concurrency 만 갈린다.
//
// v2 확장(2026-08-11): 팔당 반복(--runs), 모델 라벨 기록(v1 이 이걸 안 남겨 재측정이 필요해졌다),
//   콜 지연 전체 분포(p90 포함), 씬별 귀속 — 느린 콜이 매번 같은 씬이면 입력 성질, 흩어지면 일시적.
//
// 실행: pnpm dlx tsx research/experiments/shotdesign-concurrency/probe.mts --levels 4,8,12 --runs 3
//   ※ 팔은 순차 실행된다(쿼터 경합이 벽시계를 오염시키지 않게). 다른 실험을 동시에 돌리지 말 것.
import { config } from 'dotenv'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

config({ path: '.env.local' })

const FIXTURE = path.resolve('logs/e4da245a-8d89-44e5-8fde-131d016ef2e3')
const OUTDIR = path.resolve('research/experiments/shotdesign-concurrency')
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(n)
  return i >= 0 ? process.argv[i + 1] : d
}
const LEVELS = (arg('--levels', '4,8') as string).split(',').map((x) => Number(x.trim()))
const RUNS = Number(arg('--runs', '1'))
const OUT = arg('--out', RUNS > 1 || LEVELS.length > 2 ? 'results-v2.json' : 'results.json')!

const readFixture = (f: string) => JSON.parse(readFileSync(path.join(FIXTURE, f), 'utf8'))

const pct = (sorted: number[], p: number) =>
  sorted.length ? +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] / 1000).toFixed(1) : null

async function main() {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const scenes = readFixture('05_s3_scenes.json')
  const visualIdentity = readFixture('08_v0_visualIdentity.json')
  const v2 = readFixture('09_v2_design.json')
  const v3 = readFixture('10_v3_sceneCinematography.json')
  const decoupage = readFixture('10b_c_decoupage.json')
  const integrated = readFixture('INTEGRATED.json')

  const { runShotDesign } = await import('../../../src/lib/writer/pipeline/stages/v4_shots')
  // 모델 축은 제품 해석기로 — fixture 의 input 이 모델을 안 지정하면 DEFAULT_MODELS.V 가 나온다.
  const { resolveModels } = await import('../../../src/lib/writer/pipeline')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')
  const { resetRawSeq, getPendingRawCalls, flushRawCalls } = await import(
    '../../../src/lib/writer/llm/raw_collector'
  )

  const axis = resolveModels(integrated.input).V
  const modelLabel = `${axis.provider}/${axis.model ?? '(default)'}`
  console.log(`[모델 축] V = ${modelLabel} · fixture ${path.basename(FIXTURE)} · 팔 ${LEVELS.join('/')} × ${RUNS}런`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs: any[] = []
  for (const concurrency of LEVELS) {
    for (let i = 1; i <= RUNS; i += 1) {
      const logger = new PipelineLogger(`probe-shotdesign-v2-c${concurrency}-r${i}`)
      await logger.init()
      resetRawSeq()

      const t0 = Date.now()
      let error: string | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any = null
      try {
        result = await runShotDesign(
          integrated.genre,
          integrated.characters,
          scenes,
          visualIdentity,
          v2.worldVisual,
          v2.characterVisual,
          v3.scene_plans,
          decoupage,
          '',
          logger,
          axis,
          { concurrency },
        )
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
      }
      const wallMs = Date.now() - t0

      const raw = getPendingRawCalls()
      flushRawCalls()
      const errs = raw.filter((c) => c.error)
      const ms = raw.map((c) => c.duration_ms).sort((a, b) => a - b)
      const modelMs = ms.reduce((a, b) => a + b, 0)

      // 씬 귀속 — 프롬프트에서 scene_id 를 뽑는다. 느린 콜이 매번 같은 씬인지 보려는 것.
      const byScene: Record<string, number[]> = {}
      for (const c of raw) {
        const m = /scene_\d+/.exec(c.prompt ?? '')
        const key = m ? m[0] : '(미상)'
        ;(byScene[key] ??= []).push(c.duration_ms)
      }
      const sceneMax = Object.entries(byScene)
        .map(([s, v]) => ({ scene: s, max_s: +(Math.max(...v) / 1000).toFixed(1), calls: v.length }))
        .sort((a, b) => b.max_s - a.max_s)

      runs.push({
        concurrency,
        run: i,
        model: modelLabel,
        wall_ms: wallMs,
        error,
        done: result?.done ?? null,
        shots: result?.shots?.length ?? null,
        scenes_done: result?.doneSceneIds?.length ?? null,
        calls: raw.length,
        call_errors: errs.length,
        call_error_samples: errs.slice(0, 3).map((c) => String(c.error).slice(0, 160)),
        model_seconds: +(modelMs / 1000).toFixed(1),
        call_min_s: pct(ms, 0),
        call_median_s: pct(ms, 0.5),
        call_p90_s: pct(ms, 0.9),
        call_max_s: ms.length ? +(ms[ms.length - 1] / 1000).toFixed(1) : null,
        call_ms: ms,
        input_tokens: raw.reduce((a, c) => a + (c.input_tokens ?? 0), 0),
        output_tokens: raw.reduce((a, c) => a + (c.output_tokens ?? 0), 0),
        effective_parallelism: ms.length ? +(modelMs / wallMs).toFixed(2) : null,
        slowest_scenes: sceneMax.slice(0, 3),
      })
      const r = runs[runs.length - 1]
      console.log(
        `[c=${concurrency} r${i}] wall ${(wallMs / 1000).toFixed(1)}s · shots ${r.shots} · calls ${r.calls} ` +
          `(err ${r.call_errors}) · model ${r.model_seconds}s · 실효병렬 ${r.effective_parallelism} · ` +
          `콜 중앙 ${r.call_median_s}s / p90 ${r.call_p90_s}s / max ${r.call_max_s}s · ` +
          `최장씬 ${r.slowest_scenes[0]?.scene}(${r.slowest_scenes[0]?.max_s}s)` +
          (error ? ` · ERROR ${error}` : ''),
      )
    }
  }

  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(
    path.join(OUTDIR, OUT),
    JSON.stringify(
      { finished_at: new Date().toISOString(), fixture: path.basename(FIXTURE), model: modelLabel, levels: LEVELS, runs_per_level: RUNS, runs },
      null,
      2,
    ),
  )

  // 팔별 요약 — 기각선 대조를 콘솔에서 바로 읽게.
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const byLevel = LEVELS.map((c) => {
    const rs = runs.filter((r) => r.concurrency === c)
    return { c, wall: mean(rs.map((r) => r.wall_ms)) / 1000, max: Math.max(...rs.map((r) => r.call_max_s ?? 0)), errs: rs.reduce((a, r) => a + r.call_errors, 0) }
  })
  console.log('\n[요약]')
  for (const l of byLevel) console.log(`  c=${l.c}  평균 벽시계 ${l.wall.toFixed(1)}s · 최대 콜 ${l.max}s · 콜에러 ${l.errs}`)
  const base = byLevel[0]
  for (const l of byLevel.slice(1)) {
    console.log(`  c=${base.c}→c=${l.c}: ${(((base.wall - l.wall) / base.wall) * 100).toFixed(1)}% 단축 (기각선 <30%)`)
  }
  console.log(`[완료] ${OUT} 기록`)
}

main().catch((e) => {
  console.error('[probe 실패]', e)
  process.exit(1)
})
