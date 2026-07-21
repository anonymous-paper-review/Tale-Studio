// shotDesign 모델 벤치오프 — Gemini flash vs Claude Sonnet(버전×thinking) → MD(#parallel-shotdesign 2026-07-21).
//
// 배경: 실 Gemini는 동시 4콜에서 콜당 latency 2.25x 팽창(probe) → 병렬화 speedup 1.06x 소멸.
//   실질 대안 = "콜당 더 빠르거나 더 좋은 모델"로 교체. 동일 실 shotDesign 프롬프트로
//   (1) 속도 = 실측 latency, (2) 품질 = 샷 산문 원문 병기를 MD로 저장한다.
//
// 비교군(사용자 지정: haiku/fable 제외, Sonnet 중심 + thinking):
//   - Gemini 3 Flash (현행 V축 baseline)
//   - Sonnet 4.6 / Sonnet 4.6 +thinking(classic enabled, budget)
//   - Sonnet 5   / Sonnet 5 +thinking(신형 adaptive)
//   thinking은 production claude.ts 미변경 — SDK 직접 호출로 per-variant 주입.
//
// ⚠️ 실 유료 호출. 이중 게이트:
//   RUN_LLM_BAKEOFF=1 GEMINI_API_KEY=… ANTHROPIC_API_KEY=… npx vitest run tests/pipeline/llm_provider_bakeoff.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

import { geminiGenerate } from '@/lib/writer/llm/gemini'
import { parseL4Shots } from '@/lib/writer/pipeline/stages/v4_shots'

const ENABLED = process.env.RUN_LLM_BAKEOFF === '1' && !!process.env.GEMINI_API_KEY && !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
const REAL_RUN = '2beb605c-3892-4fc2-b493-b76b5b071286'
const PROMPT_FILES = (process.env.BAKEOFF_PROMPTS ?? '017').split(',').map((s) => s.trim())
const CLAUDE_MAX_TOKENS = 20000 // 8샷 출력(~6K토큰)+thinking budget 여유. classic thinking은 max_tokens>budget 필수.
const JSON_ENFORCE = '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no commentary. Start with { and end with }.'
const PER_CALL_TIMEOUT = Number(process.env.BAKEOFF_CALL_TIMEOUT ?? 100000) // per-call abort — 폭주 thinking/hang 방어(ms)
const PARTIAL = path.join(process.cwd(), 'docs', '.bakeoff-partial.jsonl') // 증분 기록(타임아웃 생존)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '' })

type Variant =
  | { key: string; label: string; kind: 'gemini'; model: string }
  | { key: string; label: string; kind: 'claude'; model: string; thinking?: Record<string, unknown> }
const VARIANTS: Variant[] = [
  { key: 'gemini_flash', label: 'Gemini 3 Flash', kind: 'gemini', model: 'gemini-3-flash-preview' },
  { key: 'sonnet46', label: 'Sonnet 4.6', kind: 'claude', model: 'claude-sonnet-4-6' },
  { key: 'sonnet46_think', label: 'Sonnet 4.6 +thinking', kind: 'claude', model: 'claude-sonnet-4-6', thinking: { type: 'enabled', budget_tokens: 2048 } },
  { key: 'sonnet5', label: 'Sonnet 5', kind: 'claude', model: 'claude-sonnet-5' },
  { key: 'sonnet5_think', label: 'Sonnet 5 +adaptive', kind: 'claude', model: 'claude-sonnet-5', thinking: { type: 'auto' } },
]

type RealPrompt = { file: string; user: string; system?: string }
function loadPrompts(): RealPrompt[] {
  const dir = path.join(process.cwd(), 'logs', REAL_RUN, 'debug', 'llm_calls')
  return PROMPT_FILES.map((tag) => {
    const f = fs.readdirSync(dir).find((n) => n.startsWith(tag) && /shotDesign_gemini\.json$/.test(n))
    if (!f) throw new Error(`prompt file not found for tag ${tag}`)
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { prompt: string; systemInstruction?: string }
    return { file: f.slice(0, 3), user: j.prompt, system: j.systemInstruction }
  })
}

type Shot = { intent?: { dramatic_purpose?: string }; static_spec?: { first_frame_prompt?: string }; dynamic_spec?: { motion_prompt?: string } }
type CallResult = { key: string; label: string; model: string; file: string; ms: number; outChars: number; thinkChars: number; tokPerSec: number; jsonOk: boolean; shotCount: number; err?: string; shots: Shot[] }

