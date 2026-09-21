// 실제 PostgreSQL 함수의 차감·반환 계약을 검증한다. 격리 러너로만 실행한다.
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

const connectionString = process.env.TAKE_HOLD_DATABASE_URL
const ca = process.env.TAKE_HOLD_CA
const schema = process.env.TAKE_HOLD_SCHEMA ?? ''
const output = process.env.TAKE_HOLD_OUTPUT ?? ''
if (!connectionString || !ca || !/^take_hold_[a-f0-9]{32}$/.test(schema) || !output) {
  throw new Error('Run node tests/manual/take-hold-idempotency.verify.mjs [--baseline]')
}
const clients = Array.from({ length: 3 }, () => new Client({ connectionString, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 }))
const primary = clients[0]
const observations: Record<string, unknown>[] = []
type Fixture = { owner: string; workspace: string; project: string; job: string; grants: string[] }
type Hold = { ok: boolean; insufficient: boolean; balance: number; held: number; replayed?: boolean }
type Outcome<T> = { accepted: true; value: T } | { accepted: false; error: string }

beforeAll(async () => { await Promise.all(clients.map(client => client.connect())) }, 30000)
afterAll(async () => {
  const result = JSON.parse(readFileSync(output, 'utf8'))
  result.observations = observations
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
  await Promise.all(clients.map(async client => { await client.query('rollback').catch(() => {}); await client.end() }))
}, 30000)

async function addJob(ids: Fixture, status = 'queued') {
  const job = randomUUID()
  await primary.query(`insert into ${schema}.generation_jobs(id,project_id,workspace_id,user_id,request_id,model,kind,status,provider,actor,target)
    values($1,$2,$3,$4,$5,'seedance','shot_video',$6,'fal','ui','{}')`, [job, ids.project, ids.workspace, ids.owner, `isolated:${job}`, status])
  return job
}
async function fixture(amounts = [100]): Promise<Fixture> {
  const ids: Fixture = { owner: randomUUID(), workspace: randomUUID(), project: randomUUID(), job: '', grants: [] }
  await primary.query(`insert into ${schema}.workspaces(id,name,slug,owner_id) values($1,'Hold verification',$2,$3)`, [ids.workspace, randomUUID(), ids.owner])
  await primary.query(`insert into ${schema}.projects(id,workspace_id,title) values($1,$2,'Hold verification')`, [ids.project, ids.workspace])
  for (const amount of amounts) ids.grants.push((await primary.query(`insert into ${schema}.take_ledger(workspace_id,kind,delta,ref_kind,ref_id) values($1,'grant_purchase',$2,'audit',$3) returning id`, [ids.workspace, amount, randomUUID()])).rows[0].id)
  ids.job = await addJob(ids)
  return ids
}
async function hold(client: Client, ids: Fixture, amount = 5, enforce = true): Promise<Hold> {
  return (await client.query(`select ${schema}.take_hold($1,$2,$3,$4) as result`, [ids.workspace, amount, ids.job, enforce])).rows[0].result
}
async function release(client: Client, job: string): Promise<number> {
  return (await client.query(`select ${schema}.take_release_for_job($1) as amount`, [job])).rows[0].amount
}
async function totals(ids: Fixture) {
  return (await primary.query(`select coalesce(sum(delta),0)::int as balance,
    coalesce(-sum(delta) filter(where kind='hold'),0)::int as charged,
    coalesce(sum(delta) filter(where kind='hold_release'),0)::int as released,
    count(*) filter(where kind='hold')::int as hold_rows,
    count(*) filter(where kind='hold_release')::int as release_rows
    from ${schema}.take_ledger where workspace_id=$1`, [ids.workspace])).rows[0]
}
async function capture<T>(call: () => Promise<T>): Promise<Outcome<T>> {
  try { return { accepted: true, value: await call() } }
  catch (error) { return { accepted: false, error: error instanceof Error ? error.message : String(error) } }
}
function record(behavior: string, data: Record<string, unknown>) { observations.push({ behavior, ...data }) }
async function status(ids: Fixture, value: string) { await primary.query(`update ${schema}.generation_jobs set status=$2 where id=$1`, [ids.job, value]) }

