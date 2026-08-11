// dialogue 병렬 + 사전유도 원장 프로브 — HYPOTHESIS.md 절차.
//   제품 runDialogue 를 그대로 호출한다(복붙 없음). fixture 고정, mode/ledger 옵션만 갈린다.
// 실행: pnpm dlx tsx research/experiments/dialogue-parallel-ledger/probe.mts --arm a-seq [--runs 2]
import { config } from 'dotenv'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

config({ path: '.env.local' })

const FIXTURE = path.resolve('logs/e4da245a-8d89-44e5-8fde-131d016ef2e3')
const OUTDIR = path.resolve('research/experiments/dialogue-parallel-ledger')
const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : def
}
const ARM = arg('--arm', 'a-seq')!
const RUNS = Number(arg('--runs', '2'))
const CONCURRENCY = Number(arg('--concurrency', '5'))

const ARMS: Record<string, { mode?: 'sequential' | 'parallel'; ledger?: boolean; concurrency?: number }> = {
  'a-seq': {},
  'b-ledger': { mode: 'parallel', ledger: true, concurrency: CONCURRENCY },
  'c-blind': { mode: 'parallel', ledger: false, concurrency: CONCURRENCY },
}
if (!ARMS[ARM]) throw new Error(`unknown arm: ${ARM} (${Object.keys(ARMS).join('|')})`)

const readFixture = (f: string) => JSON.parse(readFileSync(path.join(FIXTURE, f), 'utf8'))

// ── 결정론 채점기 ────────────────────────────────────────────────────────
const norm = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
const trigrams = (s: string) => {
  const g = new Set<string>()
  for (let i = 0; i + 3 <= s.length; i += 1) g.add(s.slice(i, i + 3))
  return g
}
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  return inter / (a.size + b.size - inter)
}

