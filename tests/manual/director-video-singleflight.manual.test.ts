// 같은 샷의 영상은 요청 경로와 요청키가 달라도 진행 중 한 건만 접수하고 끝난 뒤에 새 테이크를 허용한다.
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

const connectionString = process.env.DIRECTOR_VIDEO_DATABASE_URL
const ca = process.env.DIRECTOR_VIDEO_CA
const schema = process.env.DIRECTOR_VIDEO_SCHEMA ?? ''
const output = process.env.DIRECTOR_VIDEO_OUTPUT ?? ''
if (!connectionString || !ca || !/^director_video_[a-f0-9]{32}$/.test(schema) || !output) {
  throw new Error('Run node tests/manual/director-video-singleflight.verify.mjs')
}
const clients = Array.from({ length: 3 }, () => new Client({ connectionString, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 }))
const primary = clients[0]
const observations: Record<string, unknown>[] = []
type Fixture = { owner: string; workspace: string; project: string; shot: string }
type Reservation = { video_clip_id: string; job_id: string; take_number: number; replayed: boolean }
type Outcome = { accepted: boolean; value?: Reservation; error?: string; code?: string; detail?: string }

beforeAll(async () => {
  await Promise.all(clients.map(client => client.connect()))
  await primary.query(`insert into ${schema}.fal_key_limits(key_id,max_inflight) values ('verify-no-provider',100)`)
}, 30000)
afterAll(async () => {
  const report = JSON.parse(readFileSync(output, 'utf8'))
  report.observations = observations
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  await Promise.all(clients.map(async client => { await client.query('rollback').catch(() => {}); await client.end() }))
}, 30000)

async function fixture(): Promise<Fixture> {
  const ids = { owner: randomUUID(), workspace: randomUUID(), project: randomUUID(), shot: `verify-${randomUUID()}` }
  await primary.query(`insert into ${schema}.workspaces(id,name,slug,owner_id) values($1,'Video verification',$2,$3)`, [ids.workspace, randomUUID(), ids.owner])
  await primary.query(`insert into ${schema}.projects(id,workspace_id,title) values($1,$2,'Video verification')`, [ids.project, ids.workspace])
  const scene = (await primary.query(`insert into ${schema}.scenes(project_id,scene_id,narrative_time) values($1,'verify-scene','present') returning id`, [ids.project])).rows[0].id
  await primary.query(`insert into ${schema}.shots(project_id,scene_id,shot_id,shot_type,character_appearance_keys) values($1,$2,$3,'wide','{}')`, [ids.project, scene, ids.shot])
  await primary.query(`insert into ${schema}.take_ledger(workspace_id,kind,delta,ref_kind,ref_id) values($1,'grant_purchase',100,'verify',$2)`, [ids.workspace, randomUUID()])
  return ids
}
const target = (ids: Fixture, clip?: string) => ({ workspaceId: ids.workspace, writerShotId: ids.shot, retakeMode: clip ? 'regeneration' : 'new_take', ...(clip ? { videoClipId: clip } : {}) })
async function reserve(client: Client, ids: Fixture, key: string, clip?: string, snapshot: Record<string, unknown> = {}): Promise<Reservation> {
  const fn = clip ? 'reserve_director_video_regeneration' : 'reserve_director_video_take'
  return (await client.query(`select * from ${schema}.${fn}($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8,$9,$10)`,
    [ids.project, clip ?? ids.shot, 'seedance', JSON.stringify(target(ids, clip)), key, JSON.stringify(snapshot), ids.owner, ids.workspace, 'fal', 'ui'])).rows[0]
}
async function counts(ids: Fixture) {
  return (await primary.query(`select
    (select count(*)::int from ${schema}.video_clips where project_id=$1) as clips,
    (select count(*)::int from ${schema}.generation_jobs where project_id=$1) as jobs,
    (select count(*)::int from ${schema}.generation_jobs where project_id=$1 and status='queued') as queued,
    (select coalesce(-sum(delta),0)::int from ${schema}.take_ledger where workspace_id=$2 and kind='hold') as charged`, [ids.project, ids.workspace])).rows[0]
}
async function finish(job: string, status = 'completed') {
  await primary.query(`update ${schema}.generation_jobs set status=$2,
    error=case when $2='failed' then 'Verification failure' else null end,
    last_error=case when $2='failed' then 'Verification failure' else null end where id=$1`, [job, status])
}
const locks = (ids: Fixture) => [`${ids.project}:shot:${ids.shot}`, `${ids.project}:${ids.shot}`]
function record(id: string, evidence: Record<string, unknown>) { observations.push({ id, ...evidence }) }

