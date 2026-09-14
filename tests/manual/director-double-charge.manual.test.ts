// 같은 요청의 예약 재사용과 원장 반복 차감을 실제 격리 PostgreSQL에서 구분해 확인한다.
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

const connectionString = process.env.DIRECTOR_CHARGE_DATABASE_URL
const ca = process.env.DIRECTOR_CHARGE_CA
const schema = process.env.DIRECTOR_CHARGE_SCHEMA ?? ''
const output = process.env.DIRECTOR_CHARGE_OUTPUT ?? ''
if (!connectionString || !ca || !/^director_charge_[a-f0-9]{32}$/.test(schema) || !output) {
  throw new Error('Run node tests/manual/director-double-charge.verify.mjs')
}
const clients = Array.from({ length: 3 }, () => new Client({ connectionString, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 }))
const primary = clients[0]
const observations: Record<string, unknown>[] = []
type Fixture = { owner: string; workspace: string; project: string; shot: string }
type Reservation = { video_clip_id: string; job_id: string; take_number: number; replayed: boolean }
type Hold = { ok: boolean; insufficient: boolean; balance: number; held: number }

beforeAll(async () => {
  await Promise.all(clients.map((client) => client.connect()))
  await primary.query(`insert into ${schema}.fal_key_limits(key_id,max_inflight) values ('audit-no-provider',100)`)
}, 30000)
afterAll(async () => {
  const result = JSON.parse(readFileSync(output, 'utf8'))
  result.observations = observations
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
  await Promise.all(clients.map(async (client) => { await client.query('rollback').catch(() => {}); await client.end() }))
}, 30000)

async function fixture(grants = [100]): Promise<Fixture> {
  const ids = { owner: randomUUID(), workspace: randomUUID(), project: randomUUID(), shot: `audit-${randomUUID()}` }
  await primary.query(`insert into ${schema}.workspaces(id,name,slug,owner_id) values($1,'Charge audit',$2,$3)`, [ids.workspace, randomUUID(), ids.owner])
  await primary.query(`insert into ${schema}.projects(id,workspace_id,title) values($1,$2,'Charge audit')`, [ids.project, ids.workspace])
  const scene = (await primary.query(`insert into ${schema}.scenes(project_id,scene_id,narrative_time) values($1,'audit-scene','present') returning id`, [ids.project])).rows[0].id
  await primary.query(`insert into ${schema}.shots(project_id,scene_id,shot_id,shot_type,character_appearance_keys) values($1,$2,$3,'wide','{}')`, [ids.project, scene, ids.shot])
  for (const amount of grants) await primary.query(`insert into ${schema}.take_ledger(workspace_id,kind,delta,ref_kind,ref_id) values($1,'grant_purchase',$2,'audit',$3)`, [ids.workspace, amount, randomUUID()])
  return ids
}
const target = (ids: Fixture, clip?: string) => ({ workspaceId: ids.workspace, writerShotId: ids.shot, retakeMode: clip ? 'regeneration' : 'new_take', ...(clip ? { videoClipId: clip } : {}) })
async function reserve(client: Client, ids: Fixture, key: string, clip?: string): Promise<Reservation> {
  const fn = clip ? 'reserve_director_video_regeneration' : 'reserve_director_video_take'
  return (await client.query(`select * from ${schema}.${fn}($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8,$9,$10)`,
    [ids.project, clip ?? ids.shot, 'seedance', JSON.stringify(target(ids, clip)), key, '{}', ids.owner, ids.workspace, 'fal', 'ui'])).rows[0]
}
async function hold(client: Client, ids: Fixture, job: string, amount = 5): Promise<Hold> {
  return (await client.query(`select ${schema}.take_hold($1,$2,$3,true) as result`, [ids.workspace, amount, job])).rows[0].result
}
async function totals(ids: Fixture) {
  return (await primary.query(`select
    coalesce(sum(delta),0)::int as balance,
    coalesce(-sum(delta) filter(where kind='hold'),0)::int as charged,
    count(*) filter(where kind='hold')::int as hold_rows,
    count(distinct ref_id) filter(where kind='hold')::int as charged_jobs,
    (select count(*)::int from ${schema}.generation_jobs where project_id=$2) as jobs
    from ${schema}.take_ledger where workspace_id=$1`, [ids.workspace, ids.project])).rows[0]
}
function record(id: string, behavior: string, data: Record<string, unknown>) {
  observations.push({ id, behavior, ...data })
}
// Hold both independent transactions behind the ORIGINAL advisory lock before releasing them.
async function race<T>(lock: string, kind: 'hashtext' | 'hashtextextended', calls: [(client: Client) => Promise<T>, (client: Client) => Promise<T>]) {
  await primary.query('begin')
  const lockSql = kind === 'hashtext' ? 'select pg_advisory_xact_lock(hashtext($1))' : 'select pg_advisory_xact_lock(hashtextextended($1,0))'
  await primary.query(lockSql, [lock])
  const participants = await Promise.all(clients.slice(1).map(async (client) => {
    await client.query('begin isolation level read committed')
    await client.query("set local statement_timeout = '15s'")
    return (await client.query('select pg_backend_pid() as pid, txid_current()::text as transaction_id')).rows[0]
  }))
  const pending = clients.slice(1).map(async (client, i) => {
    try { const value = await calls[i](client); await client.query('commit'); return { accepted: true, value } }
    catch (error) { await client.query('rollback'); return { accepted: false, error: error instanceof Error ? error.message : String(error) } }
  })
  let waiters = 0
  try {
    const deadline = Date.now() + 7000
    while (Date.now() < deadline) {
      waiters = (await primary.query("select count(*)::int as n from pg_locks where pid=any($1::int[]) and locktype='advisory' and not granted", [participants.map((p) => p.pid)])).rows[0].n
      if (waiters === 2) break
      await new Promise((done) => setTimeout(done, 20))
    }
  } finally { await primary.query('commit') }
  const outcomes = await Promise.all(pending)
  expect(waiters).toBe(2)
  expect(new Set(participants.map((p) => p.pid)).size).toBe(2)
  return { participants, observedAdvisoryWaiters: waiters, outcomes }
}

