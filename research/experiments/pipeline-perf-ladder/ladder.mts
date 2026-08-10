// 버전 사다리 실험 러너 — HYPOTHESIS.md 의 측정 절차 (v0 vs v1, 1차).
//   재현성 3규칙: 제품 runDecoupage 를 그대로 import(복붙 없음), 입력은 run state fixture 로 고정,
//   좌표(run id·모델·예산·인보케이션별 wall)는 results.json 에 기록.
// 실행: pnpm dlx tsx research/experiments/pipeline-perf-ladder/ladder.mts
import { config } from 'dotenv'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

config({ path: '.env.local' })

const BUDGET_MS = 240_000
const OUT = path.resolve('research/experiments/pipeline-perf-ladder/results.json')

// 2차(#scene-parallel): v0/v1 데이터는 1차 결과에 있으므로 이번 실행은 v2 계열만 돌린다.
//   v2 = 체크포인트 릴레이 + 동시 4. v2x8 = 탐색 런(429 임계 탐지, HYPOTHESIS_v2 판정 밖).
const SUBJECTS: Array<{
  name: string
  projectId: string
  modes: Array<{ label: string; kind: 'v0' | 'relay'; concurrency: number; repeats: number }>
}> = [
  {
    name: '17씬 (사고 재현)',
    projectId: '3ed26543-6640-4864-9958-02d1fc733cb7',
    modes: [
      // 3차(#fetch-pool 재실험): 이전 v2/v2x8 은 기본 디스패처의 클라이언트 직렬화로 오염 —
      //   같은 사전 등록 기준(HYPOTHESIS_v2)으로 튠 이후 재측정.
      { label: 'v2-fixed', kind: 'relay', concurrency: 4, repeats: 2 },
      { label: 'v2x8-fixed (탐색)', kind: 'relay', concurrency: 8, repeats: 1 },
    ],
  },
  {
    name: '4씬 (회귀 확인)',
    projectId: '6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a',
    modes: [{ label: 'v2-fixed', kind: 'relay', concurrency: 4, repeats: 1 }],
  },
]

interface InvocationRecord { wall_ms: number; scenes_done: number }
interface RunRecord {
  subject: string
  project_id: string
  run_id: string
  mode: string
  concurrency?: number
  repeat: number
  scene_count: number
  invocations: InvocationRecord[]
  total_wall_ms: number
  max_invocation_wall_ms: number
  total_shots: number | null
  transient_warnings: number
  survives_240_budget: boolean // 모든 인보케이션 wall ≤ 300s(hard kill) 인가 — v0 단일호출도 동일 기준
  finished_at: string
}

// 기존 결과에 append — 사다리는 회차를 거듭하며 같은 파일에 쌓인다.
const results: { started_at: string; budget_ms: number; runs: RunRecord[] } = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, 'utf8')) as { started_at: string; budget_ms: number; runs: RunRecord[] })
  : { started_at: new Date().toISOString(), budget_ms: BUDGET_MS, runs: [] }
function flush() {
  writeFileSync(OUT, JSON.stringify(results, null, 2))
}

// withLlmRetry 의 transient 경고를 세어 레이트리밋 개입을 기록 (429/503/타임아웃).
let transientCount = 0
const origWarn = console.warn
console.warn = (...a: unknown[]) => {
  if (String(a[0] ?? '').includes('transient')) transientCount += 1
  origWarn(...a)
}

