// t0-shotcheck-issue-volume-correlation — 검수 벽시계가 "샷 수"보다 "지적 건수"에 붙어 있는가.
//   기존 기록 재분석만(새 LLM 호출 0). 상관은 코드로 계산(피어슨 + 스피어만).
// 실행: node research/experiments/t0-shotcheck-issue-volume-correlation/collect.mjs
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'

const LOGS = 'logs'

// ── 표본 수집 ───────────────────────────────────────────────────────────────
const rows = []
for (const dir of readdirSync(LOGS)) {
  const p = `${LOGS}/${dir}`
  if (!existsSync(`${p}/_progress.jsonl`)) continue
  const ev = readFileSync(`${p}/_progress.jsonl`, 'utf8')
    .trim().split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const st = ev.find((o) => o.stage === 'shotCheck' && o.status === 'started')
  const en = ev.find((o) => o.stage === 'shotCheck' && o.status === 'completed')
  if (!st || !en) continue
  const seconds = (new Date(en.timestamp) - new Date(st.timestamp)) / 1000

  // 지적 건수 ①: 저장된 리포트의 병합 이슈(코드 산출 + 모델 산출 합)
  let reportIssues = null
  if (existsSync(`${p}/12_c2_shotCheck.json`)) {
    const rep = JSON.parse(readFileSync(`${p}/12_c2_shotCheck.json`, 'utf8'))
    reportIssues = Array.isArray(rep.issues) ? rep.issues.length : null
  }

  // 지적 건수 ②: 모델이 실제로 낸 semantic_issues — 디버그 원본 응답에서 직접 센다(추정 없음).
  let semantic = null
  let llmCalls = 0
  let promptShots = 0
  const dbg = `${p}/debug/llm_calls`
  if (existsSync(dbg)) {
    let acc = 0
    for (const f of readdirSync(dbg).filter((f) => /shotCheck.*validate/.test(f))) {
      const rec = JSON.parse(readFileSync(`${dbg}/${f}`, 'utf8'))
      let resp = rec.response
      if (typeof resp === 'string') { try { resp = JSON.parse(resp) } catch { resp = null } }
      if (resp && Array.isArray(resp.semantic_issues)) acc += resp.semantic_issues.length
      llmCalls++
      // 프롬프트에 들어간 샷 수 — "shot_id" 등장 횟수(샷 시퀀스 블록). 팬아웃이면 호출별 합.
      promptShots += (String(rec.prompt).match(/"shot_id"/g) ?? []).length
    }
    semantic = llmCalls ? acc : null
  }

  // 입력 샷 수: v4 설계 산출이 있으면 그 길이, 없으면 최종 샷 수 − 분할 수.
  let inputShots = null
  if (existsSync(`${p}/11_v4_shotDesign.json`)) {
    const v4 = JSON.parse(readFileSync(`${p}/11_v4_shotDesign.json`, 'utf8'))
    inputShots = v4.shots?.length ?? null
  } else if (en.extra?.final_shot_count != null) {
    inputShots = en.extra.final_shot_count - (en.extra.split_count ?? 0)
  }

  rows.push({
    run: dir,
    seconds,
    input_shots: inputShots,
    report_issues: reportIssues,
    semantic_issues: semantic,
    llm_calls: llmCalls,
    prompt_shot_mentions: promptShots || null,
    fanout: llmCalls > 1,
    final_shot_count: en.extra?.final_shot_count ?? null,
    split_count: en.extra?.split_count ?? null,
  })
}

// ── 유효성 필터 ─────────────────────────────────────────────────────────────
// 모델 호출이 0인 실행(=resume/캐시)은 shotCheck 실행이 아니다 — 벽시계가 검수 비용을 담지 않는다.
const invalid = rows.filter((r) => r.llm_calls === 0 || r.seconds < 5)
const valid = rows.filter((r) => !invalid.includes(r) && r.input_shots != null && r.seconds != null)

