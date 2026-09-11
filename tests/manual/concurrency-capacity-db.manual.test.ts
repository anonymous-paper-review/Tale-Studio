// 동시에 요청해도 기존 영상 3개·이미지 6개·전체 설정 용량을 지키는지 실제 개발 DB의 격리 공간에서 확인한다
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const connection = process.env.CAPACITY_AUDIT_DATABASE_URL
const schema = process.env.CAPACITY_AUDIT_SCHEMA ?? ''
const ca = process.env.CAPACITY_AUDIT_CA
const repoPath = process.env.CAPACITY_AUDIT_REPO_PATH ?? ''
const outputPath = process.env.CAPACITY_AUDIT_OUTPUT_PATH ?? ''
const clients: Client[] = []
let primary: Client
const observations: Observation[] = []
type Request = { userId: string; kind: string }
type Outcome = { accepted: boolean; error?: string }
type Observation = {
  id: string; promise: string; expectedLimit: number; baseline: number; requested: number;
  accepted: number; rejected: number; finalActive: number; sameReadBarrier: boolean;
  backendPids: number[]; transactionIds: string[]; preReadCounts: number[];
  observedAdvisoryWaiters: number | null; errors: string[]; observationValid: boolean; policyPassed: boolean;
}

async function activeCount(client: Client, userId?: string, category?: 'video' | 'image') {
  const kinds = category === 'video' ? ['shot_video', 'shot_previz_video'] : ['shot_storyboard']
  const result = await client.query(`select count(*)::int as count from ${schema}.generation_jobs
    where status='queued' and created_at >= now()-interval '30 minutes'
    ${userId ? 'and user_id=$1 and kind=any($2::text[])' : ''}`, userId ? [userId, kinds] : [])
  return result.rows[0].count as number
}

async function insert(client: Client, request: Request) {
  await client.query(`insert into ${schema}.generation_jobs(id,user_id,kind,status) values($1,$2,$3,'queued')`, [randomUUID(), request.userId, request.kind])
}

async function reset() {
  await primary.query(`truncate ${schema}.generation_jobs, ${schema}.generation_capacity_exempt_users, ${schema}.users`)
}

async function addUsers(userIds: string[]) {
  await primary.query(`insert into ${schema}.users(id) select unnest($1::uuid[])`, [userIds])
}

async function runRace(options: {
  id: string; promise: string; expectedLimit: number; baseline: number;
  requests: Request[]; userId?: string; category?: 'video' | 'image'; lockUserId?: string;
}) {
  const { requests } = options
  const racers = clients.slice(1, requests.length + 1)
  let pending: Promise<Outcome>[] = []
  try {
    if (options.lockUserId) {
      await primary.query('begin')
      await primary.query("select pg_advisory_xact_lock(hashtextextended($1::text || ':video-capacity',0))", [options.lockUserId])
    }
    const ready = await Promise.all(racers.map(async (client) => {
      await client.query('begin isolation level read committed')
      await client.query("set local statement_timeout = '20s'")
      const identity = (await client.query('select pg_backend_pid() as pid, txid_current()::text as transaction_id')).rows[0]
      const count = await activeCount(client, options.userId, options.category)
      return { ...identity, count }
    }))
    // 모든 사전 조회가 끝날 때까지 INSERT를 시작하지 않는 장벽이다.
    const startInsertionAt = Date.now()
    pending = racers.map(async (client, index): Promise<Outcome> => {
      try {
        await insert(client, requests[index])
        await client.query('commit')
        return { accepted: true }
      } catch (error) {
        await client.query('rollback')
        const message = error instanceof Error ? error.message : String(error)
        return { accepted: false, error: message }
      }
    })
    let waiters: number | null = null
    if (options.lockUserId) {
      waiters = 0
      while (Date.now() - startInsertionAt < 8000) {
        waiters = (await primary.query("select count(*)::int as count from pg_locks where pid=any($1::int[]) and locktype='advisory' and not granted", [ready.map((entry) => entry.pid)])).rows[0].count as number
        if (waiters === requests.length) break
        await new Promise((done) => setTimeout(done, 25))
      }
      await primary.query('commit')
    }
    const outcomes = await Promise.all(pending)
    const accepted = outcomes.filter((outcome) => outcome.accepted).length
    const errors = outcomes.flatMap((outcome) => outcome.error ? [outcome.error] : [])
    const finalActive = await activeCount(primary, options.userId, options.category)
    const sameReadBarrier = ready.every((entry) => entry.count === options.baseline)
    const observation: Observation = {
      id: options.id, promise: options.promise, expectedLimit: options.expectedLimit, baseline: options.baseline,
      requested: requests.length, accepted, rejected: requests.length - accepted, finalActive,
      sameReadBarrier, backendPids: ready.map((entry) => entry.pid), transactionIds: ready.map((entry) => entry.transaction_id),
      preReadCounts: ready.map((entry) => entry.count), observedAdvisoryWaiters: waiters, errors,
      observationValid: sameReadBarrier && new Set(ready.map((entry) => entry.pid)).size === requests.length
        && new Set(ready.map((entry) => entry.transaction_id)).size === requests.length
        && finalActive === options.baseline + accepted
        && errors.every((error) => error === 'video_user_at_capacity')
        && (!options.lockUserId || waiters === requests.length),
      policyPassed: finalActive <= options.expectedLimit && accepted === options.expectedLimit - options.baseline,
    }
    observations.push(observation)
  } finally {
    await primary.query('rollback').catch(() => {})
    await Promise.allSettled(pending)
    await Promise.allSettled(racers.map((client) => client.query('rollback')))
  }
}

