// verify-f003-run-chat-guards — 읽기 전용 감사(밤이 할 수 있는 부분만).
// 티켓: .claude/vault/backlog/verify-f003-run-chat-guards.md
// 어떻게 재나(티켓 원문): shots.characters 에 characters 테이블 밖 id 가
//   수리 배포(2026-08-13) 이후 새로 생겼는지 조인으로 센다.
// 판정선(티켓 원문): 신규 발생 0건이면 통과. 1건 이상이면 가드 구멍.
//
// 조인 키 근거: src/lib/writer/pipeline/util/persist_manifest.ts:13 주석
//   "shots.characters 와 characters.character_id 가 동일 id 공간(referential 정합)".
//   오탐을 피하려고 character_id 뿐 아니라 characters.id(UUID)·name 까지 셋 다 맞춰보고,
//   셋 다 안 맞을 때만 '테이블 밖'으로 센다.
//
// usage: node research/experiments/verify-f003-run-chat-guards/probe.mjs
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

// 티켓은 날짜만 준다("수리 배포(2026-08-13) 이후"). 시각은 그 날 0시(UTC)로 잡는다.
const FIX_DEPLOY = '2026-08-13T00:00:00Z'

// 1) 정본 로스터 전량 (프로젝트별)
const roster = new Map() // project_id -> Set of accepted ids
const rosterRows = []
{
  let from = 0
  const page = 1000
  for (;;) {
    const { data, error } = await db
      .from('characters')
      .select('id, project_id, character_id, name')
      .range(from, from + page - 1)
    if (error) throw new Error(`characters query failed: ${JSON.stringify(error)}`)
    rosterRows.push(...data)
    if (data.length < page) break
    from += page
  }
}
for (const c of rosterRows) {
  if (!roster.has(c.project_id)) roster.set(c.project_id, new Set())
  const s = roster.get(c.project_id)
  if (c.character_id) s.add(String(c.character_id))
  if (c.id) s.add(String(c.id))
  if (c.name) s.add(String(c.name))
}

// 2) shots 전량 (판정은 배포 이후분에만, 이전분은 기저선 재료)
const shots = []
{
  let from = 0
  const page = 1000
  for (;;) {
    const { data, error } = await db
      .from('shots')
      .select('id, project_id, scene_id, shot_id, characters, source, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + page - 1)
    if (error) throw new Error(`shots query failed: ${JSON.stringify(error)}`)
    shots.push(...data)
    if (data.length < page) break
    from += page
  }
}

function orphansOf(shot) {
  const arr = Array.isArray(shot.characters) ? shot.characters : []
  const allowed = roster.get(shot.project_id) ?? new Set()
  return arr
    .map((x) => (x == null ? '' : String(x)))
    .filter((x) => x !== '' && !allowed.has(x))
}

const scored = shots.map((s) => {
  const orphans = orphansOf(s)
  return {
    shot_row_id: s.id,
    project_id: s.project_id,
    scene_id: s.scene_id,
    shot_id: s.shot_id,
    source: s.source,
    created_at: s.created_at,
    characters: Array.isArray(s.characters) ? s.characters : s.characters,
    orphan_ids: orphans,
    is_after_fix: s.created_at >= FIX_DEPLOY,
  }
})

const after = scored.filter((r) => r.is_after_fix)
const before = scored.filter((r) => !r.is_after_fix)
const afterOrphans = after.filter((r) => r.orphan_ids.length > 0)
const beforeOrphans = before.filter((r) => r.orphan_ids.length > 0)

const distinct = (rows) => {
  const m = new Map()
  for (const r of rows)
    for (const o of r.orphan_ids) m.set(o, (m.get(o) || 0) + 1)
  return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]))
}

// 3) 배포 이후 신규 프로젝트 목록(티켓 blockers 주석의 해제 근거 재확인용 재료)
const newProjectIds = [
  ...new Set(after.map((r) => r.project_id)),
]
const { data: newProjects, error: e4 } = await db
  .from('projects')
  .select('id, title, current_stage, created_at')
  .in('id', newProjectIds.length ? newProjectIds : ['00000000-0000-0000-0000-000000000000'])
if (e4) throw new Error(`projects query failed: ${JSON.stringify(e4)}`)

// 4) 음성 대조 재료: 배포 이후 실제로 채팅발 샷이 만들어진 적이 있는가.
//    (shots.source 전량 분포 + 배포 이후 writer 런 목록)
const sourceAllTime = shots.reduce(
  (a, s) => ((a[s.source ?? 'null'] = (a[s.source ?? 'null'] || 0) + 1), a),
  {},
)
const { data: runsSinceFix, error: e5 } = await db
  .from('writer_runs')
  .select('id, project_id, status, current_stage, created_at')
  .gte('created_at', FIX_DEPLOY)
  .order('created_at', { ascending: true })
if (e5) throw new Error(`writer_runs query failed: ${JSON.stringify(e5)}`)

const result = {
  ticket: 'verify-f003-run-chat-guards',
  shots_source_all_time: sourceAllTime,
  writer_runs_since_fix: runsSinceFix,
  ran_at: new Date().toISOString(),
  fix_deploy_boundary: FIX_DEPLOY,
  join_definition:
    "shots.characters[] 의 각 값이 같은 project_id 의 characters 행의 character_id / id / name 중 어느 것과도 안 맞으면 '테이블 밖'",
  counts: {
    roster_rows: rosterRows.length,
    shots_total: shots.length,
    shots_after_fix: after.length,
    shots_before_fix: before.length,
    // 판정선이 보는 숫자
    shots_after_fix_with_orphan_id: afterOrphans.length,
    orphan_id_occurrences_after_fix: afterOrphans.reduce(
      (a, r) => a + r.orphan_ids.length,
      0,
    ),
    // 기저선(판정 아님)
    shots_before_fix_with_orphan_id: beforeOrphans.length,
    orphan_id_occurrences_before_fix: beforeOrphans.reduce(
      (a, r) => a + r.orphan_ids.length,
      0,
    ),
  },
  distinct_orphan_ids_after_fix: distinct(afterOrphans),
  distinct_orphan_ids_before_fix: distinct(beforeOrphans),
  offending_rows_after_fix: afterOrphans,
  offending_rows_before_fix_sample: beforeOrphans.slice(0, 40),
  projects_touched_after_fix: newProjects,
  source_breakdown_after_fix: after.reduce(
    (a, r) => ((a[r.source ?? 'null'] = (a[r.source ?? 'null'] || 0) + 1), a),
    {},
  ),
}

writeFileSync(
  new URL('./results.json', import.meta.url),
  JSON.stringify(result, null, 2),
)
console.log(JSON.stringify(result.counts, null, 2))
console.log('after-fix orphan ids:', JSON.stringify(result.distinct_orphan_ids_after_fix))
console.log('before-fix orphan ids:', JSON.stringify(result.distinct_orphan_ids_before_fix))
console.log('projects touched after fix:', result.projects_touched_after_fix.map((p) => `${p.id.slice(0, 8)} ${p.title} [${p.current_stage}]`))
console.log('source breakdown after fix:', JSON.stringify(result.source_breakdown_after_fix))
