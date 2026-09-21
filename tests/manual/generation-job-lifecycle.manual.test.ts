// 실제 SQL로 반환/삭제와 차감/완료의 순서를 바꾸어 확인한다.
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

const connectionString = process.env.JOB_LIFECYCLE_DATABASE_URL
const ca = process.env.JOB_LIFECYCLE_CA
const schema = process.env.JOB_LIFECYCLE_SCHEMA ?? ''
const output = process.env.JOB_LIFECYCLE_OUTPUT ?? ''
const baseline = process.env.JOB_LIFECYCLE_BASELINE === 'true'
if (!connectionString || !ca || !/^job_lifecycle_[a-f0-9]{32}$/.test(schema) || !output) {
  throw new Error('Run node tests/manual/generation-job-lifecycle.verify.mjs [--baseline]')
}
const clients = Array.from({ length: 3 }, () => new Client({ connectionString, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 }))
const primary = clients[0]
const observations: Record<string, unknown>[] = []
type Fixture = { workspace: string; project: string; job: string }

beforeAll(async () => { await Promise.all(clients.map(client => client.connect())) }, 30000)
afterAll(async () => {
  const result = JSON.parse(readFileSync(output, 'utf8'))
  result.observations = observations
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
  await Promise.all(clients.map(async client => { await client.query('rollback').catch(() => {}); await client.end() }))
}, 30000)

async function fixture(kind = 'shot_video'): Promise<Fixture> {
  const ids = { workspace: randomUUID(), project: randomUUID(), job: randomUUID() }, owner = randomUUID()
  await primary.query(`insert into ${schema}.workspaces(id,name,slug,owner_id) values($1,'Lifecycle verification',$2,$3)`, [ids.workspace, randomUUID(), owner])
  await primary.query(`insert into ${schema}.projects(id,workspace_id,title) values($1,$2,'Lifecycle verification')`, [ids.project, ids.workspace])
  await primary.query(`insert into ${schema}.take_ledger(workspace_id,kind,delta,ref_kind,ref_id) values($1,'grant_purchase',100,'audit',$2)`, [ids.workspace, randomUUID()])
  await primary.query(`insert into ${schema}.generation_jobs(id,project_id,workspace_id,user_id,request_id,model,kind,status,provider,actor,target)
    values($1,$2,$3,$4,$5,'seedance',$6,'queued','fal','ui','{}')`, [ids.job, ids.project, ids.workspace, owner, `isolated:${ids.job}`, kind])
  return ids
}
async function hold(client: Client, ids: Fixture) {
  return (await client.query(`select ${schema}.take_hold($1,5,$2,true) as result`, [ids.workspace, ids.job])).rows[0].result
}
async function release(client: Client, job: string): Promise<number> {
  return (await client.query(`select ${schema}.take_release_for_job($1) as amount`, [job])).rows[0].amount
}
async function remove(client: Client, job: string, afterFirstStatement?: () => Promise<void>): Promise<boolean> {
  if (baseline) {
    // Original route: release RPC completes before the independent DELETE starts.
    await release(client, job)
    await afterFirstStatement?.()
    await client.query(`delete from ${schema}.generation_jobs where id=$1`, [job])
    return true
  }
  const deleted = (await client.query(`select ${schema}.delete_generation_job_with_release($1) as deleted`, [job])).rows[0].deleted
  // A competing request after the first observable database response sees the atomic result.
  await afterFirstStatement?.()
  return deleted
}
async function complete(client: Client, job: string) {
  // The existing completion path only updates queued rows; it cannot revive released jobs.
  return (await client.query(`update ${schema}.generation_jobs set status='completed' where id=$1 and status='queued'`, [job])).rowCount
}
async function state(ids: Fixture) {
  const job = (await primary.query(`select status,error,last_error,completed_at,updated_at from ${schema}.generation_jobs where id=$1`, [ids.job])).rows[0] ?? null
  const ledger = (await primary.query(`select coalesce(sum(delta),0)::int as balance,
    coalesce(-sum(delta) filter(where kind='hold'),0)::int as charged,
    coalesce(sum(delta) filter(where kind='hold_release'),0)::int as released
    from ${schema}.take_ledger where workspace_id=$1`, [ids.workspace])).rows[0]
  return { job, ...ledger }
}
async function capture(call: () => Promise<unknown>) {
  try { return { accepted: true, value: await call() } }
  catch (error) { return { accepted: false, error: error instanceof Error ? error.message : String(error) } }
}
function record(behavior: string, data: Record<string, unknown>) { observations.push({ behavior, ...data }) }
const pause = () => new Promise(done => setTimeout(done, 150))

