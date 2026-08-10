// 풀 파이프라인 특성화 러너 — HYPOTHESIS.md 절차. 제품 runPipeline 을 그대로 실행(복붙 없음),
//   입력은 17씬 프로젝트의 state.input 고정, 격리는 클론 프로젝트로.
// 실행: pnpm dlx tsx research/experiments/writer-full-run/run.mts [--out <파일명|경로>]
//   --out 미지정이면 기존 results.json (1차 실측) 에 쓴다 — 회차를 나눌 땐 반드시 --out 을 준다.
import { config } from 'dotenv'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

config({ path: '.env.local' })
// 프로덕션과 동일 조건: 전송 튠 + 씬 병렬 4 (instrumentation.ts / steps.ts env 배선과 동일)
process.env.WRITER_SCENE_CONCURRENCY = '4'

const SRC_PROJECT = '3ed26543-6640-4864-9958-02d1fc733cb7'
// --out: 파일명만 주면 이 실험 디렉토리 기준, 경로를 주면 그대로 (기본값 = 기존 경로 유지).
const OUT_ARG = (() => {
  const i = process.argv.indexOf('--out')
  return i >= 0 ? process.argv[i + 1] : undefined
})()
const OUT = OUT_ARG
  ? path.resolve(OUT_ARG.includes('/') ? OUT_ARG : `research/experiments/writer-full-run/${OUT_ARG}`)
  : path.resolve('research/experiments/writer-full-run/results.json')

async function main() {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const { createClient } = await import('@supabase/supabase-js')
  const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 1) 입력 확보 — 17씬 run 의 state.input
  const { data: runs, error: runErr } = await supa
    .from('writer_runs')
    .select('id, state, created_at')
    .eq('project_id', SRC_PROJECT)
    .order('created_at', { ascending: false })
    .limit(3)
  if (runErr || !runs?.length) throw runErr ?? new Error('source run not found')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srcRun = runs.find((r: any) => r.state?.input) as { id: string; state: any }
  if (!srcRun) throw new Error('run with input not found')
  const input = srcRun.state.input

  // 2) 격리 클론 — projects + characters + locations (원본 무손상)
  const newId = randomUUID()
  const { data: proj } = await supa.from('projects').select('*').eq('id', SRC_PROJECT).single()
  if (!proj) throw new Error('source project not found')
  const { error: pErr } = await supa.from('projects').insert({
    ...proj,
    id: newId,
    title: `[실험] 풀런 프로파일 ${new Date().toISOString().slice(0, 10)}`,
    last_writer_run_id: null,
  })
  if (pErr) throw pErr
  for (const table of ['characters', 'locations'] as const) {
    const { data: rows } = await supa.from(table).select('*').eq('project_id', SRC_PROJECT)
    for (const row of rows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clone: any = { ...row, project_id: newId }
      if ('id' in clone) clone.id = randomUUID()
      const { error } = await supa.from(table).insert(clone)
      if (error) console.warn(`[클론] ${table} 행 복제 실패(계속):`, error.message)
    }
  }
  console.log(`[격리] 클론 프로젝트 = ${newId} (원본 ${SRC_PROJECT} 무손상)`)

  // 3) 풀 파이프라인 실행 (제품 코드 그대로)
  const { runPipeline } = await import('../../../src/lib/writer/pipeline')
  const t0 = Date.now()
  let runError: string | null = null
  try {
    await runPipeline(input, { projectId: newId })
  } catch (e) {
    runError = e instanceof Error ? e.message : String(e)
    console.error('[풀런] 파이프라인 에러:', runError)
  }
  const totalMs = Date.now() - t0

  // 4) 측정 수확 — _progress.jsonl(단계 타임스탬프) + llm_calls(콜별 프로바이더·지연)
  const logDir = path.resolve('logs', newId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stages: any[] = []
  const progressPath = path.join(logDir, '_progress.jsonl')
  if (existsSync(progressPath)) {
    stages = readFileSync(progressPath, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const llmCalls: any[] = []
  const llmDir = path.join(logDir, 'debug', 'llm_calls')
  if (existsSync(llmDir)) {
    for (const f of readdirSync(llmDir)) {
      if (!f.endsWith('.json')) continue
      try {
        const j = JSON.parse(readFileSync(path.join(llmDir, f), 'utf8'))
        const one = Array.isArray(j) ? j : [j]
        for (const c of one) {
          llmCalls.push({
            file: f,
            provider: c.provider,
            model: c.model,
            duration_ms: c.duration_ms,
            input_chars: c.input_chars,
            output_chars: c.output_chars,
            error: c.error ?? null,
          })
        }
      } catch {
        /* skip */
      }
    }
  }
  const stageFiles = existsSync(logDir)
    ? readdirSync(logDir).filter((f) => f.endsWith('.json') || f.endsWith('.md'))
    : []

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        finished_at: new Date().toISOString(),
        src_run: srcRun.id,
        clone_project: newId,
        concurrency: 4,
        total_ms: totalMs,
        run_error: runError,
        stages,
        llm_calls: llmCalls,
        stage_files: stageFiles,
      },
      null,
      2,
    ),
  )
  console.log(
    `[완료] 총 ${(totalMs / 60000).toFixed(1)}분 · 단계 이벤트 ${stages.length} · LLM 콜 ${llmCalls.length} · ${path.basename(OUT)} 기록`,
  )
}

main().catch((e) => {
  console.error('[풀런 실패]', e)
  process.exit(1)
})