// Both original and replacement functions serialize on this workspace lock. Replacement may
// queue its second request behind the first job lock; both backend pids must actually wait.
async function race<T>(ids: Fixture, calls: [(client: Client) => Promise<T>, (client: Client) => Promise<T>]) {
  await primary.query('begin')
  await primary.query('select pg_advisory_xact_lock(hashtext($1))', [ids.workspace])
  const participants = await Promise.all(clients.slice(1).map(async client => {
    await client.query('begin isolation level read committed')
    await client.query("set local statement_timeout = '15s'")
    return (await client.query('select pg_backend_pid() as pid, txid_current()::text as transaction_id')).rows[0]
  }))
  const pending = clients.slice(1).map(async (client, index) => {
    const result = await capture(() => calls[index](client))
    await client.query(result.accepted ? 'commit' : 'rollback')
    return result
  })
  let waiters = 0
  try {
    const deadline = Date.now() + 7000
    while (Date.now() < deadline) {
      waiters = (await primary.query("select count(*)::int as n from pg_locks where pid=any($1::int[]) and locktype='advisory' and not granted", [participants.map(p => p.pid)])).rows[0].n
      if (waiters === 2) break
      await new Promise(done => setTimeout(done, 20))
    }
  } finally { await primary.query('commit') }
  const outcomes = await Promise.all(pending)
  expect(waiters).toBe(2)
  expect(new Set(participants.map(p => p.pid)).size).toBe(2)
  return { participants, observedAdvisoryWaiters: waiters, outcomes }
}

it('같은 작업의 같은 금액을 두 번 요청하면 한 번만 차감한다', async () => {
  const ids = await fixture([5])
  const replies = [await hold(primary, ids), await hold(primary, ids)]
  const state = await totals(ids)
  record('같은 작업의 같은 금액을 두 번 요청하면 한 번만 차감한다', { replies, ...state })
  expect(replies).toEqual([expect.objectContaining({ ok: true, held: 5, replayed: false }), expect.objectContaining({ ok: true, held: 5, replayed: true })])
  expect(state).toMatchObject({ charged: 5, hold_rows: 1, balance: 0 })
})

it('같은 작업의 같은 금액을 동시에 요청하면 한 번만 차감한다', async () => {
  const ids = await fixture()
  const concurrent = await race(ids, [client => hold(client, ids), client => hold(client, ids)])
  const replies = concurrent.outcomes.flatMap(r => r.accepted ? [r.value] : [])
  const state = await totals(ids)
  record('같은 작업의 같은 금액을 동시에 요청하면 한 번만 차감한다', { ...concurrent, ...state })
  expect(replies).toHaveLength(2)
  expect(replies.filter(r => r.replayed)).toHaveLength(1)
  expect(state).toMatchObject({ charged: 5, hold_rows: 1, balance: 95 })
}, 30000)

it('같은 작업에 다른 금액을 요청하면 추가 차감 없이 거절한다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  const outcome = await capture(() => hold(primary, ids, 6))
  const state = await totals(ids)
  record('같은 작업에 다른 금액을 요청하면 추가 차감 없이 거절한다', { outcome, ...state })
  expect(outcome).toEqual({ accepted: false, error: 'take_hold_amount_mismatch' })
  expect(state.charged).toBe(5)
})

it('작업에 속하지 않은 작업공간으로 요청하면 어느 원장에서도 추가 차감하지 않는다', async () => {
  const ids = await fixture(), other = await fixture()
  await hold(primary, ids)
  const outcome = await capture(() => hold(primary, { ...other, job: ids.job }))
  const original = await totals(ids), wrong = await totals(other)
  record('작업에 속하지 않은 작업공간으로 요청하면 어느 원장에서도 추가 차감하지 않는다', { outcome, original, wrong })
  expect(outcome).toEqual({ accepted: false, error: 'take_hold_workspace_mismatch' })
  expect(original.charged).toBe(5)
  expect(wrong.charged).toBe(0)
})

it('지급분 두 곳에서 같은 작업을 다시 차감하면 분할 행의 합계만 한 번 차감한다', async () => {
  const ids = await fixture([2, 98])
  await hold(primary, ids)
  const replay = await hold(primary, ids)
  const state = await totals(ids)
  record('지급분 두 곳에서 같은 작업을 다시 차감하면 분할 행의 합계만 한 번 차감한다', { replay, ...state })
  expect(replay.replayed).toBe(true)
  expect(state).toMatchObject({ charged: 5, hold_rows: 2, balance: 95 })
})