it('이미 완료된 영상에 늦은 실패 알림이 도착하면 차감액을 반환하지 않는다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  await complete(primary, ids.job)
  const returned = await release(primary, ids.job), current = await state(ids)
  record('이미 완료된 영상에 늦은 실패 알림이 도착하면 차감액을 반환하지 않는다', { returned, ...current })
  expect(returned).toBe(0)
  expect(current).toMatchObject({ job: { status: 'completed' }, charged: 5, released: 0, balance: 95 })
})

it('완료 처리의 행 잠금 뒤에 반환이 도착하면 완료 확정 후 반환하지 않는다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  await primary.query('begin')
  await complete(primary, ids.job)
  const pending = release(clients[1], ids.job)
  await pause()
  await primary.query('commit')
  const returned = await pending, current = await state(ids)
  record('완료 처리의 행 잠금 뒤에 반환이 도착하면 완료 확정 후 반환하지 않는다', { returned, ...current })
  expect(returned).toBe(0)
  expect(current).toMatchObject({ job: { status: 'completed' }, released: 0, balance: 95 })
})

it('작업 삭제와 늦은 차감이 겹치면 작업을 지우기 전에 남은 차감액을 모두 반환한다', async () => {
  const ids = await fixture()
  let late: unknown
  const deleted = await remove(primary, ids.job, async () => { late = await capture(() => hold(clients[1], ids)) })
  const current = await state(ids)
  record('작업 삭제와 늦은 차감이 겹치면 작업을 지우기 전에 남은 차감액을 모두 반환한다', { deleted, late, ...current })
  expect(deleted).toBe(true)
  expect(current).toMatchObject({ job: null, balance: 100 })
  expect(current.charged).toBe(current.released)
})

it('차감이 먼저 잠근 작업을 삭제하면 확정된 차감액을 반환한 뒤 삭제한다', async () => {
  const ids = await fixture()
  await primary.query('begin')
  await hold(primary, ids)
  const pending = remove(clients[1], ids.job)
  await pause()
  await primary.query('commit')
  const deleted = await pending, current = await state(ids)
  record('차감이 먼저 잠근 작업을 삭제하면 확정된 차감액을 반환한 뒤 삭제한다', { deleted, ...current })
  expect(deleted).toBe(true)
  expect(current).toMatchObject({ job: null, charged: 5, released: 5, balance: 100 })
})

it('삭제가 먼저 잠근 작업에 차감이 도착하면 삭제 확정 후 차감을 거절한다', async () => {
  const ids = await fixture()
  await primary.query('begin')
  const deleted = await remove(primary, ids.job)
  const pending = capture(() => hold(clients[1], ids))
  await pause()
  await primary.query('commit')
  const late = await pending, current = await state(ids)
  record('삭제가 먼저 잠근 작업에 차감이 도착하면 삭제 확정 후 차감을 거절한다', { deleted, late, ...current })
  expect(late).toEqual({ accepted: false, error: 'take_hold_job_missing' })
  expect(current).toMatchObject({ job: null, charged: 0, released: 0, balance: 100 })
})