async function callClaude(v: Extract<Variant, { kind: 'claude' }>, pr: RealPrompt): Promise<{ text: string; thinkChars: number }> {
  const req: Record<string, unknown> = {
    model: v.model, max_tokens: CLAUDE_MAX_TOKENS,
    system: (pr.system ?? '') + JSON_ENFORCE,
    messages: [{ role: 'user', content: pr.user }],
  }
  if (v.thinking) req.thinking = v.thinking // thinking 시 temperature 지정 불가(기본 1)
  else if (!v.model.includes('sonnet-5')) req.temperature = 0.6 // Sonnet 5는 temperature deprecated → 생략
  const ac = new AbortController()
  const to = setTimeout(() => ac.abort(new Error(`per-call timeout ${PER_CALL_TIMEOUT}ms`)), PER_CALL_TIMEOUT)
  let r: { content: { type: string; text?: string; thinking?: string }[] }
  try {
    r = (await anthropic.messages.create(req as never, { signal: ac.signal })) as { content: { type: string; text?: string; thinking?: string }[] }
  } finally {
    clearTimeout(to)
  }
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  const thinkChars = r.content.filter((b) => b.type === 'thinking').reduce((a, b) => a + (b.thinking?.length ?? 0), 0)
  return { text, thinkChars }
}

async function runOne(v: Variant, pr: RealPrompt): Promise<CallResult> {
  let text = ''
  let thinkChars = 0
  let err: string | undefined
  const t0 = Date.now()
  try {
    if (v.kind === 'gemini') {
      text = await geminiGenerate(pr.user, { modelName: v.model, systemInstruction: pr.system, temperature: 0.6, expectJson: true })
    } else {
      const r = await callClaude(v, pr)
      text = r.text
      thinkChars = r.thinkChars
    }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e)
  }
  const ms = Date.now() - t0
  let shots: Shot[] = []
  let jsonOk = false
  try {
    const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    shots = parseL4Shots(JSON.parse(cleaned), pr.file) as Shot[]
    jsonOk = true
  } catch {
    /* parse 실패 = 산출물 신뢰성 결함으로 리포트 */
  }
  return {
    key: v.key, label: v.label, model: v.model, file: pr.file,
    ms, outChars: text.length, thinkChars, tokPerSec: ms > 0 ? Math.round(text.length / 4 / (ms / 1000)) : 0,
    jsonOk, shotCount: shots.length, err, shots,
  }
}

