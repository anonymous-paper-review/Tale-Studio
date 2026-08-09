// decoupage 씬당 지연 실측 프로브 — HYPOTHESIS.md 의 측정 절차.
//   재현성 3규칙: 제품 runDecoupage 를 그대로 import(복붙 없음), 입력은 실패 run state 로 고정,
//   좌표(run id·씬 id·씬당 ms)는 stdout 에 기록.
// 실행: pnpm dlx tsx research/experiments/writer-decoupage-latency/probe.mts
import { config } from 'dotenv'

config({ path: '.env.local' })

const PROJECT_ID = '3ed26543-6640-4864-9958-02d1fc733cb7'

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const supa = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supa
    .from('writer_runs')
    .select('id, state')
    .eq('project_id', PROJECT_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) throw error ?? new Error('run not found')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = data.state as any
  console.log(
    `[좌표] run=${data.id} scenes=${state.scenes.scenes.length} compact=${state.compact === true}`,
  )

  // 동적 import — dotenv 이후에 로드해야 gemini.ts 등의 모듈 초기화가 키를 본다.
  const { runDecoupage } = await import('../../../src/lib/writer/pipeline/stages/decoupage')
  const { resolveModels } = await import('../../../src/lib/writer/pipeline')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')

  const models = resolveModels(state.input)
  console.log(`[좌표] 모델 축 V = ${JSON.stringify(models.V)}`)
  const logger = new PipelineLogger(PROJECT_ID)
  await logger.init()

  const timings: number[] = []
  for (const idx of [0, 1]) {
    const scene = state.scenes.scenes[idx]
    const oneScene = { ...state.scenes, scenes: [scene] }
    const t0 = Date.now()
    const plan = await runDecoupage(
      state.genre,
      state.characters,
      oneScene,
      state.worldVisual,
      state.compact === true ? null : state.sceneCinematography,
      logger,
      models.V,
    )
    const ms = Date.now() - t0
    timings.push(ms)
    console.log(
      `[실측] ${scene.scene_id}: ${(ms / 1000).toFixed(1)}s → shots=${plan.total_shots}`,
    )
  }
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length
  console.log(
    `[판정재료] 씬당 평균 ${(avg / 1000).toFixed(1)}s × 17씬 ≈ ${((avg * 17) / 1000 / 60).toFixed(1)}분 (인보케이션 수명 ~300s 대비)`,
  )
}

main().catch((e) => {
  console.error('[프로브 실패]', e)
  process.exit(1)
})