it('지급분 두 곳에서 한 번 차감하면 총 차감은 요청량과 같다', async () => {
  const ids = await fixture([2, 98])
  const reply = await hold(primary, ids, randomUUID())
  const state = await totals(ids)
  record('split-grants', '지급분 두 곳에서 한 번 차감하면 총 차감은 요청량과 같다', { reply, ...state, safe: state.charged === 5 })
  expect(state).toMatchObject({ balance: 95, charged: 5, hold_rows: 2, charged_jobs: 1 })
})

it('같은 작업 차감을 두 번 요청하면 실제 차감 합계로 중복 여부를 확인한다', async () => {
  const ids = await fixture()
  const job = randomUUID()
  const replies = [await hold(primary, ids, job), await hold(primary, ids, job)]
  const state = await totals(ids)
  record('same-job-repeat', '같은 작업 차감을 두 번 요청하면 실제 차감 합계로 중복 여부를 확인한다', { replies, ...state, safe: state.charged === 5, duplicateChargeObserved: state.charged > 5 })
  expect(replies.every((reply) => reply.ok)).toBe(true)
  expect(state.charged_jobs).toBe(1)
  expect(state.charged).toBe(replies.reduce((sum, reply) => sum + reply.held, 0))
})

it('같은 작업 차감을 동시에 요청하면 잠금 이후의 실제 차감 합계를 기록한다', async () => {
  const ids = await fixture()
  const job = randomUUID()
  const concurrent = await race(ids.workspace, 'hashtext', [c => hold(c, ids, job), c => hold(c, ids, job)])
  const state = await totals(ids)
  record('same-job-concurrent', '같은 작업 차감을 동시에 요청하면 잠금 이후의 실제 차감 합계를 기록한다', { ...concurrent, ...state, safe: state.charged === 5, duplicateChargeObserved: state.charged > 5 })
  expect(concurrent.outcomes.every((r) => r.accepted)).toBe(true)
  expect(state.charged_jobs).toBe(1)
}, 30000)

it('같은 영상 생성 요청을 동시에 다시 보내면 기존 작업을 재사용한다', async () => {
  const ids = await fixture()
  const key = randomUUID()
  const concurrent = await race(`${ids.project}:new-take:${key}`, 'hashtextextended', [c => reserve(c, ids, key), c => reserve(c, ids, key)])
  const values = concurrent.outcomes.flatMap((r) => r.value ? [r.value] : [])
  const state = await totals(ids)
  record('same-key-new-take', '같은 영상 생성 요청을 동시에 다시 보내면 기존 작업을 재사용한다', { ...concurrent, ...state, safe: state.jobs === 1, scope: 'Reservation RPC only; hold is not part of reservation RPC.' })
  expect(values).toHaveLength(2)
  expect(values.filter((v) => v.replayed)).toHaveLength(1)
  expect(new Set(values.map((v) => v.job_id)).size).toBe(1)
  expect(state.jobs).toBe(1)
}, 30000)

