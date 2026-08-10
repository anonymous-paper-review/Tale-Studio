// shotCheck 출력 다이어트 프로브 — HYPOTHESIS.md 절차.
//   제품 runShotCheck 를 그대로 호출한다(복붙 없음). 입력 fixture 고정, 출력 스키마만 코드 상태로 갈린다.
// 실행: pnpm dlx tsx research/experiments/shotcheck-output-diet/probe.mts --tag baseline [--runs 2]
import { config } from 'dotenv'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

config({ path: '.env.local' })

const FIXTURE = path.resolve('logs/e4da245a-8d89-44e5-8fde-131d016ef2e3')
const OUTDIR = path.resolve('research/experiments/shotcheck-output-diet')
const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : def
}
const TAG = arg('--tag', 'baseline')!
const RUNS = Number(arg('--runs', '2'))

const readFixture = (f: string) => JSON.parse(readFileSync(path.join(FIXTURE, f), 'utf8'))

async function main() {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const shotDesign = readFixture('11_v4_shotDesign.json').shots
  const scenes = readFixture('05_s3_scenes.json')
  const v2 = readFixture('09_v2_design.json')
  const decoupage = readFixture('10b_c_decoupage.json')
  const integrated = readFixture('INTEGRATED.json')

  const { runShotCheck } = await import('../../../src/lib/writer/pipeline/stages/c_application_2')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')
  const { resetRawSeq, getPendingRawCalls, flushRawCalls } = await import(
    '../../../src/lib/writer/llm/raw_collector'
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs: any[] = []
  for (let i = 1; i <= RUNS; i += 1) {
    const logger = new PipelineLogger(`probe-diet-${TAG}-r${i}`)
    await logger.init()
    resetRawSeq()

    const t0 = Date.now()
    let error: string | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null
    try {
      result = await runShotCheck(
        'exp-diet',
        integrated.genre,
        integrated.characters,
        scenes,
        v2.worldVisual,
        shotDesign,
        decoupage,
        [],
        logger,
        { provider: 'claude', model: 'claude-sonnet-4-6' } as never,
      )
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    const wallMs = Date.now() - t0

    const raw = getPendingRawCalls().filter((c) => c.provider === 'claude')
    flushRawCalls()

    const report = result?.report ?? null
    const seq = result?.shotSequence ?? null
    const byCat: Record<string, number> = {}
    const bySev: Record<string, number> = {}
    for (const is of report?.issues ?? []) {
      byCat[is.category] = (byCat[is.category] ?? 0) + 1
      bySev[is.severity] = (bySev[is.severity] ?? 0) + 1
    }

    // 형제 개별화: 같은 source_shot_id 를 공유하는 자식들의 액션/프롬프트가 서로 다른가.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bySource = new Map<string, any[]>()
    for (const s of seq?.shots ?? []) {
      const src = s.source_shot_id ?? s.shot_id
      if (!bySource.has(src)) bySource.set(src, [])
      bySource.get(src)!.push(s)
    }
    const siblingGroups = [...bySource.entries()].filter(([, v]) => v.length > 1)
    let dupAction = 0
    let blankAction = 0
    let dupMotion = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const samples: any[] = []
    for (const [src, group] of siblingGroups) {
      const actions = group.map((g) => (g.S?.character_action ?? '').trim())
      const motions = group.map((g) => (g.video_generation?.motion_prompt ?? '').trim())
      if (actions.some((a) => !a)) blankAction += 1
      if (new Set(actions).size < actions.length) dupAction += 1
      if (new Set(motions.filter(Boolean)).size < motions.filter(Boolean).length) dupMotion += 1
      if (samples.length < 4) samples.push({ source: src, actions, motions })
    }

    runs.push({
      run: i,
      wall_ms: wallMs,
      error,
      calls: raw.length,
      call_ms: raw.map((c) => c.duration_ms),
      input_chars: raw.reduce((a, c) => a + (c.input_chars ?? 0), 0),
      output_chars: raw.reduce((a, c) => a + (c.output_chars ?? 0), 0),
      issues_total: report?.issues?.length ?? null,
      issues_by_category: byCat,
      issues_by_severity: bySev,
      split_count: report?.shots_split_count ?? null,
      total_shots: seq?.total_shots ?? null,
      sibling_groups: siblingGroups.length,
      sibling_dup_action: dupAction,
      sibling_blank_action: blankAction,
      sibling_dup_motion: dupMotion,
      sibling_samples: samples,
    })
    console.log(
      `[${TAG} r${i}] wall ${(wallMs / 1000).toFixed(1)}s · out ${runs[i - 1].output_chars}자 · ` +
        `issues ${runs[i - 1].issues_total} · split ${runs[i - 1].split_count} · shots ${runs[i - 1].total_shots}` +
        (error ? ` · ERROR ${error}` : ''),
    )
  }

  mkdirSync(OUTDIR, { recursive: true })
  const out = path.join(OUTDIR, `results-${TAG}.json`)
  writeFileSync(
    out,
    JSON.stringify(
      { tag: TAG, finished_at: new Date().toISOString(), fixture: path.basename(FIXTURE), runs },
      null,
      2,
    ),
  )
  console.log(`[완료] ${path.basename(out)} 기록`)
}

main().catch((e) => {
  console.error('[probe 실패]', e)
  process.exit(1)
})
