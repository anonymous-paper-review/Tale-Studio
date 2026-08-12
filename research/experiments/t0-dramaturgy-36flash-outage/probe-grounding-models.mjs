// 접지 실동작 모델 탐색 (2026-08-11 오후) — probe-websearch-json.mjs 의 후속.
//
// 왜 다시 재나: 앞 프로브는 HTTP/candidates/textLen 만 봤다. 그런데 3.6-flash 의 실제 증상은
//   "응답은 오는데 검색이 발화하지 않는다"(groundingMetadata 부재)라서, **접지 여부를 직접 봐야**
//   판정이 된다. 그리고 앞 프로브는 2모델만 봤다 — stable 계열(3.5-flash 등)은 미검증이다.
//
// 무엇을 고르려는가: 현재 제품은 접지 콜을 claude 로 우회한다(안전하지만 실측 260s vs preview 15s).
//   preview 를 쓰면 빠르지만 모델 수명 리스크가 있다. **stable 이면서 접지가 되는 flash** 가 있으면
//   둘 다 해결된다. 그게 이 프로브의 질문이다.
//
// 실행: node research/experiments/t0-dramaturgy-36flash-outage/probe-grounding-models.mjs
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('/Users/xcape/projects/tale-studio/.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const KEY = env.TALE_GEMINI_API_KEY || env.GEMINI_API_KEY

// 검색 없이는 못 맞히는 질문 — "모델이 검색 불요로 판단"과 "검색 능력 부재"를 분리한다.
const PROMPT =
  '2026년에 실제로 개봉했거나 공개된 재난 소재 영상물 3편을 웹에서 조사해, 제목과 공개 시기를 JSON 배열로만 답하라: [{"title":"...","released":"..."}]'

const MODELS = [
  'gemini-3.5-flash', // 오너 제안 — stable
  'gemini-3-flash-preview', // 앞 프로브에서 접지 확인된 유일 모델 (현행 GROUNDING_MODEL 핀)
  'gemini-3.6-flash', // 현행 기본 — 접지 불능 대조군
  'gemini-2.5-flash', // 구세대 stable
  'gemini-3.1-flash-lite', // lite 계열 참고
]

// 제품 경로는 generateJson 이라 JSON mime 이 항상 붙는다 — 그 조합이 판정 기준.
const ARMS = {
  'tools+json': {
    generationConfig: { responseMimeType: 'application/json' },
    tools: [{ googleSearch: {} }],
  },
  'tools-only': { tools: [{ googleSearch: {} }] },
}

const rows = []
for (const model of MODELS) {
  for (const [tag, extra] of Object.entries(ARMS)) {
    const body = { contents: [{ parts: [{ text: PROMPT }] }], ...extra }
    const t0 = Date.now()
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120000),
        },
      )
      const ms = Date.now() - t0
      const j = await res.json()
      const cand = j.candidates?.[0]
      const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const gm = cand?.groundingMetadata
      const queries = gm?.webSearchQueries ?? []
      rows.push({
        model,
        arm: tag,
        http: res.status,
        candidates: j.candidates?.length ?? 0,
        finish: cand?.finishReason ?? null,
        text_len: text.length,
        grounded: Boolean(gm), // ← 판정의 핵심
        queries: queries.length,
        query_sample: queries.slice(0, 2),
        seconds: +(ms / 1000).toFixed(1),
        error: j.error ? `${j.error.status}: ${String(j.error.message).slice(0, 120)}` : null,
      })
    } catch (e) {
      rows.push({ model, arm: tag, error: `EXC ${e.message}`, seconds: +((Date.now() - t0) / 1000).toFixed(1) })
    }
  }
}

const P = (s, n) => String(s).padEnd(n)
console.log(P('모델', 24) + P('조합', 13) + P('접지', 6) + P('검색어', 7) + P('초', 7) + P('길이', 7) + '비고')
for (const r of rows) {
  console.log(
    P(r.model, 24) +
      P(r.arm, 13) +
      P(r.grounded ? '✅' : '❌', 6) +
      P(r.queries ?? '-', 7) +
      P(r.seconds + 's', 7) +
      P(r.text_len ?? '-', 7) +
      (r.error ? `ERR ${r.error}` : r.candidates === 0 ? '⚠ 빈 candidates' : (r.query_sample ?? []).join(' / ')),
  )
}

console.log('\n[판정] 제품 경로(tools+json)에서 접지가 실제로 발화한 모델:')
const ok = rows.filter((r) => r.arm === 'tools+json' && r.grounded)
console.log(ok.length ? ok.map((r) => `  ${r.model} (${r.seconds}s, 검색어 ${r.queries}개)`).join('\n') : '  없음')