async function main() {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const scenes = readFixture('05_s3_scenes.json')
  const decoupage = readFixture('10b_c_decoupage.json')
  const integrated = readFixture('INTEGRATED.json')
  const story = readFileSync(path.join(FIXTURE, '00_input_story.md'), 'utf8')

  const { runDialogue } = await import('../../../src/lib/writer/pipeline/stages/dialogue')
  const { PipelineLogger } = await import('../../../src/lib/writer/logger')
  const { resetRawSeq, getPendingRawCalls, flushRawCalls } = await import(
    '../../../src/lib/writer/llm/raw_collector'
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sceneById = new Map<string, any>(scenes.scenes.map((s: any) => [s.scene_id, s]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs: any[] = []
  for (let i = 1; i <= RUNS; i += 1) {
    const logger = new PipelineLogger(`probe-dlg-${ARM}-r${i}`)
    await logger.init()
    resetRawSeq()

    const t0 = Date.now()
    let error: string | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null
    try {
      result = await runDialogue(
        story,
        integrated.genre,
        integrated.characters,
        scenes,
        decoupage,
        logger,
        { provider: 'gemini', model: 'gemini-3.6-flash' } as never,
        ARMS[ARM] as never,
      )
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    const wallMs = Date.now() - t0

    const raw = getPendingRawCalls()
    flushRawCalls()

    // ── 라인 수집 ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines: { scene_id: string; shot_id: string; character_id: string; line: string }[] = []
    const linesByScene: Record<string, number> = {}
    const fullySilentScenes: string[] = []
    const invalidSpeakers: { scene_id: string; character_id: string }[] = []
    for (const sc of result?.scenes ?? []) {
      let n = 0
      for (const sh of sc.shots ?? []) {
        for (const d of sh.dialogue ?? []) {
          if (typeof d?.line !== 'string' || !d.line.trim()) continue
          lines.push({ scene_id: sc.scene_id, shot_id: sh.shot_id, character_id: d.character_id, line: d.line })
          n += 1
          const cast = sceneById.get(sc.scene_id)?.characters_in_scene ?? []
          if (cast.length && !cast.includes(d.character_id)) {
            invalidSpeakers.push({ scene_id: sc.scene_id, character_id: d.character_id })
          }
        }
      }
      linesByScene[sc.scene_id] = n
      if (n === 0 && (sc.shots ?? []).length > 0) fullySilentScenes.push(sc.scene_id)
    }

    // ── 씬 간 중복 대사 (병렬화의 대가: notable_lines 상실) ──
    const prepped = lines.map((l) => {
      const n = norm(l.line)
      return { ...l, n, g: trigrams(n) }
    })
    let exactDup = 0
    let nearDup = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dupSamples: any[] = []
    for (let a = 0; a < prepped.length; a += 1) {
      for (let b = a + 1; b < prepped.length; b += 1) {
        if (prepped[a].scene_id === prepped[b].scene_id) continue // 씬 내부 반복은 대화 흐름이라 제외
        if (prepped[a].n.length < 2 || prepped[b].n.length < 2) continue
        if (prepped[a].n === prepped[b].n) {
          exactDup += 1
          if (dupSamples.length < 8) dupSamples.push({ kind: 'exact', a: prepped[a], b: prepped[b] })
          continue
        }
        if (prepped[a].n.length < 6 || prepped[b].n.length < 6) continue
        const j = jaccard(prepped[a].g, prepped[b].g)
        if (j >= 0.6) {
          nearDup += 1
          if (dupSamples.length < 8) dupSamples.push({ kind: 'near', j: Number(j.toFixed(2)), a: prepped[a], b: prepped[b] })
        }
      }
    }

    // ── 침묵 예산 (규율 A: 씬 라인 수 ≤ ceil(estimated_seconds / 10)) ──
    let budgetViolations = 0
    const budgetDetail: { scene_id: string; lines: number; cap: number }[] = []
    for (const [sceneId, n] of Object.entries(linesByScene)) {
      const est = sceneById.get(sceneId)?.estimated_seconds ?? 0
      const cap = Math.ceil(est / 10)
      if (cap > 0 && n > cap) {
        budgetViolations += 1
        budgetDetail.push({ scene_id: sceneId, lines: n, cap })
      }
    }

    runs.push({
      run: i,
      arm: ARM,
      opts: ARMS[ARM],
      wall_ms: wallMs,
      error,
      done: result?.done ?? null,
      calls: raw.length,
      call_ms: raw.map((c) => c.duration_ms),
      call_ms_sum: raw.reduce((a, c) => a + (c.duration_ms ?? 0), 0),
      input_tokens: raw.reduce((a, c) => a + (c.input_tokens ?? 0), 0),
      output_tokens: raw.reduce((a, c) => a + (c.output_tokens ?? 0), 0),
      call_errors: raw.filter((c) => c.error).length,
      scene_count: result?.scenes?.length ?? null,
      total_lines: lines.length,
      lines_by_scene: linesByScene,
      fully_silent_scenes: fullySilentScenes,
      cross_scene_exact_dup: exactDup,
      cross_scene_near_dup: nearDup,
      dup_samples: dupSamples,
      silence_budget_violations: budgetViolations,
      silence_budget_detail: budgetDetail,
      invalid_speakers: invalidSpeakers,
      lines_sample: lines.slice(0, 12),
    })
    const r = runs[runs.length - 1]
    console.log(
      `[${ARM} r${i}] wall ${(wallMs / 1000).toFixed(1)}s · 모델시간합 ${(r.call_ms_sum / 1000).toFixed(1)}s · ` +
        `콜 ${r.calls} · 라인 ${r.total_lines} · 씬간중복 ${exactDup}exact/${nearDup}near · ` +
        `침묵예산위반 ${budgetViolations} · 무음씬 ${fullySilentScenes.length}` +
        (error ? ` · ERROR ${error}` : ''),
    )
  }

  mkdirSync(OUTDIR, { recursive: true })
  const out = path.join(OUTDIR, `results-${ARM}.json`)
  writeFileSync(
    out,
    JSON.stringify(
      {
        arm: ARM,
        finished_at: new Date().toISOString(),
        fixture: path.basename(FIXTURE),
        model: 'gemini-3.6-flash',
        concurrency: CONCURRENCY,
        runs,
      },
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