it('같은 작업 반환을 동시에 반복하면 원래 차감한 금액만 반환한다', async () => {
  const ids = await fixture([2, 98])
  await hold(primary, ids)
  const concurrent = await race(ids, [client => release(client, ids.job), client => release(client, ids.job)])
  const repeated = await release(primary, ids.job)
  const state = await totals(ids)
  record('같은 작업 반환을 동시에 반복하면 원래 차감한 금액만 반환한다', { ...concurrent, repeated, ...state })
  expect(concurrent.outcomes.flatMap(r => r.accepted ? [r.value] : []).sort()).toEqual([0, 5])
  expect(repeated).toBe(0)
  expect(state).toMatchObject({ charged: 5, released: 5, balance: 100, release_rows: 2 })
}, 30000)

it('이미 반환한 작업을 다시 차감하면 추가 차감 없이 거절한다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  await release(primary, ids.job)
  const outcome = await capture(() => hold(primary, ids))
  const state = await totals(ids)
  record('이미 반환한 작업을 다시 차감하면 추가 차감 없이 거절한다', { outcome, ...state })
  expect(outcome).toEqual({ accepted: false, error: 'take_hold_already_released' })
  expect(state).toMatchObject({ charged: 5, released: 5, balance: 100 })
})

it('차감 재전송과 반환이 경쟁하면 반환한 금액이 다시 차감되지 않는다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  const concurrent = await race<Hold | number>(ids, [client => hold(client, ids), client => release(client, ids.job)])
  const state = await totals(ids)
  record('차감 재전송과 반환이 경쟁하면 반환한 금액이 다시 차감되지 않는다', { ...concurrent, ...state })
  expect(state).toMatchObject({ charged: 5, released: 5, balance: 100 })
}, 30000)

it('예전 중복 차감과 일부 반환이 있으면 지급분별 미반환 총액을 모두 반환한다', async () => {
  const ids = await fixture()
  for (const grant of [ids.grants[0], null]) {
    for (const delta of [-5, -5, 3]) await primary.query(`insert into ${schema}.take_ledger(workspace_id,grant_id,kind,delta,ref_kind,ref_id) values($1,$2,$3,$4,'generation_job',$5)`, [ids.workspace, grant, delta < 0 ? 'hold' : 'hold_release', delta, ids.job])
  }
  const released = await release(primary, ids.job), repeated = await release(primary, ids.job)
  const state = await totals(ids)
  record('예전 중복 차감과 일부 반환이 있으면 지급분별 미반환 총액을 모두 반환한다', { released, repeated, ...state })
  expect(released).toBe(14)
  expect(repeated).toBe(0)
  expect(state).toMatchObject({ charged: 20, released: 20, balance: 100 })
})

it.each(['failed', 'cancelled', 'completed'])('최초 차감 전에 작업이 %s 상태이면 차감을 거절한다', async value => {
  const ids = await fixture()
  await status(ids, value)
  const outcome = await capture(() => hold(primary, ids))
  const state = await totals(ids)
  record(`최초 차감 전에 작업이 ${value} 상태이면 차감을 거절한다`, { outcome, ...state })
  expect(outcome).toEqual({ accepted: false, error: 'take_hold_job_not_queued' })
  expect(state.charged).toBe(0)
})

it('완료된 작업의 기존 차감을 다시 요청하면 기존 처리를 반환한다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  await status(ids, 'completed')
  const reply = await hold(primary, ids)
  const state = await totals(ids)
  record('완료된 작업의 기존 차감을 다시 요청하면 기존 처리를 반환한다', { reply, ...state })
  expect(reply).toMatchObject({ ok: true, held: 5, replayed: true })
  expect(state.charged).toBe(5)
})

it('없는 작업의 차감을 요청하면 원장을 기록하지 않는다', async () => {
  const ids = await fixture()
  const outcome = await capture(() => hold(primary, { ...ids, job: randomUUID() }))
  const state = await totals(ids)
  record('없는 작업의 차감을 요청하면 원장을 기록하지 않는다', { outcome, ...state })
  expect(outcome).toEqual({ accepted: false, error: 'take_hold_job_missing' })
  expect(state.charged).toBe(0)
})

it('실패한 작업을 반환하고 새 작업을 요청하면 새 작업만 정상 차감한다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  await status(ids, 'failed')
  await release(primary, ids.job)
  const old = await capture(() => hold(primary, ids))
  const next = await hold(primary, { ...ids, job: await addJob(ids) })
  const state = await totals(ids)
  record('실패한 작업을 반환하고 새 작업을 요청하면 새 작업만 정상 차감한다', { old, next, ...state })
  expect(old).toEqual({ accepted: false, error: 'take_hold_already_released' })
  expect(next).toMatchObject({ ok: true, held: 5, replayed: false })
  expect(state).toMatchObject({ charged: 10, released: 5, balance: 95 })
})

