// shotDesign 씬 동시성 프로브 — HYPOTHESIS.md 절차. 제품 runShotDesign 직접 호출(복붙 없음).
// 실행: pnpm dlx tsx research/experiments/shotdesign-concurrency/probe.mts [--levels 4,8]
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

const readFixture = (f: string) => JSON.parse(readFileSync(path.join(FIXTURE, f), 'utf8'))

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs: any[] = []
  for (const concurrency of LEVELS) {
    const logger = new PipelineLogger(`probe-shotdesign-c${concurrency}`)
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
        resolveModels(integrated.input).V,
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

    runs.push({
      concurrency,
      wall_ms: wallMs,
      error,
      done: result?.done ?? null,
      shots: result?.shots?.length ?? null,
      scenes_done: result?.doneSceneIds?.length ?? null,
      calls: raw.length,
      call_errors: errs.length,
      call_error_samples: errs.slice(0, 3).map((c) => String(c.error).slice(0, 160)),
      model_seconds: +(ms.reduce((a, b) => a + b, 0) / 1000).toFixed(1),
      call_min_s: ms.length ? +(ms[0] / 1000).toFixed(1) : null,
      call_median_s: ms.length ? +(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1) : null,
      call_max_s: ms.length ? +(ms[ms.length - 1] / 1000).toFixed(1) : null,
      effective_parallelism: ms.length ? +(ms.reduce((a, b) => a + b, 0) / wallMs).toFixed(2) : null,
    })
    const r = runs[runs.length - 1]
    console.log(
      `[c=${concurrency}] wall ${(wallMs / 1000).toFixed(1)}s · shots ${r.shots} · calls ${r.calls} ` +
        `(err ${r.call_errors}) · model ${r.model_seconds}s · 실효병렬 ${r.effective_parallelism}` +
        (error ? ` · ERROR ${error}` : ''),
    )
  }

  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(
    path.join(OUTDIR, 'results.json'),
    JSON.stringify({ finished_at: new Date().toISOString(), fixture: path.basename(FIXTURE), runs }, null, 2),
  )
  if (runs.length === 2) {
    const [a, b] = runs
    console.log(
      `[비교] c=${a.concurrency} ${(a.wall_ms / 1000).toFixed(1)}s → c=${b.concurrency} ${(b.wall_ms / 1000).toFixed(1)}s ` +
        `= ${(((a.wall_ms - b.wall_ms) / a.wall_ms) * 100).toFixed(1)}% 단축 (기각선 <15%)`,
    )
  }
  console.log('[완료] results.json 기록')
}

main().catch((e) => {
  console.error('[probe 실패]', e)
  process.exit(1)
})
