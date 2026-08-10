// Flash 모델 A/B 프로브 — HYPOTHESIS.md 의 측정 절차.
//   재현성 3규칙: 제품 geminiGenerate/repairJson/raw_collector 를 그대로 import(복붙 없음).
//   입력은 fixture.json(런 5260d92d… seq36 shotDesign 호출의 prompt+system)으로 고정.
//   파라미터는 제품 그대로: temperature 0.6(v4_shots.ts:501), expectJson(application/json),
//   safety BLOCK_NONE·timeout 120s·withLlmRetry 4회는 geminiGenerate 내장.
// 실행: pnpm dlx tsx research/experiments/flash-model-ab/probe.mts
import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

// gemini.ts 는 모듈 로드 시점에 process.env 를 읽으므로 dotenv 이후 동적 import (정적 import 는 호이스팅됨)
const { geminiGenerate } = await import('@/lib/writer/llm/gemini')
const { repairJson } = await import('@/lib/writer/llm/json_repair')
const { getUsageTotals, flushRawCalls } = await import('@/lib/writer/llm/raw_collector')

const DIR = dirname(fileURLToPath(import.meta.url))
const RESULTS = join(DIR, 'results')
mkdirSync(RESULTS, { recursive: true })

interface Fixture {
  source: Record<string, unknown>
  temperature: number
  expectJson: boolean
  systemInstruction: string
  prompt: string
}
const fixture: Fixture = JSON.parse(readFileSync(join(DIR, 'fixture.json'), 'utf8'))

// 사전 등록 모델 4종 — 전부 2026-08-10 ListModels 실측 존재 확인됨
const MODELS = [
  'gemini-3-flash-preview', // 제품 기본 (대조군)
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
]
const REPS = 3
const INTER_CALL_MS = 2000 // 쿼터 배려 간격 (측정 구간 밖)

interface CallResult {
  model: string
  rep: number
  wall_ms: number
  instrument_duration_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  finish_reason: string | null
  parse_status: 'strict' | 'repaired' | 'failed' | 'no_response'
  rate_limit_hits_delta: number
  error: string | null
  response_chars: number
  response: string
  started_at: string
}

function parseStatus(text: string): CallResult['parse_status'] {
  try {
    JSON.parse(text)
    return 'strict'
  } catch {
    try {
      repairJson(text)
      return 'repaired'
    } catch {
      return 'failed'
    }
  }
}

const results: CallResult[] = []

for (let rep = 1; rep <= REPS; rep++) {
  for (const model of MODELS) {
    flushRawCalls() // 이전 콜 기록 비우기 — 직후 flush 가 이번 콜만 담게
    const hitsBefore = getUsageTotals().rateLimitHits
    const startedAt = new Date().toISOString()
    const t0 = performance.now()
    let text = ''
    let error: string | null = null
    try {
      text = await geminiGenerate(fixture.prompt, {
        modelName: model,
        systemInstruction: fixture.systemInstruction,
        temperature: fixture.temperature,
        expectJson: fixture.expectJson,
      })
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    const wallMs = Math.round(performance.now() - t0)
    const raw = flushRawCalls().at(-1) ?? null // 제품 계기(recordRawCall)의 같은 콜 기록
    const r: CallResult = {
      model,
      rep,
      wall_ms: wallMs,
      instrument_duration_ms: raw?.duration_ms ?? null,
      input_tokens: raw?.input_tokens ?? null,
      output_tokens: raw?.output_tokens ?? null,
      finish_reason: raw?.finish_reason ?? null,
      parse_status: text ? parseStatus(text) : 'no_response',
      rate_limit_hits_delta: getUsageTotals().rateLimitHits - hitsBefore,
      error,
      response_chars: text.length,
      response: text,
      started_at: startedAt,
    }
    results.push(r)
    writeFileSync(join(RESULTS, `${model}_rep${rep}.json`), JSON.stringify(r, null, 2))
    console.log(
      `${model} rep${rep}: wall=${wallMs}ms out_tok=${r.output_tokens} parse=${r.parse_status}` +
        (r.rate_limit_hits_delta ? ` RATE_LIMIT_HITS=${r.rate_limit_hits_delta}` : '') +
        (error ? ` ERROR=${error.slice(0, 120)}` : ''),
    )
    await new Promise((res) => setTimeout(res, INTER_CALL_MS))
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)
}

const summary = MODELS.map((model) => {
  const rs = results.filter((r) => r.model === model)
  return {
    model,
    wall_ms: rs.map((r) => r.wall_ms),
    median_wall_ms: median(rs.map((r) => r.wall_ms)),
    output_tokens: rs.map((r) => r.output_tokens),
    parse: rs.map((r) => r.parse_status),
    parse_ok: rs.filter((r) => r.parse_status === 'strict' || r.parse_status === 'repaired').length,
    rate_limit_hits: rs.reduce((a, r) => a + r.rate_limit_hits_delta, 0),
    errors: rs.filter((r) => r.error).length,
  }
})

writeFileSync(
  join(DIR, 'provenance.json'),
  JSON.stringify(
    {
      experiment: 'flash-model-ab',
      executed_at: new Date().toISOString(),
      fixture_source: fixture.source,
      fixture_chars: { system: fixture.systemInstruction.length, prompt: fixture.prompt.length },
      params: {
        temperature: fixture.temperature,
        response_mime: 'application/json',
        safety: 'BLOCK_NONE (제품 기본)',
        timeout_ms: 120000,
        retry: 'withLlmRetry 4회 (제품 기본)',
        inter_call_ms: INTER_CALL_MS,
        order: 'rep 단위 라운드로빈 순차',
      },
      models: MODELS,
      reps: REPS,
      call_path: 'geminiGenerate(fixture.prompt, {modelName, systemInstruction, temperature, expectJson}) — src/lib/writer/llm/gemini.ts',
      node: process.version,
      summary,
    },
    null,
    2,
  ),
)
writeFileSync(join(DIR, 'results', 'summary.json'), JSON.stringify(summary, null, 2))
console.log('\nsummary:')
for (const s of summary) {
  console.log(
    `  ${s.model}: median=${s.median_wall_ms}ms parse_ok=${s.parse_ok}/${REPS}` +
      (s.rate_limit_hits ? ` rate_limit_hits=${s.rate_limit_hits}` : '') +
      (s.errors ? ` errors=${s.errors}` : ''),
  )
}