// ── 상관 ────────────────────────────────────────────────────────────────────
const pearson = (xs, ys) => {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}
const rank = (xs) => {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const r = new Array(xs.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}
const spearman = (xs, ys) => pearson(rank(xs), rank(ys))

function corrSet(sample, label) {
  const withSem = sample.filter((r) => r.semantic_issues != null)
  const secs = sample.map((r) => r.seconds)
  const out = {
    label,
    n: sample.length,
    runs: sample.map((r) => r.run),
    shots_vs_seconds: { pearson: pearson(sample.map((r) => r.input_shots), secs), spearman: spearman(sample.map((r) => r.input_shots), secs) },
    report_issues_vs_seconds: (() => {
      const s = sample.filter((r) => r.report_issues != null)
      return s.length ? { n: s.length, pearson: pearson(s.map((r) => r.report_issues), s.map((r) => r.seconds)), spearman: spearman(s.map((r) => r.report_issues), s.map((r) => r.seconds)) } : null
    })(),
    semantic_issues_vs_seconds: withSem.length
      ? { n: withSem.length, pearson: pearson(withSem.map((r) => r.semantic_issues), withSem.map((r) => r.seconds)), spearman: spearman(withSem.map((r) => r.semantic_issues), withSem.map((r) => r.seconds)) }
      : null,
  }
  return out
}

const singleCall = valid.filter((r) => !r.fanout)
// 픽스처 고정 부분집합 — 같은 입력(같은 샷 수)으로 반복한 실행만. 샷 수가 상수라 시간 변동을
//   설명할 수 없다 → 지적 건수 효과만 남는 가장 깨끗한 대조군(표본은 작다).
//   팬아웃 실행은 호출 수 자체가 다른 체제라 같은 입력이어도 같은 대조군이 아니다 → 단일 호출만.
const byShots = {}
for (const r of singleCall) (byShots[r.input_shots] ??= []).push(r)
const fixtureFixed = Object.values(byShots).sort((a, b) => b.length - a.length)[0] ?? []
const analysis = {
  all_valid: corrSet(valid, '유효 표본 전체(팬아웃 포함)'),
  single_call: singleCall.length >= 3 ? corrSet(singleCall, '단일 호출 실행만(팬아웃 제외)') : { label: '단일 호출 실행만', n: singleCall.length, note: '표본 부족' },
  fixture_fixed: fixtureFixed.length >= 3
    ? { ...corrSet(fixtureFixed, `입력 고정(샷 ${fixtureFixed[0].input_shots}개) 반복 실행만`), input_shots: fixtureFixed[0].input_shots, seconds: fixtureFixed.map((r) => r.seconds), issues: fixtureFixed.map((r) => r.report_issues) }
    : { label: '입력 고정 부분집합', n: fixtureFixed.length, note: '표본 부족' },
}

const out = {
  ticket: 't0-shotcheck-issue-volume-correlation',
  date: '2026-08-12',
  source: 'logs/*/_progress.jsonl + 12_c2_shotCheck.json + debug/llm_calls/*shotCheck*validate*.json (재분석 전용, 새 호출 0)',
  sample_rule: '모델 호출 0 또는 벽시계 <5초인 실행은 검수 미실행(resume/캐시)으로 제외',
  rows,
  excluded: invalid.map((r) => ({ run: r.run, seconds: r.seconds, llm_calls: r.llm_calls })),
  valid_n: valid.length,
  analysis,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))

const f = (v) => (v == null ? 'NA' : v.toFixed(3))
console.log(`유효 표본 ${valid.length} (제외 ${invalid.length})`)
console.log('run | secs | inputShots | reportIssues | semanticIssues | calls')
for (const r of valid) console.log(` ${r.run.slice(0, 26)} | ${r.seconds} | ${r.input_shots} | ${r.report_issues} | ${r.semantic_issues} | ${r.llm_calls}`)
for (const a of [analysis.all_valid, analysis.single_call, analysis.fixture_fixed]) {
  if (a.n < 3) { console.log(`${a.label}: n=${a.n} ${a.note ?? ''}`); continue }
  console.log(`\n[${a.label}] n=${a.n}`)
  console.log(`  샷수↔시간      r=${f(a.shots_vs_seconds.pearson)} ρ=${f(a.shots_vs_seconds.spearman)}`)
  if (a.report_issues_vs_seconds) console.log(`  전체지적↔시간  r=${f(a.report_issues_vs_seconds.pearson)} ρ=${f(a.report_issues_vs_seconds.spearman)} (n=${a.report_issues_vs_seconds.n})`)
  if (a.semantic_issues_vs_seconds) console.log(`  모델지적↔시간  r=${f(a.semantic_issues_vs_seconds.pearson)} ρ=${f(a.semantic_issues_vs_seconds.spearman)} (n=${a.semantic_issues_vs_seconds.n})`)
}
