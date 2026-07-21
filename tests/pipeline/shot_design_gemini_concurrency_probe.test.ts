// shotDesign 병렬화 — 실 Gemini 동시성 latency 프로브(#parallel-shotdesign 2026-07-21).
//
// 목적: A/B 리플레이 실험(shot_design_concurrency_ab)이 검증 못 한 단 하나의 가정 —
//   "콜당 latency는 동시성과 무관하게 일정하다" — 을 실 API로 검증한다.
//   리플레이가 쓴 duration_ms는 전부 '순차 실행 중' 측정값이라, 실 Gemini가 동시 4콜에서
//   rate-limit(429→retry)나 서버 경합으로 콜당 시간이 늘면 리플레이의 speedup은 과대평가다.
//   여기선 실 shotDesign 프롬프트를 순차 vs 동시(=production 기본 concurrency 4)로 쏴서
//   콜당 latency 유지 여부와 실제 wall-clock 단축을 실측한다.
//
// ⚠️ 실 Gemini 호출 = 과금·비결정. 이중 게이트로 평소/CI에선 스킵:
//   RUN_GEMINI_PROBE=1 GEMINI_API_KEY=… npx vitest run tests/pipeline/shot_design_gemini_concurrency_probe.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { geminiGenerate, resetGeminiCallCount } from '@/lib/writer/llm/gemini'
import { getPendingRawCalls, resetRawSeq } from '@/lib/writer/llm/raw_collector'

const ENABLED = process.env.RUN_GEMINI_PROBE === '1' && !!process.env.GEMINI_API_KEY
const REAL_RUN = '2beb605c-3892-4fc2-b493-b76b5b071286'
const K = Math.max(2, Number(process.env.PROBE_K ?? 4)) // 동시콜 수(기본 4 = production 기본 concurrency)
const MODEL = 'gemini-3-flash-preview'

type Prompt = { prompt: string; systemInstruction?: string; label: string }

/** 실 run의 shotDesign 프롬프트 K개(입력·출력 크기가 실제와 동일 → 대표성 최상). */
function loadRealPrompts(k: number): Prompt[] {
  const dir = path.join(process.cwd(), 'logs', REAL_RUN, 'debug', 'llm_calls')
  const files = fs.readdirSync(dir).filter((f) => /shotDesign_gemini\.json$/.test(f)).sort().slice(0, k)
  return files.map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { prompt: string; systemInstruction?: string }
    return { prompt: j.prompt, systemInstruction: j.systemInstruction, label: f.slice(0, 3) }
  })
}

async function fire(p: Prompt): Promise<void> {
  // geminiGenerate는 finally에서 duration_ms를 raw_collector에 기록한다(성공/실패 무관).
  //   실패해도 latency 관측이 목적이므로 삼켜서 다른 콜을 죽이지 않는다.
  try {
    await geminiGenerate(p.prompt, { modelName: MODEL, systemInstruction: p.systemInstruction, temperature: 0.6, expectJson: true })
  } catch {
    /* 429 소진/파싱 실패 등 — duration은 이미 기록됨 */
  }
}

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b)
  const median = s.length ? s[Math.floor(s.length / 2)] : 0
  const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0
  return { median, mean, min: s[0] ?? 0, max: s[s.length - 1] ?? 0 }
}

describe('shotDesign 실 Gemini 동시성 latency 프로브', () => {
  it.skipIf(!ENABLED)(
    `순차 vs 동시(${K}콜) — 콜당 latency 유지 & wall-clock 단축 실측`,
    async () => {
      const prompts = loadRealPrompts(K)
      expect(prompts.length).toBe(K)

      // ── 순차 baseline ──
      resetRawSeq()
      resetGeminiCallCount()
      const seqT0 = performance.now()
      for (const p of prompts) await fire(p)
      const seqWall = performance.now() - seqT0
      const seqCalls = getPendingRawCalls()
      const seqErr = seqCalls.filter((c) => c.error).length
      const seqDur = stats(seqCalls.map((c) => c.duration_ms))

      // ── 동시(K-way, production 기본값) ──
      resetRawSeq()
      resetGeminiCallCount()
      const concT0 = performance.now()
      await Promise.all(prompts.map(fire))
      const concWall = performance.now() - concT0
      const concCalls = getPendingRawCalls()
      const concErr = concCalls.filter((c) => c.error).length
      const concDur = stats(concCalls.map((c) => c.duration_ms))

      const inflation = seqDur.median > 0 ? concDur.median / seqDur.median : 0
      const wallSpeedup = concWall > 0 ? seqWall / concWall : 0

      const report = [
        '',
        '━━━ shotDesign 실 Gemini 동시성 프로브 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `모델: ${MODEL}   실 프롬프트 ${K}개 [${prompts.map((p) => p.label).join(',')}]`,
        '',
        '            │  콜당 median │  콜당 mean │ min–max        │ 에러 │ wall',
        '────────────┼──────────────┼────────────┼────────────────┼──────┼───────',
        `순차 (1×)   │ ${(seqDur.median / 1000).toFixed(1).padStart(9)}s │ ${(seqDur.mean / 1000).toFixed(1).padStart(7)}s │ ${(seqDur.min / 1000).toFixed(1)}–${(seqDur.max / 1000).toFixed(1)}s`.padEnd(58) + `│ ${String(seqErr).padStart(4)} │ ${(seqWall / 1000).toFixed(1)}s`,
        `동시 (${K}×)   │ ${(concDur.median / 1000).toFixed(1).padStart(9)}s │ ${(concDur.mean / 1000).toFixed(1).padStart(7)}s │ ${(concDur.min / 1000).toFixed(1)}–${(concDur.max / 1000).toFixed(1)}s`.padEnd(58) + `│ ${String(concErr).padStart(4)} │ ${(concWall / 1000).toFixed(1)}s`,
        '────────────┴──────────────┴────────────┴────────────────┴──────┴───────',
        `콜당 latency 팽창(동시median/순차median): ${inflation.toFixed(2)}x  ${inflation < 1.3 ? '→ 가정 성립(동시성 무해)' : '→ 경고: 동시성이 콜을 느리게 함'}`,
        `wall-clock speedup(순차/동시): ${wallSpeedup.toFixed(2)}x  (이상적 ${K}x, 팽창·경합으로 감쇠)`,
        `에러: 순차 ${seqErr} / 동시 ${concErr}  ${concErr > seqErr ? '→ 경고: 동시성에서 실패 증가(rate-limit?)' : '→ 동시성 추가 실패 없음'}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '판정: 팽창<1.3x & 동시에러≤순차 → 리플레이 A/B의 speedup은 실 production에서 유효.',
        '',
      ].join('\n')
      console.log(report)

      // 관측 자체가 성과물 — 실패시키지 않되, 핵심 신호를 assert로 남긴다.
      expect(seqCalls.length).toBe(K)
      expect(concCalls.length).toBe(K)
      // 동시 wall < 순차 wall 이어야 병렬화가 실제로 의미가 있다(팽창이 심하면 이게 깨지고, 그게 결론).
      expect(concWall).toBeLessThan(seqWall)
    },
    240_000,
  )
})
