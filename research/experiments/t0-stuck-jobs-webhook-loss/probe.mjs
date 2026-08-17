// t0-stuck-jobs-webhook-loss — generation_jobs 읽기 전용 감사.
//   usage: node research/experiments/t0-stuck-jobs-webhook-loss/probe.mjs
//   쓰기 금지: select 만 사용한다.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
)

const NOW = new Date()
const out = { probed_at: NOW.toISOString() }

// 1) 전건 로드 (테이블이 작다 — 어젯밤 86건 삭제 이후)
const { data: rows, error } = await db
  .from('generation_jobs')
  .select('*')
  .order('created_at', { ascending: true })
if (error) throw error

out.total_rows = rows.length
out.columns = rows.length ? Object.keys(rows[0]).sort() : []

// 2) 실제 어휘 뽑기 — 티켓/코드가 말하는 이름과 DB 실제값 대조
const tally = (key) => {
  const m = {}
  for (const r of rows) {
    const v = r[key] === null || r[key] === undefined ? '(null)' : String(r[key])
    m[v] = (m[v] ?? 0) + 1
  }
  return m
}
out.vocab = {
  status: tally('status'),
  kind: tally('kind'),
  provider: tally('provider'),
  model: tally('model'),
  actor: rows.length && 'actor' in rows[0] ? tally('actor') : '(column absent)',
}

// 3) 시각 기준 컬럼 확인
const timeCols = out.columns.filter((c) => /_at$/.test(c))
out.time_columns = timeCols
out.time_column_null_counts = Object.fromEntries(
  timeCols.map((c) => [c, rows.filter((r) => r[c] === null || r[c] === undefined).length]),
)

// 4) 완료도 실패도 아닌 것 = 비터미널
const TERMINAL = new Set(['completed', 'failed'])
const nonTerminal = rows.filter((r) => !TERMINAL.has(String(r.status)))
out.non_terminal_count = nonTerminal.length
out.non_terminal_by_status = {}
for (const r of nonTerminal) {
  const s = String(r.status)
  out.non_terminal_by_status[s] = (out.non_terminal_by_status[s] ?? 0) + 1
}

// 5) 주문 시각 = created_at 우선, 없으면 submitted_at
const orderedAt = (r) => r.created_at ?? r.submitted_at ?? null
const H12 = 12 * 60 * 60 * 1000
const ageH = (r) => {
  const t = orderedAt(r)
  return t === null ? null : (NOW.getTime() - new Date(t).getTime()) / 3600000
}

const stuck = nonTerminal.filter((r) => {
  const a = ageH(r)
  return a !== null && a * 3600000 >= H12
})
out.stuck_12h_count = stuck.length
out.stuck_12h_list = stuck.map((r) => ({
  id: r.id,
  project_id: r.project_id,
  request_id: r.request_id,
  kind: r.kind,
  status: r.status,
  model: r.model,
  provider: r.provider ?? null,
  created_at: r.created_at ?? null,
  submitted_at: r.submitted_at ?? null,
  completed_at: r.completed_at ?? null,
  age_hours: Number(ageH(r).toFixed(2)),
  error: r.error ?? null,
  last_error: r.last_error ?? null,
  attempts: r.attempts ?? null,
  result_url: r.result_url ?? null,
}))

// 6) 비터미널 전체(12h 미만 포함) 목록 — 시간대 분포 판정용
out.non_terminal_list = nonTerminal.map((r) => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  created_at: r.created_at ?? null,
  submitted_at: r.submitted_at ?? null,
  age_hours: ageH(r) === null ? null : Number(ageH(r).toFixed(2)),
}))

// 7) 시간대 히스토그램 (UTC 기준 시각 버킷) — 비터미널 전체 + 굳은 것
const hist = (list) => {
  const m = {}
  for (const r of list) {
    const t = orderedAt(r)
    if (!t) {
      m['(no time)'] = (m['(no time)'] ?? 0) + 1
      continue
    }
    const b = new Date(t).toISOString().slice(0, 13) + ':00Z'
    m[b] = (m[b] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(m).sort())
}
out.hist_non_terminal_by_hour = hist(nonTerminal)
out.hist_stuck_by_hour = hist(stuck)
out.hist_all_by_hour = hist(rows)

// 8) 굳은 것의 종류 분포
out.stuck_by_kind = {}
for (const r of stuck) out.stuck_by_kind[r.kind] = (out.stuck_by_kind[r.kind] ?? 0) + 1

// 9) 전체 행의 시각 범위 (삭제 이후 잔존 범위 확인)
const times = rows.map(orderedAt).filter(Boolean).sort()
out.time_range = { earliest: times[0] ?? null, latest: times[times.length - 1] ?? null }

// 10) 전건 원자료도 남긴다 (테이블이 작을 때만)
out.all_rows_compact = rows.map((r) => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  provider: r.provider ?? null,
  model: r.model,
  request_id: r.request_id,
  created_at: r.created_at ?? null,
  submitted_at: r.submitted_at ?? null,
  completed_at: r.completed_at ?? null,
  age_hours: ageH(r) === null ? null : Number(ageH(r).toFixed(2)),
}))

writeFileSync(
  new URL('./results.json', import.meta.url),
  JSON.stringify(out, null, 2),
)
console.log(
  JSON.stringify(
    {
      probed_at: out.probed_at,
      total_rows: out.total_rows,
      vocab_status: out.vocab.status,
      vocab_kind: out.vocab.kind,
      time_columns: out.time_columns,
      non_terminal_count: out.non_terminal_count,
      non_terminal_by_status: out.non_terminal_by_status,
      stuck_12h_count: out.stuck_12h_count,
      stuck_by_kind: out.stuck_by_kind,
      time_range: out.time_range,
      hist_non_terminal_by_hour: out.hist_non_terminal_by_hour,
    },
    null,
    2,
  ),
)