describe.skipIf(!connection)('실제 동시 트랜잭션으로 확인하는 현재 용량 정책', () => {
  beforeAll(async () => {
    if (!/^capacity_audit_[a-f0-9]{32}$/.test(schema) || !ca || !repoPath || !outputPath) throw new Error('Use scripts/test-concurrency-capacity-db.mjs')
    await Promise.all(Array.from({ length: 13 }, async (_, index) => {
      const client = new Client({ connectionString: connection, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
      clients[index] = client
      await client.connect()
    }))
    primary = clients[0]
    await primary.query(`
      create table ${schema}.users(id uuid primary key);
      create table ${schema}.generation_jobs(id uuid primary key, user_id uuid references ${schema}.users(id), kind text not null,
        status text not null, created_at timestamptz not null default now());
      alter table ${schema}.users enable row level security;
      alter table ${schema}.generation_jobs enable row level security;
    `)
    const original = readFileSync(resolve(repoPath, 'supabase/migrations/20260909120000_generation_video_capacity_gate.sql'), 'utf8')
    const isolated = original.replaceAll('public.', `${schema}.`).replaceAll('auth.users', `${schema}.users`)
      .replaceAll('search_path = public', `search_path = ${schema}`).replace(/^notify pgrst, 'reload schema';\r?\n/m, '')
    if (/\b(public|auth)\./.test(isolated) || /\bnotify\s/i.test(isolated) || isolated === original) throw new Error('Migration isolation failed')
    await primary.query(isolated)

    await reset()
    const videoUser = randomUUID()
    await addUsers([videoUser])
    for (let index = 0; index < 2; index++) await insert(primary, { userId: videoUser, kind: 'shot_video' })
    await runRace({ id: 'user_video_3', promise: '영상이 2개 진행 중일 때 12건을 동시에 요청해도 진행 영상은 3개를 넘지 않는다', expectedLimit: 3, baseline: 2,
      requests: Array.from({ length: 12 }, (_, index) => ({ userId: videoUser, kind: index % 2 ? 'shot_video' : 'shot_previz_video' })), userId: videoUser, category: 'video', lockUserId: videoUser })

    await reset()
    const imageUser = randomUUID()
    await addUsers([imageUser])
    for (let index = 0; index < 5; index++) await insert(primary, { userId: imageUser, kind: 'shot_storyboard' })
    await runRace({ id: 'user_image_6', promise: '이미지가 5개 진행 중일 때 12건을 동시에 요청해도 진행 이미지 작업은 6개를 넘지 않는다', expectedLimit: 6, baseline: 5,
      requests: Array.from({ length: 12 }, () => ({ userId: imageUser, kind: 'shot_storyboard' })), userId: imageUser, category: 'image' })

    for (const limit of [68, 80]) {
      await reset()
      const baseline = limit - 1
      const users = Array.from({ length: baseline + 12 }, () => randomUUID())
      await addUsers(users)
      await primary.query(`insert into ${schema}.generation_jobs(id,user_id,kind,status)
        select id,id,'shot_storyboard','queued' from unnest($1::uuid[]) as fixture(id)`, [users.slice(0, baseline)])
      await runRace({ id: `global_${limit}`, promise: `전체 ${limit}칸 중 1칸이 남았을 때 서로 다른 12명이 동시에 요청해도 전체 진행 작업은 ${limit}개를 넘지 않는다`, expectedLimit: limit, baseline,
        requests: users.slice(baseline).map((userId, index) => ({ userId, kind: index % 2 ? 'shot_storyboard' : 'shot_video' })) })
    }

    await reset()
    const releasedUser = randomUUID()
    await addUsers([releasedUser])
    for (let index = 0; index < 3; index++) await insert(primary, { userId: releasedUser, kind: 'shot_video' })
    await primary.query(`update ${schema}.generation_jobs set status='completed' where id=(select id from ${schema}.generation_jobs order by id limit 1)`)
    await runRace({ id: 'completed_video_releases_slot', promise: '진행 영상 3개 중 1개가 끝나면 다음 영상 1개를 시작할 수 있다', expectedLimit: 3, baseline: 2,
      requests: [{ userId: releasedUser, kind: 'shot_video' }], userId: releasedUser, category: 'video' })
  }, 180000)

  afterAll(async () => {
    await Promise.allSettled(clients.map((client) => client.end()))
    if (outputPath) {
      const result = JSON.parse(readFileSync(outputPath, 'utf8'))
      result.observations = observations
      result.policyResults = observations.map(({ id, promise, expectedLimit, finalActive, policyPassed }) => ({ id, promise, expectedLimit, observedActive: finalActive, passed: policyPassed }))
      writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
    }
  }, 30000)

  for (const [id, label] of [
    ['user_video_3', '같은 사용자의 영상 12건이 실제로 잠금 대기한 뒤 진행된 결과를 기록한다'],
    ['user_image_6', '같은 사용자의 이미지 12건이 같은 작업 수를 읽은 뒤 저장된 결과를 기록한다'],
    ['global_68', '전체 67개를 읽은 12개의 독립 요청이 저장된 결과를 기록한다'],
    ['global_80', '전체 79개를 읽은 12개의 독립 요청이 저장된 결과를 기록한다'],
    ['completed_video_releases_slot', '완료된 영상이 진행 수에서 빠지고 다음 영상이 저장된 결과를 기록한다'],
  ]) {
    // 왜: 모의 응답이나 순차 실행을 실제 동시 DB 경합으로 오인하면 안 된다.
    it(label, () => {
      const observation = observations.find((entry) => entry.id === id)
      expect(observation).toBeDefined()
      expect(observation?.observationValid).toBe(true)
    })
  }

  for (const [id, promise] of [
    ['user_video_3', '영상이 2개 진행 중일 때 12건을 동시에 요청해도 진행 영상은 3개를 넘지 않는다'],
    ['user_image_6', '이미지가 5개 진행 중일 때 12건을 동시에 요청해도 진행 이미지 작업은 6개를 넘지 않는다'],
    ['global_68', '전체 68칸 중 1칸이 남았을 때 서로 다른 12명이 동시에 요청해도 전체 진행 작업은 68개를 넘지 않는다'],
    ['global_80', '전체 80칸 중 1칸이 남았을 때 서로 다른 12명이 동시에 요청해도 전체 진행 작업은 80개를 넘지 않는다'],
    ['completed_video_releases_slot', '진행 영상 3개 중 1개가 끝나면 다음 영상 1개를 시작할 수 있다'],
  ]) {
    // 왜: 기존 약속이 DB 최종 저장에서도 유지되는지 판정하며 실패를 정상 동작으로 바꾸지 않는다.
    it(promise, () => {
      const observation = observations.find((entry) => entry.id === id)
      expect(observation).toBeDefined()
      expect(observation?.finalActive).toBeLessThanOrEqual(observation?.expectedLimit ?? -1)
      expect(observation?.policyPassed).toBe(true)
    })
  }
})