async function main() {
  // #fetch-pool(2026-08-09): 기본 디스패처의 origin당 직렬화 실측 후, 프로덕션(instrumentation.ts)과
  //   동일한 커넥션 풀 튠을 하네스에도 적용 — 이제부터의 측정은 "튠 이후 세계"의 숫자다.
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const { createClient } = await import('@supabase/supabase-js')
  const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { runDecoupage } = await import('../../../src/lib/writer/pipeline/stages/decoupage')
  const { resolveModels } = await import('../../../src/lib/writer/pipeline')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')

  for (const subject of SUBJECTS) {
    // 최신 run 중 pre-decoupage 산출물을 모두 가진 행을 fixture 로.
    const { data: rows, error } = await supa
      .from('writer_runs')
      .select('id, state, created_at')
      .eq('project_id', subject.projectId)
      .order('created_at', { ascending: false })
      .limit(5)
    if (error || !rows?.length) throw error ?? new Error(`no runs: ${subject.projectId}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = rows.find((r: any) => {
      const s = r.state ?? {}
      return s.genre && s.characters && s.scenes && s.worldVisual && s.sceneCinematography
    })
    if (!row) throw new Error(`no run with pre-decoupage state: ${subject.projectId}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = row.state as any
    const models = resolveModels(state.input)
    const sceneCount = state.scenes.scenes.length
    console.log(
      `[대상] ${subject.name} run=${row.id} scenes=${sceneCount} model=${JSON.stringify(models.V)}`,
    )

    for (const mode of subject.modes) {
      for (let rep = 1; rep <= mode.repeats; rep++) {
        transientCount = 0
        const slug = mode.label.replace(/[^\w-]/g, '')
        const logger = new PipelineLogger(`exp-ladder-${subject.projectId.slice(0, 8)}-${slug}-r${rep}`)
        await logger.init()
        const cine = state.compact === true ? null : state.sceneCinematography
        const invocations: InvocationRecord[] = []
        let totalShots: number | null = null

        if (mode.kind === 'v0') {
          const t0 = Date.now()
          const r = await runDecoupage(
            state.genre, state.characters, state.scenes, state.worldVisual, cine, logger, models.V,
          )
          invocations.push({ wall_ms: Date.now() - t0, scenes_done: r.scenes.length })
          totalShots = r.plan?.total_shots ?? null
        } else {
          // relay — 프로덕션 릴레이 시뮬레이션: 인보케이션마다 240s soft 예산, 체크포인트 이어받기.
          //   concurrency 1 = v1(순차), 4+ = v2(병렬 #scene-parallel).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let acc: any[] = []
          for (let i = 0; i < 60; i++) {
            const t0 = Date.now()
            const r = await runDecoupage(
              state.genre, state.characters, state.scenes, state.worldVisual, cine, logger, models.V,
              { resume: acc, softDeadlineMs: Date.now() + BUDGET_MS, concurrency: mode.concurrency },
            )
            invocations.push({ wall_ms: Date.now() - t0, scenes_done: r.scenes.length - acc.length })
            acc = r.scenes
            if (r.done) {
              totalShots = r.plan?.total_shots ?? null
              break
            }
          }
        }

        const totalWall = invocations.reduce((a, b) => a + b.wall_ms, 0)
        const maxWall = Math.max(...invocations.map((i) => i.wall_ms))
        const rec: RunRecord = {
          subject: subject.name,
          project_id: subject.projectId,
          run_id: row.id,
          mode: mode.label,
          concurrency: mode.concurrency,
          repeat: rep,
          scene_count: sceneCount,
          invocations,
          total_wall_ms: totalWall,
          max_invocation_wall_ms: maxWall,
          total_shots: totalShots,
          transient_warnings: transientCount,
          survives_240_budget: maxWall <= 300_000,
          finished_at: new Date().toISOString(),
        }
        results.runs.push(rec)
        flush()
        console.log(
          `[결과] ${subject.name} ${mode.label}(동시${mode.concurrency}) r${rep}: 총 ${(totalWall / 1000).toFixed(1)}s · ` +
            `인보케이션 ${invocations.length}개(최대 ${(maxWall / 1000).toFixed(1)}s) · ` +
            `샷 ${totalShots} · transient ${transientCount} · 생존 ${rec.survives_240_budget}`,
        )
      }
    }
  }
  console.log(`[완료] results → ${OUT}`)
}

main().catch((e) => {
  console.error('[사다리 실패]', e)
  flush()
  process.exit(1)
})