async function race(lockNames: string[], calls: [(client: Client) => Promise<Reservation>, (client: Client) => Promise<Reservation>]) {
  await primary.query('begin')
  for (const lock of [...new Set(lockNames)].sort()) {
    await primary.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [lock])
  }
  const participants = await Promise.all(clients.slice(1).map(async client => {
    await client.query('begin isolation level read committed')
    await client.query("set local statement_timeout = '15s'")
    return (await client.query('select pg_backend_pid() as pid, txid_current()::text as transaction_id')).rows[0]
  }))
  const pending = clients.slice(1).map(async (client, index): Promise<Outcome> => {
    try { const value = await calls[index](client); await client.query('commit'); return { accepted: true, value } }
    catch (error) {
      await client.query('rollback')
      const failure = error as { message: string; code?: string; detail?: string }
      return { accepted: false, error: failure.message, code: failure.code, detail: failure.detail }
    }
  })
  let waiters = 0
  try {
    const deadline = Date.now() + 7000
    while (Date.now() < deadline) {
      waiters = (await primary.query("select count(*)::int as count from pg_locks where pid=any($1::int[]) and locktype='advisory' and not granted", [participants.map(p => p.pid)])).rows[0].count
      if (waiters === 2) break
      await new Promise(done => setTimeout(done, 20))
    }
  } finally { await primary.query('commit') }
  const outcomes = await Promise.all(pending)
  expect(waiters).toBe(2)
  expect(new Set(participants.map(p => p.pid)).size).toBe(2)
  return { participants, observedAdvisoryWaiters: waiters, outcomes }
}

it('다른 창에서 같은 샷의 영상을 동시에 생성하면 한 작업만 접수하고 차감도 그 작업만 한다', async () => {
  const ids = await fixture()
  const concurrent = await race(locks(ids), [c => reserve(c, ids, randomUUID(), undefined, { prompt: 'first' }), c => reserve(c, ids, randomUUID(), undefined, { prompt: 'second' })])
  const accepted = concurrent.outcomes.flatMap(item => item.value ? [item.value] : [])
  for (const item of accepted) await primary.query(`select ${schema}.take_hold($1,5,$2,true)`, [ids.workspace, item.job_id])
  const state = await counts(ids)
  record('different-keys-same-shot', { ...concurrent, ...state, holdScope: 'One explicit 5 Take hold per accepted distinct job; no API or provider called.' })
  expect(accepted).toHaveLength(1)
  expect(state).toMatchObject({ clips: 1, jobs: 1, queued: 1, charged: 5 })
  expect(concurrent.outcomes.find(item => !item.accepted)).toMatchObject({ error: 'director_video_shot_busy', code: 'P0001', detail: accepted[0].job_id })
}, 30000)

it('같은 영상 요청을 다시 보내면 기존 작업을 재사용하고 다른 입력으로 바꾸면 거절한다', async () => {
  const ids = await fixture(), key = randomUUID()
  const concurrent = await race(locks(ids), [c => reserve(c, ids, key), c => reserve(c, ids, key)])
  const accepted = concurrent.outcomes.flatMap(item => item.value ? [item.value] : [])
  record('same-key-replay', { ...concurrent, ...await counts(ids) })
  expect(accepted).toHaveLength(2)
  expect(accepted.filter(item => item.replayed)).toHaveLength(1)
  expect(new Set(accepted.map(item => item.job_id)).size).toBe(1)
  await expect(reserve(primary, ids, key, undefined, { prompt: 'changed' })).rejects.toThrow('idempotency mismatch')
}, 30000)

it('같은 기존 영상을 동시에 다시 만들면 기존 동시 재생성 방어를 유지한다', async () => {
  const ids = await fixture(), initial = await reserve(primary, ids, randomUUID())
  await finish(initial.job_id)
  const concurrent = await race(locks(ids), [c => reserve(c, ids, randomUUID(), initial.video_clip_id), c => reserve(c, ids, randomUUID(), initial.video_clip_id)])
  record('same-clip-regeneration', { ...concurrent, ...await counts(ids) })
  expect(concurrent.outcomes.filter(item => item.accepted)).toHaveLength(1)
  expect(concurrent.outcomes.find(item => !item.accepted)?.error).toBe('clip already has a queued attempt')
}, 30000)

it('같은 샷에서 새 테이크 생성과 기존 영상 재생성이 겹치면 한 작업만 접수한다', async () => {
  const ids = await fixture(), initial = await reserve(primary, ids, randomUUID())
  await finish(initial.job_id)
  const concurrent = await race(locks(ids), [c => reserve(c, ids, randomUUID()), c => reserve(c, ids, randomUUID(), initial.video_clip_id)])
  const state = await counts(ids)
  record('new-take-vs-regeneration', { ...concurrent, ...state })
  expect(concurrent.outcomes.filter(item => item.accepted)).toHaveLength(1)
  expect(state.queued).toBe(1)
  expect(concurrent.outcomes.find(item => !item.accepted)?.error).toBe('director_video_shot_busy')
}, 30000)

