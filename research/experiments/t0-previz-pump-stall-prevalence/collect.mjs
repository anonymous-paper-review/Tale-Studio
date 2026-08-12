// t0-previz-pump-stall-prevalence — 글이 완주한 프로젝트의 러프 그림 완주율 분포.
//   코드 집계만(LLM 판정 없음), read-only.
// 실행: node research/experiments/t0-previz-pump-stall-prevalence/collect.mjs
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

const NOW = new Date()
const GRACE_MIN = 30 // 사전 등록: 런 완료 후 30분 이내는 "진행 중"이라 모집단에서 제외

const { data: runs, error } = await db
  .from('writer_runs')
  .select('id,project_id,status,created_at,updated_at')
  .eq('status', 'completed')
  .order('updated_at', { ascending: false })
if (error) throw error

// 프로젝트당 최신 완료 런
const latestByProject = new Map()
for (const r of runs ?? []) if (!latestByProject.has(r.project_id)) latestByProject.set(r.project_id, r)

const rows = []
for (const [projectId, run] of latestByProject) {
  const { data: shots } = await db
    .from('shots')
    .select('shot_id,rough_storyboard,updated_at')
    .eq('project_id', projectId)
  if (!shots?.length) { rows.push({ project_id: projectId, run_id: run.id, shots: 0, filled: 0, ratio: null, note: 'shots 0행' }); continue }

  // 채워짐 판정: 실제 이미지 주소가 있는 것만 (형상 실측: rough_storyboard = { url: "…png" })
  const filledShots = shots.filter((s) => {
    const rb = s.rough_storyboard
    if (!rb) return false
    if (typeof rb === 'string') return rb.startsWith('http')
    if (typeof rb === 'object' && !Array.isArray(rb)) return !!(rb.url || rb.image_url || rb.storage_path)
    return false
  })

  // 잡 상태 — 대기/실행 중이 남아 있으면 아직 도는 중일 수 있다.
  const { data: jobs } = await db
    .from('generation_jobs')
    .select('id,status,created_at,updated_at')
    .eq('project_id', projectId)
    .eq('kind', 'shot_rough_storyboard')
  const jobStatus = {}
  for (const j of jobs ?? []) jobStatus[j.status] = (jobStatus[j.status] ?? 0) + 1
  const lastJobAt = (jobs ?? []).map((j) => j.updated_at).sort().at(-1) ?? null

  const runDoneAt = new Date(run.updated_at)
  const minutesSinceRun = (NOW - runDoneAt) / 60000
  // 마지막 그림 갱신 시각 − 런 완료 시각 (분): 크면 "런은 끝났는데 그림은 한참 뒤/영영 안 옴"
  const lastShotAt = shots.map((s) => s.updated_at).filter(Boolean).sort().at(-1) ?? null
  const gapMin = lastJobAt ? (new Date(lastJobAt) - runDoneAt) / 60000 : null

  rows.push({
    project_id: projectId,
    run_id: run.id,
    run_done_at: run.updated_at,
    minutes_since_run: Math.round(minutesSinceRun),
    in_grace: minutesSinceRun < GRACE_MIN,
    shots: shots.length,
    filled: filledShots.length,
    ratio: +(filledShots.length / shots.length).toFixed(3),
    jobs_total: jobs?.length ?? 0,
    job_status: jobStatus,
    last_job_at: lastJobAt,
    last_shot_update_at: lastShotAt,
    job_minus_run_min: gapMin == null ? null : Math.round(gapMin),
  })
}

const population = rows.filter((r) => r.ratio != null && !r.in_grace)
const complete = population.filter((r) => r.ratio >= 1)
const under50 = population.filter((r) => r.ratio < 0.5)
const zero = population.filter((r) => r.ratio === 0)
const hist = { '1.0': 0, '0.75~1.0': 0, '0.5~0.75': 0, '0.25~0.5': 0, '0~0.25': 0, '0': 0 }
for (const r of population) {
  if (r.ratio >= 1) hist['1.0']++
  else if (r.ratio >= 0.75) hist['0.75~1.0']++
  else if (r.ratio >= 0.5) hist['0.5~0.75']++
  else if (r.ratio >= 0.25) hist['0.25~0.5']++
  else if (r.ratio > 0) hist['0~0.25']++
  else hist['0']++
}

const out = {
  ticket: 't0-previz-pump-stall-prevalence',
  date: '2026-08-12',
  grace_minutes: GRACE_MIN,
  population_rule: '완료 writer 런을 가진 프로젝트(프로젝트당 최신 런), shots 0행 제외, 런 완료 30분 이내 제외',
  projects_with_completed_run: rows.length,
  population_n: population.length,
  fully_filled: complete.length,
  fully_filled_pct: population.length ? +(complete.length / population.length * 100).toFixed(1) : null,
  under_50pct: under50.length,
  zero_filled: zero.length,
  histogram: hist,
  rows: rows.sort((a, b) => (a.ratio ?? 9) - (b.ratio ?? 9)),
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`완료 런 보유 프로젝트 ${rows.length} / 모집단 ${population.length} / 완주(1.0) ${complete.length} (${out.fully_filled_pct}%)`)
console.log('히스토그램:', JSON.stringify(hist))
console.log('project | shots | filled | ratio | jobs | job-run(min) | grace')
for (const r of out.rows) {
  console.log(`  ${r.project_id.slice(0, 8)} | ${r.shots} | ${r.filled ?? '-'} | ${r.ratio ?? 'NA'} | ${r.jobs_total ?? 0}${JSON.stringify(r.job_status ?? {})} | ${r.job_minus_run_min ?? 'NA'} | ${r.in_grace ? 'GRACE' : ''}`)
}
