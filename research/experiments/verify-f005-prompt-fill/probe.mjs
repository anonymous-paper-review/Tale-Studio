// verify-f005-prompt-fill — 읽기 전용 감사.
// 티켓: .claude/vault/backlog/verify-f005-prompt-fill.md
// 어떻게 재나(티켓 원문): projects.current_stage = 'director' 인 프로젝트별로
//   count(*) filter (where coalesce(prompt,'') <> '') / count(*)
// 판정선(티켓 원문): 전 프로젝트 100%면 통과. 100% 미만이 하나라도 있으면 재발.
//   + 인계철선(shots_prompt_not_blanked) 에러 로그 확인도 함께.
//
// usage: node research/experiments/verify-f005-prompt-fill/probe.mjs
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

// 1) director 단계 프로젝트 전수
const { data: projects, error: e1 } = await db
  .from('projects')
  .select('id, title, current_stage, created_at, updated_at')
  .eq('current_stage', 'director')
  .order('created_at', { ascending: true })
if (e1) throw new Error(`projects query failed: ${JSON.stringify(e1)}`)

// 2) 프로젝트별 shots 채움률
const perProject = []
for (const p of projects) {
  const { data: shots, error: e2 } = await db
    .from('shots')
    .select('id, shot_id, scene_id, prompt, source, created_at, updated_at')
    .eq('project_id', p.id)
  if (e2) throw new Error(`shots query failed for ${p.id}: ${JSON.stringify(e2)}`)

  const total = shots.length
  // 티켓의 자 그대로: coalesce(prompt,'') <> ''
  const filled = shots.filter((s) => (s.prompt ?? '') !== '').length
  // 재료 분해(판정 아님): 빈 문자열과 NULL 을 나눠 센다.
  const emptyString = shots.filter((s) => s.prompt === '').length
  const nulls = shots.filter((s) => s.prompt === null || s.prompt === undefined).length

  perProject.push({
    project_id: p.id,
    title: p.title,
    created_at: p.created_at,
    updated_at: p.updated_at,
    total_shots: total,
    filled,
    fill_rate: total === 0 ? null : filled / total,
    fill_rate_pct: total === 0 ? null : Number(((filled / total) * 100).toFixed(2)),
    empty_string_rows: emptyString,
    null_rows: nulls,
    unfilled_examples: shots
      .filter((s) => (s.prompt ?? '') === '')
      .slice(0, 10)
      .map((s) => ({
        shot_row_id: s.id,
        shot_id: s.shot_id,
        scene_id: s.scene_id,
        source: s.source,
        prompt_is_null: s.prompt === null || s.prompt === undefined,
        created_at: s.created_at,
        updated_at: s.updated_at,
      })),
  })
}

// 3) 인계철선 로그 확인 — 제약 위반 문자열이 에러 칼럼에 남았는지
const TRIP = 'shots_prompt_not_blanked'
const tripHits = {}

// writer_runs.error / error_detail 은 jsonb 라 DB 쪽 ilike 가 안 걸린다 —
// 에러가 기록된 행만 전부 받아 JS 에서 문자열로 훑는다.
const { data: wrAll, error: e3 } = await db
  .from('writer_runs')
  .select('id, project_id, status, error, error_detail, created_at')
  .or('error.not.is.null,error_detail.not.is.null')
tripHits.writer_runs_rows_with_any_error = e3 ? { error: e3.message } : wrAll.length
tripHits.writer_runs = e3
  ? { error: e3.message }
  : wrAll.filter((r) =>
      JSON.stringify([r.error, r.error_detail]).includes(TRIP),
    )

const { data: gj, error: e4 } = await db
  .from('generation_jobs')
  .select('id, project_id, kind, status, error, last_error, error_class, created_at')
  .or(`error.ilike.%${TRIP}%,last_error.ilike.%${TRIP}%`)
tripHits.generation_jobs = e4 ? { error: e4.message } : gj

const { data: lc, error: e5 } = await db
  .from('llm_calls')
  .select('id, project_id, stage, error, called_at')
  .ilike('error', `%${TRIP}%`)
tripHits.llm_calls = e5 ? { error: e5.message } : lc

const below100 = perProject.filter((r) => r.fill_rate !== null && r.fill_rate < 1)

const result = {
  ticket: 'verify-f005-prompt-fill',
  ran_at: new Date().toISOString(),
  query: {
    projects: "select ... from projects where current_stage = 'director'",
    shots: "select id, shot_id, prompt, source from shots where project_id = <each>",
    metric: "count(*) filter (where coalesce(prompt,'') <> '') / count(*)",
    tripwire_scan: `error/last_error/error_detail ilike '%${TRIP}%'`,
  },
  counts: {
    director_projects: projects.length,
    projects_with_zero_shots: perProject.filter((r) => r.total_shots === 0).length,
    projects_at_100pct: perProject.filter((r) => r.fill_rate === 1).length,
    projects_below_100pct: below100.length,
    total_shots_scanned: perProject.reduce((a, r) => a + r.total_shots, 0),
    total_unfilled_rows: perProject.reduce(
      (a, r) => a + (r.total_shots - r.filled),
      0,
    ),
    tripwire_hits:
      (Array.isArray(tripHits.writer_runs) ? tripHits.writer_runs.length : -1) +
      (Array.isArray(tripHits.generation_jobs) ? tripHits.generation_jobs.length : -1) +
      (Array.isArray(tripHits.llm_calls) ? tripHits.llm_calls.length : -1),
  },
  per_project: perProject,
  below_100pct: below100,
  tripwire_log_scan: tripHits,
}

writeFileSync(
  new URL('./results.json', import.meta.url),
  JSON.stringify(result, null, 2),
)
console.log(JSON.stringify(result.counts, null, 2))
console.log(
  perProject
    .map(
      (r) =>
        `${r.project_id.slice(0, 8)} ${String(r.fill_rate_pct).padStart(6)}%  ${r.filled}/${r.total_shots}  (empty='' ${r.empty_string_rows}, null ${r.null_rows})  ${r.title}`,
    )
    .join('\n'),
)