function md(results: CallResult[], prompts: RealPrompt[]): string {
  const L: string[] = []
  L.push('# shotDesign 모델 벤치오프 — Gemini flash vs Claude Sonnet')
  L.push('')
  L.push(`> 생성 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · 실 run \`${REAL_RUN}\`의 shotDesign 프롬프트 재실행 (${prompts.map((p) => p.file).join(',')}).`)
  L.push('> 계기: 실 Gemini 동시 4콜 = 콜당 latency 2.25x 팽창 → 병렬화 speedup 1.06x 소멸. 대안 = 콜당 빠르거나 좋은 모델.')
  L.push(`> temperature 0.6(thinking 변형은 기본 1), Claude max_tokens ${CLAUDE_MAX_TOKENS}. 속도는 프롬프트 ${prompts.length}개 표본(지표용).`)
  L.push('')
  L.push('## 1. 속도 & 산출 신뢰성')
  L.push('')
  L.push('| 모델 | 평균 latency | ' + prompts.map((p) => p.file).join(' | ') + ' | 출력자수 | thinking자수 | ~tok/s | JSON | 샷수 |')
  L.push('|---|---:|' + prompts.map(() => '---:').join('|') + '|---:|---:|---:|:--:|---:|')
  for (const v of VARIANTS) {
    const rs = results.filter((r) => r.key === v.key)
    if (!rs.length) continue
    const per = prompts.map((pr) => {
      const r = rs.find((x) => x.file === pr.file)
      return r ? `${(r.ms / 1000).toFixed(1)}s${r.err ? '❌' : ''}` : '—'
    })
    const avg = rs.reduce((a, r) => a + r.ms, 0) / rs.length / 1000
    const okAll = rs.every((r) => r.jsonOk)
    L.push(`| **${v.label}** \`${v.model}\` | ${avg.toFixed(1)}s | ${per.join(' | ')} | ${Math.round(rs.reduce((a, r) => a + r.outChars, 0) / rs.length)} | ${Math.round(rs.reduce((a, r) => a + r.thinkChars, 0) / rs.length) || '—'} | ${Math.round(rs.reduce((a, r) => a + r.tokPerSec, 0) / rs.length)} | ${okAll ? '✅' : '⚠️'} | ${rs.map((r) => r.shotCount).join('/')} |`)
  }
  L.push('')
  const errs = results.filter((r) => r.err)
  if (errs.length) { L.push('**에러:**'); for (const e of errs) L.push(`- ${e.label} · ${e.file}: \`${e.err?.slice(0, 200)}\``); L.push('') }

  const gAvg = avgMs(results, 'gemini_flash')
  const rank = VARIANTS.map((v) => ({ v, avg: avgMs(results, v.key) })).filter((x) => x.avg > 0).sort((a, b) => a.avg - b.avg)
  L.push('**속도 순위**: ' + rank.map((x, i) => `${i + 1}) ${x.v.label} ${(x.avg / 1000).toFixed(1)}s`).join(' · '))
  if (rank[0] && gAvg > 0) {
    const f = rank[0]
    L.push('')
    L.push(f.v.key === 'gemini_flash'
      ? `→ **Gemini flash가 여전히 최속.** Sonnet 교체는 속도가 아니라 품질 근거로만 정당화됨.`
      : `→ **${f.v.label}가 Gemini flash 대비 ${(gAvg / f.avg).toFixed(2)}x ${gAvg > f.avg ? '빠름' : '느림'}.**`)
  }
  L.push('')

  L.push('## 2. 품질 — 동일 프롬프트 샷 산문 원문 (육안 판정용)')
  L.push('')
  const SHOT_IDX = [0, 1]
  for (const pr of prompts) {
    L.push(`### 프롬프트 \`${pr.file}\``)
    L.push('')
    for (const si of SHOT_IDX) {
      L.push(`#### shot ${si + 1}`)
      L.push('')
      for (const field of [
        { k: 'dramatic_purpose', get: (s: Shot) => s.intent?.dramatic_purpose },
        { k: 'first_frame_prompt', get: (s: Shot) => s.static_spec?.first_frame_prompt },
        { k: 'motion_prompt', get: (s: Shot) => s.dynamic_spec?.motion_prompt },
      ]) {
        L.push(`**${field.k}**`)
        L.push('')
        for (const v of VARIANTS) {
          const r = results.find((x) => x.key === v.key && x.file === pr.file)
          const val = r?.shots[si] ? field.get(r.shots[si]) : undefined
          L.push(`- **${v.label}**: ${val ? String(val).replace(/\n/g, ' ') : '_(없음/파싱실패)_'}`)
        }
        L.push('')
      }
    }
  }
  L.push('## 3. 판정')
  L.push('- **속도**: 위 표(단일 표본이면 지표용). Gemini flash가 보통 최속.')
  L.push('- **품질**: 위 산문을 직접 비교 — 디테일 밀도, 촬영·조명 구체성, 한글 자연스러움, 프롬프트로서의 실용성.')
  L.push('- **thinking**: 산출 개선 대비 latency 증가가 값하는지(shotDesign은 대량 반복이라 콜당 시간이 병목).')
  L.push('')
  return L.join('\n')
}
function avgMs(results: CallResult[], key: string): number {
  const rs = results.filter((r) => r.key === key && r.ms > 0 && !r.err)
  return rs.length ? rs.reduce((a, r) => a + r.ms, 0) / rs.length : 0
}

describe('shotDesign 모델 벤치오프 (Gemini vs Sonnet×thinking)', () => {
  it.skipIf(!ENABLED)(
    '동일 프롬프트로 속도·품질 비교 후 MD 저장',
    async () => {
      const prompts = loadPrompts()
      const results: CallResult[] = []
      fs.writeFileSync(PARTIAL, '') // 증분 로그 초기화
      for (const pr of prompts) {
        for (const v of VARIANTS) {
          const r = await runOne(v, pr)
          results.push(r)
          fs.appendFileSync(PARTIAL, JSON.stringify({ key: r.key, label: r.label, file: r.file, ms: r.ms, outChars: r.outChars, thinkChars: r.thinkChars, jsonOk: r.jsonOk, shotCount: r.shotCount, err: r.err ?? null, sampleShot: r.shots[0] ?? null }) + '\n')
          console.log(`[bakeoff] ${v.label.padEnd(22)} ${pr.file}  ${(r.ms / 1000).toFixed(1).padStart(5)}s  out=${String(r.outChars).padStart(5)}  think=${String(r.thinkChars).padStart(4)}  json=${r.jsonOk ? 'ok' : 'FAIL'}  shots=${r.shotCount}${r.err ? '  ERR=' + r.err.slice(0, 70) : ''}`)
        }
      }
      const outPath = path.join(process.cwd(), 'docs', `shotdesign-model-bakeoff-${new Date().toISOString().slice(0, 10)}.md`)
      fs.writeFileSync(outPath, md(results, prompts), 'utf8')
      console.log(`\n📄 MD 저장: ${outPath}\n`)
      for (const v of VARIANTS) expect(results.some((r) => r.key === v.key)).toBe(true)
      expect(fs.existsSync(outPath)).toBe(true)
    },
    600_000,
  )
})
