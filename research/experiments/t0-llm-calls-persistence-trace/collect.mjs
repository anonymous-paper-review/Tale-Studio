// t0-llm-calls-persistence-trace — AI 호출 기록이 "단계 완료 때만" 저장되는가.
//   저장 호출 지점 전수 열거 + 경로 분류(정상 완료 / 예외 / 시간예산 중단) + DB 표본 대조.
//   코드 추적 + 읽기 전용 조회. LLM 판정 없음.
// 실행: node research/experiments/t0-llm-calls-persistence-trace/collect.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

// ── ① 저장 호출 지점 전수 ──────────────────────────────────────────────────
const FILES = [
  'src/lib/writer/pipeline/index.ts',
  'src/lib/writer/pipeline/steps.ts',
  'src/lib/writer/logger/index.ts',
  'src/lib/writer/llm/archive-calls.ts',
]
const SAVE_CALLS = [/flushRawLlm\(/, /archiveRawCalls\(/, /captureErrorDetail\(/]

const sites = []
for (const file of FILES) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return
    if (!SAVE_CALLS.some((re) => re.test(line))) return
    if (/^\s*(export )?(async )?function |^\s*\*/.test(line)) return  // 정의부 제외
    // 경로 분류 — 앞 40줄을 훑어 어느 블록 안인지 본다.
    const before = lines.slice(Math.max(0, i - 40), i).join('\n')
    const inCatch = /\}\s*catch\s*(\([^)]*\))?\s*\{[^}]*$/s.test(before) || /catch \(/.test(lines[i - 1] ?? '')
    const nearCatch = /catch\s*\(/.test(lines.slice(Math.max(0, i - 6), i).join('\n'))
    const nearFail = /markFailed\(|'failed'|failed: true/.test(lines.slice(Math.max(0, i - 3), i + 3).join('\n'))
    // 주의: deadlineMs 는 정상 실행에도 옵션으로 넘어간다 — 단어가 근처에 있다고 중단 경로가 아니다.
    //   중단 경로는 "예산 초과로 실행을 포기하고 빠져나가는" 문장(return paused / break)과 같은 블록일 때만.
    const bail = lines.slice(Math.max(0, i - 6), i + 3).join('\n')
    const nearBail = /return \{ paused: true \}|Date\.now\(\) > opts\.deadlineMs|착수 보류/.test(bail)
    let path
    if (nearFail || nearCatch || inCatch) path = 'b_예외·실패'
    else if (nearBail) path = 'c_시간예산·중단'
    else path = 'a_정상완료'
    sites.push({ file, line: i + 1, path, code: line.trim().slice(0, 150) })
  })
}

// ── ② DB 대조 — 실패한 런에 호출 기록이 남아 있는가 ───────────────────────
const { data: runs } = await db
  .from('writer_runs')
  .select('id,project_id,status,created_at,updated_at,error_detail,error')
  .order('created_at', { ascending: false })
  .limit(80)

const sample = []
for (const r of runs ?? []) {
  const { count } = await db
    .from('llm_calls')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', r.project_id)
  const ed = r.error_detail
  sample.push({
    run_id: r.id,
    project_id: r.project_id,
    status: r.status,
    created_at: r.created_at,
    llm_calls_rows_for_project: count ?? 0,
    has_error_detail: !!ed,
    error_detail_calls: Array.isArray(ed?.calls) ? ed.calls.length : 0,
    error_stage: ed?.stage ?? null,
  })
}
const failed = sample.filter((s) => s.status === 'failed')
const completed = sample.filter((s) => s.status === 'completed')

const out = {
  ticket: 't0-llm-calls-persistence-trace',
  date: '2026-08-12',
  method: '저장 호출 지점 전수 열거 + 경로 분류(코드) + DB 표본 대조(읽기 전용). LLM 판정 없음.',
  save_sites_total: sites.length,
  save_sites_by_path: sites.reduce((a, s) => ((a[s.path] = (a[s.path] ?? 0) + 1), a), {}),
  abort_path_sites: sites.filter((s) => s.path !== 'a_정상완료'),
  sites,
  db_sample: {
    runs_checked: sample.length,
    failed_runs: failed.length,
    failed_with_error_detail: failed.filter((f) => f.has_error_detail).length,
    failed_with_zero_llm_rows: failed.filter((f) => f.llm_calls_rows_for_project === 0).length,
    completed_with_zero_llm_rows: completed.filter((c) => c.llm_calls_rows_for_project === 0).length,
    rows: sample,
  },
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`저장 호출 지점 ${sites.length}곳:`, JSON.stringify(out.save_sites_by_path))
for (const s of out.abort_path_sites) console.log(`  [${s.path}] ${s.file}:${s.line}  ${s.code}`)
console.log(`DB 표본 ${sample.length}런 — 실패 ${failed.length} / 그중 진단 스냅샷 보유 ${out.db_sample.failed_with_error_detail} / 호출기록 0행 ${out.db_sample.failed_with_zero_llm_rows}`)
console.log(`완료 런 중 호출기록 0행: ${out.db_sample.completed_with_zero_llm_rows}/${completed.length}`)
