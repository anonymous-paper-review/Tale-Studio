// t0-lint-residual-scope — 잔여 검사 에러가 정말 전부 실험 폴더 것인가.
//   세기만 한다. --fix 실행 없음, 설정 파일 수정 없음(티켓 금지 조항).
// 실행: pnpm lint --format json --output-file <경로> 후
//       node research/experiments/t0-lint-residual-scope/collect.mjs <경로>
import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'

const src = process.argv[2]
if (!src) throw new Error('usage: collect.mjs <eslint-json-path>')
const report = JSON.parse(readFileSync(src, 'utf8'))
const ROOT = process.cwd()

const errors = []
const warnings = []
for (const file of report) {
  const rel = relative(ROOT, file.filePath)
  for (const m of file.messages ?? []) {
    const row = { file: rel, line: m.line, rule: m.ruleId ?? '(파서/설정)', message: String(m.message).slice(0, 160) }
    if (m.severity === 2) errors.push(row)
    else if (m.severity === 1) warnings.push(row)
  }
}

const topDir = (p) => p.split('/')[0] || '(root)'
const cross = {}
for (const e of errors) {
  const d = topDir(e.file)
  ;((cross[d] ??= {})[e.rule] ??= 0)
  cross[d][e.rule]++
}
const byRule = {}
for (const e of errors) byRule[e.rule] = (byRule[e.rule] ?? 0) + 1
const byDir = {}
for (const e of errors) byDir[topDir(e.file)] = (byDir[topDir(e.file)] ?? 0) + 1

const srcErrors = errors.filter((e) => e.file.startsWith('src/'))
const BASELINE = 104
const drift = errors.length ? +((errors.length - BASELINE) / BASELINE).toFixed(3) : null

const out = {
  ticket: 't0-lint-residual-scope',
  date: '2026-08-12',
  method: 'pnpm lint --format json 산출을 (경로 최상위 × 규칙)으로 교차 집계. 수정·자동교정 없음.',
  files_linted: report.length,
  files_with_messages: report.filter((f) => (f.messages ?? []).length).length,
  errors_total: errors.length,
  warnings_total: warnings.length,
  baseline_yesterday: BASELINE,
  drift_vs_baseline: drift,
  drift_outside_20pct: drift == null ? null : Math.abs(drift) > 0.2,
  src_errors_count: srcErrors.length,
  src_errors: srcErrors,
  errors_by_dir: byDir,
  errors_by_rule: byRule,
  cross_dir_rule: cross,
  verdict: srcErrors.length === 0 ? 'src 기여 0 — 가설 유지' : 'src 에러 존재 — 가설 기각',
  warnings_by_rule: warnings.reduce((a, w) => ((a[w.rule] = (a[w.rule] ?? 0) + 1), a), {}),
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`검사 파일 ${out.files_linted} | 에러 ${errors.length} (기준선 ${BASELINE}, 변동 ${drift == null ? 'NA' : (drift * 100).toFixed(1) + '%'}) | 경고 ${warnings.length}`)
console.log('디렉토리별 에러:', JSON.stringify(byDir))
console.log('규칙별 에러:', JSON.stringify(byRule))
console.log(`src/ 에러: ${srcErrors.length} → ${out.verdict}`)
for (const e of srcErrors.slice(0, 40)) console.log(`  ${e.file}:${e.line}  ${e.rule}`)