it('작업 삭제 전에 영상이 완료되면 완료 기록과 차감액을 유지한다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  await primary.query('begin')
  await complete(primary, ids.job)
  const pending = remove(clients[1], ids.job)
  await pause()
  await primary.query('commit')
  const deleted = await pending, current = await state(ids)
  record('작업 삭제 전에 영상이 완료되면 완료 기록과 차감액을 유지한다', { deleted, ...current })
  expect(deleted).toBe(false)
  expect(current).toMatchObject({ job: { status: 'completed' }, charged: 5, released: 0, balance: 95 })
})

it('삭제가 먼저 잠근 작업에 완료가 도착하면 삭제 기록을 되살리지 않는다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  await primary.query('begin')
  await remove(primary, ids.job)
  const pending = complete(clients[1], ids.job)
  await pause()
  await primary.query('commit')
  const changed = await pending, current = await state(ids)
  record('삭제가 먼저 잠근 작업에 완료가 도착하면 삭제 기록을 되살리지 않는다', { changed, ...current })
  expect(changed).toBe(0)
  expect(current).toMatchObject({ job: null, charged: 5, released: 5, balance: 100 })
})

it.each(['queued', 'failed', 'cancelled'])('%s 작업을 삭제하면 남은 차감액을 반환하고 삭제한다', async status => {
  const ids = await fixture()
  await hold(primary, ids)
  await primary.query(`update ${schema}.generation_jobs set status=$2 where id=$1`, [ids.job, status])
  const deleted = await remove(primary, ids.job), current = await state(ids)
  record(`${status} 작업을 삭제하면 남은 차감액을 반환하고 삭제한다`, { deleted, ...current })
  expect(deleted).toBe(true)
  expect(current).toMatchObject({ job: null, charged: 5, released: 5, balance: 100 })
})

it('차감 없는 이미지 작업과 이미 삭제한 작업을 삭제하면 성공을 반환한다', async () => {
  const ids = await fixture('shot_storyboard')
  const first = await remove(primary, ids.job), second = await remove(primary, ids.job), missing = await remove(primary, randomUUID())
  const current = await state(ids)
  record('차감 없는 이미지 작업과 이미 삭제한 작업을 삭제하면 성공을 반환한다', { first, second, missing, ...current })
  expect([first, second, missing]).toEqual([true, true, true])
  expect(current).toMatchObject({ job: null, charged: 0, released: 0, balance: 100 })
})

it.each([false, true])('진행 중 작업을 반환하면 작업을 종료하고 늦은 완료나 차감을 받지 않는다: 기존 차감 %s', async charged => {
  const ids = await fixture()
  if (charged) await hold(primary, ids)
  const returned = await release(primary, ids.job)
  const completed = await complete(primary, ids.job), late = await capture(() => hold(primary, ids))
  const current = await state(ids)
  record(`진행 중 작업을 반환하면 작업을 종료하고 늦은 완료나 차감을 받지 않는다: 기존 차감 ${charged}`, { returned, completed, late, ...current })
  expect(returned).toBe(charged ? 5 : 0)
  expect(completed).toBe(0)
  expect(late).toEqual({ accepted: false, error: charged ? 'take_hold_already_released' : 'take_hold_job_not_queued' })
  expect(current).toMatchObject({ job: { status: 'failed', error: 'generation_job_released', last_error: 'generation_job_released' }, balance: 100 })
  expect(current.job.completed_at).toBeTruthy()
  expect(current.job.updated_at).toBeTruthy()
})

it('반환이 먼저 잠근 작업에 완료가 도착하면 반환 확정 후 완료를 거절한다', async () => {
  const ids = await fixture()
  await hold(primary, ids)
  await primary.query('begin')
  const returned = await release(primary, ids.job)
  const pending = complete(clients[1], ids.job)
  await pause()
  await primary.query('commit')
  const changed = await pending, current = await state(ids)
  record('반환이 먼저 잠근 작업에 완료가 도착하면 반환 확정 후 완료를 거절한다', { returned, changed, ...current })
  expect(changed).toBe(0)
  expect(current).toMatchObject({ job: { status: 'failed' }, charged: 5, released: 5, balance: 100 })
})