it('다른 요청키로 같은 샷의 새 테이크를 동시에 만들면 작업 수와 각 작업의 차감을 기록한다', async () => {
  const ids = await fixture()
  const concurrent = await race(`${ids.project}:shot:${ids.shot}`, 'hashtextextended', [c => reserve(c, ids, randomUUID()), c => reserve(c, ids, randomUUID())])
  const jobs = concurrent.outcomes.flatMap((r) => r.value ? [r.value] : [])
  // Independent SQL probe: charge the returned distinct jobs; do not reimplement API replay logic.
  const distinct = [...new Set(jobs.map((j) => j.job_id))]
  const holds = []
  for (const job of distinct) holds.push(await hold(primary, ids, job))
  const state = await totals(ids)
  record('different-key-new-take', '다른 요청키로 같은 샷의 새 테이크를 동시에 만들면 작업 수와 각 작업의 차감을 기록한다', { ...concurrent, holds, ...state, sameShotDeduplicated: state.jobs === 1, scope: 'Original reservation RPCs plus explicit take_hold calls per returned distinct job; no paid provider or API route invocation.' })
  expect(concurrent.outcomes.every((r) => r.accepted)).toBe(true)
  expect(state.jobs).toBe(distinct.length)
  expect(state.charged).toBe(distinct.length * 5)
}, 30000)

it('같은 기존 영상을 동시에 다시 만들면 진행 중인 시도는 하나만 허용한다', async () => {
  const ids = await fixture()
  const initial = await reserve(primary, ids, randomUUID())
  await primary.query(`update ${schema}.generation_jobs set status='completed' where id=$1`, [initial.job_id])
  const concurrent = await race(`${ids.project}:${ids.shot}`, 'hashtextextended', [c => reserve(c, ids, randomUUID(), initial.video_clip_id), c => reserve(c, ids, randomUUID(), initial.video_clip_id)])
  const accepted = concurrent.outcomes.filter((r) => r.accepted)
  record('same-clip-regeneration', '같은 기존 영상을 동시에 다시 만들면 진행 중인 시도는 하나만 허용한다', { ...concurrent, safe: accepted.length === 1 })
  expect(accepted).toHaveLength(1)
  expect(concurrent.outcomes.find((r) => !r.accepted)?.error).toContain('clip already has a queued attempt')
}, 30000)

it('같은 일괄 항목을 다시 제출하면 기존 작업을 재사용한다', async () => {
  const ids = await fixture()
  const batch = randomUUID(), item = randomUUID(), token = randomUUID()
  const items = JSON.stringify([{ id: item, shot_id: ids.shot, prepared: { audit: true } }])
  const create = () => primary.query(`select ${schema}.create_director_video_batch($1,$2,$3,$4::jsonb) as id`, [batch, ids.project, ids.owner, items])
  const creations = [(await create()).rows[0].id, (await create()).rows[0].id]
  await primary.query(`select * from ${schema}.claim_director_video_batch($1,$2)`, [batch, token])
  const args = JSON.stringify({ projectId: ids.project, shotId: ids.shot, userId: ids.owner, workspaceId: ids.workspace, idempotencyKey: item, model: 'seedance', target: target(ids), inputSnapshot: {}, provider: 'fal', actor: 'ui', override: {} })
  const submit = async (): Promise<Reservation> => (await primary.query(`select * from ${schema}.reserve_director_video_batch_item($1,$2,$3::jsonb)`, [item, token, args])).rows[0]
  const first = await submit(), replay = await submit()
  const state = await totals(ids)
  record('batch-replay', '같은 일괄 항목을 다시 제출하면 기존 작업을 재사용한다', { creations, first, replay, ...state, safe: state.jobs === 1 })
  expect(creations).toEqual([batch, batch])
  expect(replay).toMatchObject({ job_id: first.job_id, video_clip_id: first.video_clip_id, replayed: true })
  expect(state.jobs).toBe(1)
})

it('일반 계정의 남은 잔액을 동시에 요청하면 잔액을 넘는 차감을 거절한다', async () => {
  const ids = await fixture([5])
  const concurrent = await race(ids.workspace, 'hashtext', [c => hold(c, ids, randomUUID()), c => hold(c, ids, randomUUID())])
  const replies = concurrent.outcomes.flatMap((r) => r.value ? [r.value] : [])
  const state = await totals(ids)
  record('enforced-balance-race', '일반 계정의 남은 잔액을 동시에 요청하면 잔액을 넘는 차감을 거절한다', { ...concurrent, ...state, safe: state.balance === 0 && state.charged === 5, enforce: true, adminExempt: false })
  expect(replies.filter((r) => r.ok)).toHaveLength(1)
  expect(replies.filter((r) => r.insufficient)).toHaveLength(1)
  expect(state).toMatchObject({ balance: 0, charged: 5, charged_jobs: 1 })
}, 30000)