it('같은 샷의 서로 다른 기존 영상을 동시에 재생성하면 한 작업만 접수한다', async () => {
  const ids = await fixture(), first = await reserve(primary, ids, randomUUID())
  await finish(first.job_id)
  const second = await reserve(primary, ids, randomUUID())
  await finish(second.job_id)
  const concurrent = await race(locks(ids), [c => reserve(c, ids, randomUUID(), first.video_clip_id), c => reserve(c, ids, randomUUID(), second.video_clip_id)])
  record('different-clips-same-shot', { ...concurrent, ...await counts(ids) })
  expect(concurrent.outcomes.filter(item => item.accepted)).toHaveLength(1)
  expect(concurrent.outcomes.find(item => !item.accepted)?.error).toBe('director_video_shot_busy')
}, 30000)

it('서로 다른 샷의 영상을 동시에 요청하면 각 샷에 작업을 접수한다', async () => {
  const first = await fixture(), second = await fixture()
  const concurrent = await race([...locks(first), ...locks(second)], [c => reserve(c, first, randomUUID()), c => reserve(c, second, randomUUID())])
  record('different-shots', { ...concurrent, first: await counts(first), second: await counts(second) })
  expect(concurrent.outcomes.filter(item => item.accepted)).toHaveLength(2)
}, 30000)

it.each([['완료', 'completed'], ['실패', 'failed']])('이전 영상 생성이 %s되면 같은 샷에 새 테이크를 만들 수 있다', async (_label, status) => {
  const ids = await fixture(), first = await reserve(primary, ids, randomUUID())
  await finish(first.job_id, status)
  const second = await reserve(primary, ids, randomUUID())
  record(`terminal-${status}`, { first, second, ...await counts(ids) })
  expect(second).toMatchObject({ replayed: false, take_number: 2 })
  expect(second.job_id).not.toBe(first.job_id)
})

async function batchReservation(ids: Fixture) {
  const batch = randomUUID(), item = randomUUID(), token = randomUUID()
  await primary.query(`select ${schema}.create_director_video_batch($1,$2,$3,$4::jsonb)`, [batch, ids.project, ids.owner, JSON.stringify([{ id: item, shot_id: ids.shot, prepared: { verification: true } }])])
  await primary.query(`select * from ${schema}.claim_director_video_batch($1,$2)`, [batch, token])
  const args = JSON.stringify({ projectId: ids.project, shotId: ids.shot, userId: ids.owner, workspaceId: ids.workspace, idempotencyKey: item, model: 'seedance', target: target(ids), inputSnapshot: {}, provider: 'fal', actor: 'ui', override: {} })
  return async (client: Client): Promise<Reservation> => (await client.query(`select * from ${schema}.reserve_director_video_batch_item($1,$2,$3::jsonb)`, [item, token, args])).rows[0]
}

it('일괄 생성과 개별 영상 생성이 같은 샷에서 겹치면 한 작업만 접수한다', async () => {
  const ids = await fixture(), submitBatch = await batchReservation(ids)
  const concurrent = await race(locks(ids), [submitBatch, c => reserve(c, ids, randomUUID())])
  record('batch-vs-individual', { ...concurrent, ...await counts(ids) })
  expect(concurrent.outcomes.filter(item => item.accepted)).toHaveLength(1)
  expect((await counts(ids)).queued).toBe(1)
  expect(['batch_shot_busy', 'director_video_shot_busy']).toContain(concurrent.outcomes.find(item => !item.accepted)?.error)
}, 30000)

it('같은 일괄 항목이나 같은 재생성 요청을 다시 보내면 이미 접수한 작업을 재사용한다', async () => {
  const ids = await fixture(), submitBatch = await batchReservation(ids)
  const first = await submitBatch(primary), replay = await submitBatch(primary)
  expect(replay).toMatchObject({ job_id: first.job_id, replayed: true })
  await finish(first.job_id)
  const key = randomUUID()
  const regeneration = await reserve(primary, ids, key, first.video_clip_id)
  const regenerationReplay = await reserve(primary, ids, key, first.video_clip_id)
  record('batch-and-regeneration-replay', { first, replay, regeneration, regenerationReplay, ...await counts(ids) })
  expect(regenerationReplay).toMatchObject({ job_id: regeneration.job_id, replayed: true })
})

it('예전 작업의 대상 정보가 빠져 있어도 연결된 영상이 같은 샷이면 중복 생성을 막는다', async () => {
  const ids = await fixture(), initial = await reserve(primary, ids, randomUUID())
  await primary.query(`update ${schema}.generation_jobs set target='{}' where id=$1`, [initial.job_id])
  let failure: unknown
  try { await reserve(primary, ids, randomUUID()) } catch (error) { failure = error }
  record('legacy-clip-linkage', { initial, error: failure instanceof Error ? failure.message : null, ...await counts(ids) })
  expect(failure).toMatchObject({ message: 'director_video_shot_busy', detail: initial.job_id })
})
