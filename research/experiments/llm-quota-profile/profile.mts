// LLM 쿼터 프로파일러 (#llm-quota 2026-08-10)
//
// 목적: "유저 N명이면 분당 몇 콜·몇 토큰을 쓰는가"를 추정이 아니라 실측 로그에서 뽑는다.
//   Gemini 한도는 RPM(분당 요청) / TPM(분당 입력 토큰) / RPD(일당 요청) 세 축이고
//   **API 키가 아니라 GCP 프로젝트 단위**로 걸린다 — 즉 전 유저가 한 통을 나눠 쓴다.
//   따라서 필요한 것은 "유저당 토큰"이 아니라 **동시에 돌 수 있는 런 수(K)** 다.
//
// 좌표: 입력 = logs/<runId>/debug/llm_calls/*_{gemini,claude,openai,local}.json
//   (recordRawCall 원본 포맷. 2026-08-10 이후 런은 input_tokens/output_tokens 실측 포함,
//    그 이전 런은 chars/4 폴백으로 근사하며 출력에 APPROX 로 표시한다.)
//
// 사용:
//   pnpm dlx tsx research/experiments/llm-quota-profile/profile.mts <runId> [--rpm 1000] [--tpm 1000000]
//   한도 값은 https://aistudio.google.com/rate-limit 에서 자기 프로젝트/티어의 실제 숫자를 본다.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RawLlmCall } from '../../../src/lib/writer/llm/raw_collector'

const CHARS_PER_TOKEN = 4 // 토큰 미보고 런의 폴백 계수(한국어 혼합 프롬프트 기준 보수적 근사)
const WINDOW_MS = 60_000

interface Sample {
  t: number
  stage: string
  provider: string
  inTok: number
  outTok: number
  approx: boolean
  ms: number
}

function loadRun(runId: string): Sample[] {
  const dir = join('logs', runId, 'debug', 'llm_calls')
  const files = readdirSync(dir).filter((f) => /_(gemini|claude|openai|local)\.json$/.test(f))
  if (files.length === 0) throw new Error(`${dir}: recordRawCall 원본 파일이 없다`)
  return files.map((f) => {
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8')) as RawLlmCall
    const approx = c.input_tokens === undefined
    return {
      t: Date.parse(c.timestamp),
      stage: f.replace(/^\d+_/, '').replace(/_(gemini|claude|openai|local)\.json$/, '').replace(/_scene_\d+(_shot_\d+)?$/, ''),
      provider: c.provider,
      inTok: c.input_tokens ?? Math.round(c.input_chars / CHARS_PER_TOKEN),
      outTok: c.output_tokens ?? Math.round(c.output_chars / CHARS_PER_TOKEN),
      approx,
      ms: c.duration_ms,
    }
  })
}

/** 1분 슬라이딩 윈도우 피크 — 분 단위 버킷은 경계에서 피크를 놓친다. */
function slidingPeak(samples: Sample[]): { peakRpm: number; peakInTpm: number } {
  const sorted = [...samples].sort((a, b) => a.t - b.t)
  let peakRpm = 0
  let peakInTpm = 0
  for (let i = 0; i < sorted.length; i++) {
    let calls = 0
    let tok = 0
    for (let j = i; j < sorted.length && sorted[j].t - sorted[i].t < WINDOW_MS; j++) {
      calls++
      tok += sorted[j].inTok
    }
    peakRpm = Math.max(peakRpm, calls)
    peakInTpm = Math.max(peakInTpm, tok)
  }
  return { peakRpm, peakInTpm }
}

function main() {
  const [runId, ...rest] = process.argv.slice(2)
  if (!runId) throw new Error('usage: profile.mts <runId> [--rpm N] [--tpm N]')
  const arg = (name: string) => {
    const i = rest.indexOf(`--${name}`)
    return i >= 0 ? Number(rest[i + 1]) : undefined
  }
  const limitRpm = arg('rpm')
  const limitTpm = arg('tpm')

  const samples = loadRun(runId)
  const byProvider = new Map<string, Sample[]>()
  for (const s of samples) {
    if (!byProvider.has(s.provider)) byProvider.set(s.provider, [])
    byProvider.get(s.provider)!.push(s)
  }

  const t0 = Math.min(...samples.map((s) => s.t))
  const t1 = Math.max(...samples.map((s) => s.t))
  const wallS = (t1 - t0) / 1000
  const approx = samples.some((s) => s.approx)

  console.log(`\n== 런 ${runId} ==${approx ? '  (APPROX: 토큰 미보고 콜 포함 — chars/4 근사)' : ''}`)
  console.log(`콜 ${samples.length}회 · 벽시계 ${wallS.toFixed(0)}s`)

  // 스테이지별
  const stages = new Map<string, { n: number; inTok: number; outTok: number; ms: number }>()
  for (const s of samples) {
    const a = stages.get(s.stage) ?? { n: 0, inTok: 0, outTok: 0, ms: 0 }
    a.n++
    a.inTok += s.inTok
    a.outTok += s.outTok
    a.ms += s.ms
    stages.set(s.stage, a)
  }
  console.log('\nstage                    calls    in_tok   out_tok  avg_s')
  for (const [name, a] of [...stages].sort((x, y) => y[1].n - x[1].n)) {
    console.log(
      `${name.padEnd(24)} ${String(a.n).padStart(5)} ${a.inTok.toLocaleString().padStart(9)} ${a.outTok
        .toLocaleString()
        .padStart(9)} ${(a.ms / a.n / 1000).toFixed(1).padStart(6)}`,
    )
  }

  // 프로바이더별 피크 — 한도는 프로바이더(=프로젝트)마다 따로 걸린다.
  console.log('\n프로바이더별 1런 부하 (1분 슬라이딩 피크):')
  for (const [prov, list] of byProvider) {
    const { peakRpm, peakInTpm } = slidingPeak(list)
    const totalIn = list.reduce((n, s) => n + s.inTok, 0)
    const totalOut = list.reduce((n, s) => n + s.outTok, 0)
    console.log(
      `  ${prov}: 콜 ${list.length} · 입력 ${totalIn.toLocaleString()}tok · 출력 ${totalOut.toLocaleString()}tok` +
        ` · peak RPM ${peakRpm} · peak in-TPM ${peakInTpm.toLocaleString()}`,
    )
    if (limitRpm || limitTpm) {
      const kRpm = limitRpm ? Math.floor(limitRpm / Math.max(peakRpm, 1)) : Infinity
      const kTpm = limitTpm ? Math.floor(limitTpm / Math.max(peakInTpm, 1)) : Infinity
      const k = Math.min(kRpm, kTpm)
      const binding = kRpm <= kTpm ? 'RPM' : 'TPM'
      console.log(
        `    → 한도(RPM ${limitRpm ?? '-'} / TPM ${limitTpm ?? '-'}) 기준 동시 런 K=${k} (병목: ${binding})` +
          ` · 안전계수 0.7 적용 시 ${Math.floor(k * 0.7)}`,
      )
      console.log(
        `    → 런 지속 ${wallS.toFixed(0)}s 기준: 시간당 처리 가능 런 ≈ ${Math.floor((k * 3600) / wallS)}건`,
      )
    }
  }

  if (!limitRpm && !limitTpm) {
    console.log(
      '\n한도를 주면 동시 런 수까지 계산한다: --rpm <값> --tpm <값>' +
        ' (자기 프로젝트 실제 한도는 https://aistudio.google.com/rate-limit)',
    )
  }
}

main()