it('실패 처리의 행 잠금 뒤에 차감이 도착하면 실패 확정 후 차감을 거절한다', async () => {
  const ids = await fixture()
  await primary.query('begin')
  await status(ids, 'failed')
  const pending = capture(() => hold(clients[1], ids))
  await new Promise(done => setTimeout(done, 150))
  await primary.query('commit')
  const outcome = await pending
  const returned = await release(primary, ids.job)
  const state = await totals(ids)
  record('실패 처리의 행 잠금 뒤에 차감이 도착하면 실패 확정 후 차감을 거절한다', { outcome, returned, ...state })
  expect(outcome).toEqual({ accepted: false, error: 'take_hold_job_not_queued' })
  expect(state).toMatchObject({ charged: 0, released: 0, balance: 100 })
})

it('차감 확정 전에 실패 처리가 도착하면 확정한 차감을 모두 반환한다', async () => {
  const ids = await fixture()
  await primary.query('begin')
  const reply = await hold(primary, ids)
  const pending = (async () => {
    await clients[1].query(`update ${schema}.generation_jobs set status='failed' where id=$1`, [ids.job])
    return release(clients[1], ids.job)
  })()
  await new Promise(done => setTimeout(done, 150))
  await primary.query('commit')
  const returned = await pending
  const state = await totals(ids)
  record('차감 확정 전에 실패 처리가 도착하면 확정한 차감을 모두 반환한다', { reply, returned, ...state })
  expect(returned).toBe(5)
  expect(state).toMatchObject({ charged: 5, released: 5, balance: 100 })
})

it('다른 작업이 남은 잔액을 동시에 사용하면 잔액을 넘는 차감을 거절한다', async () => {
  const ids = await fixture([5]), other = { ...ids, job: await addJob(ids) }
  const concurrent = await race(ids, [client => hold(client, ids), client => hold(client, other)])
  const replies = concurrent.outcomes.flatMap(r => r.accepted ? [r.value] : [])
  const state = await totals(ids)
  record('다른 작업이 남은 잔액을 동시에 사용하면 잔액을 넘는 차감을 거절한다', { ...concurrent, ...state })
  expect(replies.filter(r => r.ok)).toHaveLength(1)
  expect(replies.filter(r => r.insufficient)).toHaveLength(1)
  expect(state).toMatchObject({ charged: 5, balance: 0 })
}, 30000)

it('환불하거나 만료한 지급분이 있으면 기존 계산대로 사용 가능한 지급분에서만 차감한다', async () => {
  const ids = await fixture([10, 10, 10])
  await primary.query(`update ${schema}.take_ledger set expires_at=now()-interval '1 day' where id=$1`, [ids.grants[0]])
  await primary.query(`insert into ${schema}.take_ledger(workspace_id,grant_id,kind,delta,ref_kind,ref_id) values($1,$2,'refund_revoke',-10,'audit',$3)`, [ids.workspace, ids.grants[1], randomUUID()])
  const reply = await hold(primary, ids)
  const allocation = (await primary.query(`select grant_id,delta from ${schema}.take_ledger where ref_id=$1 and kind='hold'`, [ids.job])).rows
  record('환불하거나 만료한 지급분이 있으면 기존 계산대로 사용 가능한 지급분에서만 차감한다', { reply, allocation, usableGrant: ids.grants[2] })
  expect(reply).toMatchObject({ ok: true, balance: 10, held: 5 })
  expect(allocation).toEqual([{ grant_id: ids.grants[2], delta: -5 }])
})

it('한도 미적용 작업을 반복하면 지급분 없는 차감도 한 번만 기록한다', async () => {
  const ids = await fixture([])
  await hold(primary, ids, 5, false)
  const replay = await hold(primary, ids, 5, false)
  const returned = await release(primary, ids.job)
  const state = await totals(ids)
  record('한도 미적용 작업을 반복하면 지급분 없는 차감도 한 번만 기록한다', { replay, returned, ...state })
  expect(replay).toMatchObject({ ok: true, held: 5, replayed: true })
  expect(returned).toBe(5)
  expect(state).toMatchObject({ charged: 5, released: 5, balance: 0 })
})
