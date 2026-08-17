// t0-generation-retry-never-fires — 읽기 전용 집계.
//   generation_jobs 전 건을 쪽 나눠 읽어(range paging) 시도 횟수 분포 · 실패 원인 분류 · 작업 종류별
//   실패를 센다. INSERT/UPDATE/DELETE 없음. 모델 호출 없음.
//   usage: node research/experiments/t0-generation-retry-never-fires/probe.mjs
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

const PAGE = 1000
const COLS = 'id, project_id, kind, status, attempts, error_class, last_error, error, actor, provider, model, target, created_at, completed_at'

// 1) 서버가 세는 전체 건수 (head count) — 페이징이 빠뜨린 게 없는지 대조용
const { count: headCount, error: headErr } = await db
  .from('generation_jobs')
  .select('id', { count: 'exact', head: true })
if (headErr) throw headErr

// 2) 전 건 쪽 나눠 읽기
const rows = []
for (let from = 0; ; from += PAGE) {
  const { data, error } = await db
    .from('generation_jobs')
    .select(COLS)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1)
  if (error) throw error
  if (!data || data.length === 0) break
  rows.push(...data)
  if (data.length < PAGE) break
}

const uniqueIds = new Set(rows.map((r) => r.id))

const tally = (list, key) => {
  const m = {}
  for (const r of list) {
    const k = key(r)
    m[k] = (m[k] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]))
}

const failed = rows.filter((r) => r.status === 'failed')

// 3) attempts 분포 (전 건 / 실패 건 / 상태별)
const attemptsAll = tally(rows, (r) => String(r.attempts))
const attemptsFailed = tally(failed, (r) => String(r.attempts))
const attemptsGte2 = rows.filter((r) => typeof r.attempts === 'number' && r.attempts >= 2)

// 4) 코드가 붙인 실패 원인 분류별 건수
const errorClassCounts = tally(failed, (r) => r.error_class ?? '(null)')

// 5) 작업 종류별 — 전체/실패/실패율
const kindAll = tally(rows, (r) => r.kind ?? '(null)')
const kindFailed = tally(failed, (r) => r.kind ?? '(null)')
const kindTable = Object.keys(kindAll).map((k) => ({
  kind: k,
  total: kindAll[k],
  failed: kindFailed[k] ?? 0,
  failRatePct: Number(((100 * (kindFailed[k] ?? 0)) / kindAll[k]).toFixed(2)),
}))
kindTable.sort((a, b) => b.failed - a.failed || b.total - a.total)

// 6) 작업 종류 x 실패 원인 분류 교차표
const kindByClass = {}
for (const r of failed) {
  const k = r.kind ?? '(null)'
  const c = r.error_class ?? '(null)'
  kindByClass[k] = kindByClass[k] ?? {}
  kindByClass[k][c] = (kindByClass[k][c] ?? 0) + 1
}

// 7) 상태 분포
const statusCounts = tally(rows, (r) => r.status ?? '(null)')

// 8) 채움률
const fill = {
  error_class_filled: failed.filter((r) => r.error_class != null && String(r.error_class) !== '').length,
  last_error_filled: failed.filter((r) => r.last_error != null && String(r.last_error) !== '').length,
  error_filled: failed.filter((r) => r.error != null && String(r.error) !== '').length,
  failed_total: failed.length,
}

// 9) actor 분포 (실패 건) — 자율(auto) vs 사람(ui/chat)
const actorFailed = tally(failed, (r) => r.actor ?? '(null)')
const actorAll = tally(rows, (r) => r.actor ?? '(null)')

// 10) 판정선 밖 보조 관측: 같은 슬롯(project+kind+target)에 잡이 2건 이상 쌓인 경우.
//     attempts 칸을 늘리는 대신 "새 잡 행"으로 다시 보내진 흔적이 있는지 보려는 것.
//     실패 잡이 있는 슬롯 중, 그 실패보다 나중에 같은 슬롯 잡이 또 생긴 경우만 센다.
const slotKey = (r) => {
  const t = r.target ?? {}
  const parts = [
    r.project_id, r.kind,
    t.characterId ?? '', t.view ?? '', t.column ?? '',
    t.locationId ?? '', t.writerShotId ?? '', t.shotId ?? '', t.sceneId ?? '',
  ]
  return parts.join('|')
}
const bySlot = new Map()
for (const r of rows) {
  const k = slotKey(r)
  if (!bySlot.has(k)) bySlot.set(k, [])
  bySlot.get(k).push(r)
}
let slotsWithFailure = 0
let slotsWithJobAfterFailure = 0
let slotsWithSuccessAfterFailure = 0
const followUpActor = {}
for (const [, list] of bySlot) {
  list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const firstFailIdx = list.findIndex((r) => r.status === 'failed')
  if (firstFailIdx === -1) continue
  slotsWithFailure++
  const after = list.slice(firstFailIdx + 1)
  if (after.length > 0) {
    slotsWithJobAfterFailure++
    for (const r of after) {
      const a = r.actor ?? '(null)'
      followUpActor[a] = (followUpActor[a] ?? 0) + 1
    }
    if (after.some((r) => r.status === 'completed')) slotsWithSuccessAfterFailure++
  }
}

// 11) 시간 범위
const createdAts = rows.map((r) => r.created_at).filter(Boolean).sort()

const out = {
  queriedAt: new Date().toISOString(),
  table: 'generation_jobs',
  readOnly: true,
  headCountExact: headCount,
  pagedRowCount: rows.length,
  uniqueIdCount: uniqueIds.size,
  countsMatch: headCount === rows.length && rows.length === uniqueIds.size,
  createdAtRange: { first: createdAts[0] ?? null, last: createdAts[createdAts.length - 1] ?? null },
  statusCounts,
  attemptsDistributionAll: attemptsAll,
  attemptsDistributionFailed: attemptsFailed,
  attemptsGte2Count: attemptsGte2.length,
  attemptsGte2Rows: attemptsGte2.map((r) => ({ id: r.id, kind: r.kind, status: r.status, attempts: r.attempts, created_at: r.created_at })),
  failedTotal: failed.length,
  failRatePct: Number(((100 * failed.length) / rows.length).toFixed(2)),
  errorClassCounts,
  errorClassFillRates: fill,
  kindTable,
  kindByErrorClass: kindByClass,
  actorCountsAll: actorAll,
  actorCountsFailed: actorFailed,
  slotFollowUp: {
    note: '판정선 밖 보조 관측 — attempts 칸이 아니라 "새 잡 행"으로 다시 보내진 흔적이 있는지',
    slotsWithAtLeastOneFailure: slotsWithFailure,
    slotsWithAnotherJobAfterFailure: slotsWithJobAfterFailure,
    slotsWithSuccessAfterFailure: slotsWithSuccessAfterFailure,
    followUpJobActorCounts: followUpActor,
  },
}

writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
