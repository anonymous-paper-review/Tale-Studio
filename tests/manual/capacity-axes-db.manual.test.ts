// 새 4축 트리거가 동시 요청에서도 개인 영상 3·개인 이미지 6·fal 계정별·전체 합계 상한을 지키는지 실제 개발 DB의 격리 공간에서 확인한다
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const connection = process.env.CAPACITY_AXES_DATABASE_URL
const schema = process.env.CAPACITY_AXES_SCHEMA ?? ''
const ca = process.env.CAPACITY_AXES_CA
const outputPath = process.env.CAPACITY_AXES_OUTPUT_PATH ?? ''
const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations/20260914110000_generation_capacity_all_axes.sql')
const videoKinds = ['shot_video', 'shot_previz_video']
const clients: Client[] = []
let primary: Client
const observations: Observation[] = []
type Request = { userId: string; kind: string; falKeyId?: string | null }
type Outcome = { accepted: boolean; error?: string }
type Observation = {
  id: string; promise: string; expectedLimit: number; expectedAccepted: number; baseline: number; requested: number;
  accepted: number; rejected: number; finalActive: number; sameReadBarrier: boolean;
  backendPids: number[]; transactionIds: string[]; preReadCounts: number[];
  observedAdvisoryWaiters: number | null; reassignedTo: string[] | null; allowedErrors: string[];
  errors: string[]; observationValid: boolean; policyPassed: boolean;
}

async function activeCount(client: Client, userId?: string, category?: 'video' | 'image') {
  // 새 트리거와 같은 기준이다 — 이미지 축은 "영상 kind 가 아닌 것" 전부를 센다.
  const scope = !userId ? ''
    : category === 'video' ? 'and user_id=$1 and kind=any($2::text[])'
      : 'and user_id=$1 and kind<>all($2::text[])'
  const result = await client.query(`select count(*)::int as count from ${schema}.generation_jobs
    where status='queued' and created_at >= now()-interval '30 minutes'
    ${scope}`, userId ? [userId, videoKinds] : [])
  return result.rows[0].count as number
}

async function insert(client: Client, request: Request) {
  await client.query(`insert into ${schema}.generation_jobs(id,user_id,kind,status,fal_key_id) values($1,$2,$3,'queued',$4)`,
    [randomUUID(), request.userId, request.kind, request.falKeyId ?? null])
}

async function reset() {
  await primary.query(`truncate ${schema}.generation_jobs, ${schema}.generation_capacity_exempt_users, ${schema}.fal_key_limits, ${schema}.users`)
}

async function addUsers(userIds: string[]) {
  await primary.query(`insert into ${schema}.users(id) select unnest($1::uuid[])`, [userIds])
}

async function addExemptUsers(userIds: string[]) {
  await primary.query(`insert into ${schema}.generation_capacity_exempt_users(user_id) select unnest($1::uuid[])`, [userIds])
}

async function setKeyLimits(limits: [string, number][]) {
  await primary.query(`insert into ${schema}.fal_key_limits(key_id,max_inflight)
    select key_id, max_inflight from unnest($1::text[], $2::int[]) as fixture(key_id, max_inflight)`,
  [limits.map((entry) => entry[0]), limits.map((entry) => entry[1])])
}

// baseline 은 fal_key_limits 를 넣기 전에 채운다 — 계정·전체 축이 켜지기 전이라 어느 키에 몇 개인지가 정확히 고정된다.
async function seedJobs(userIds: string[], kind: string, falKeyId: string | null) {
  await primary.query(`insert into ${schema}.generation_jobs(id,user_id,kind,status,fal_key_id)
    select id,id,$2,'queued',$3 from unnest($1::uuid[]) as fixture(id)`, [userIds, kind, falKeyId])
}

async function runRace(options: {
  id: string; promise: string; expectedLimit: number; expectedAccepted: number; baseline: number;
  requests: Request[]; userId?: string; category?: 'video' | 'image'; allowedErrors: string[];
  lockCapacity?: boolean; expectedKeyId?: string;
}) {
  const { requests } = options
  const racers = clients.slice(1, requests.length + 1)
  let pending: Promise<Outcome>[] = []
  try {
    if (options.lockCapacity) {
      await primary.query('begin')
      // 새 트리거는 축마다가 아니라 자리 확보 전체를 이 한 키로 직렬화한다.
      await primary.query("select pg_advisory_xact_lock(hashtextextended('generation-capacity',0))")
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
    if (options.lockCapacity) {
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
    let reassignedTo: string[] | null = null
    if (options.expectedKeyId) {
      const stored = await primary.query(`select fal_key_id from ${schema}.generation_jobs where user_id = any($1::uuid[])`, [requests.map((request) => request.userId)])
      reassignedTo = [...new Set(stored.rows.map((row) => row.fal_key_id as string))].sort()
    }
    const sameReadBarrier = ready.every((entry) => entry.count === options.baseline)
    const observation: Observation = {
      id: options.id, promise: options.promise, expectedLimit: options.expectedLimit, expectedAccepted: options.expectedAccepted,
      baseline: options.baseline, requested: requests.length, accepted, rejected: requests.length - accepted, finalActive,
      sameReadBarrier, backendPids: ready.map((entry) => entry.pid), transactionIds: ready.map((entry) => entry.transaction_id),
      preReadCounts: ready.map((entry) => entry.count), observedAdvisoryWaiters: waiters, reassignedTo,
      allowedErrors: options.allowedErrors, errors,
      observationValid: sameReadBarrier && new Set(ready.map((entry) => entry.pid)).size === requests.length
        && new Set(ready.map((entry) => entry.transaction_id)).size === requests.length
        && finalActive === options.baseline + accepted
        && errors.every((error) => options.allowedErrors.includes(error))
        && (!options.lockCapacity || waiters === requests.length),
      policyPassed: finalActive <= options.expectedLimit && accepted === options.expectedAccepted
        && (!options.expectedKeyId || (reassignedTo?.length === 1 && reassignedTo[0] === options.expectedKeyId)),
    }
    observations.push(observation)
  } finally {
    await primary.query('rollback').catch(() => {})
    await Promise.allSettled(pending)
    await Promise.allSettled(racers.map((client) => client.query('rollback')))
  }
}

describe.skipIf(!connection)('실제 동시 트랜잭션으로 확인하는 새 4축 용량 정책', () => {
  beforeAll(async () => {
    if (!/^capacity_axes_[a-f0-9]{32}$/.test(schema) || !ca || !outputPath) throw new Error('Use scripts/test-capacity-axes-db.mjs')
    await Promise.all(Array.from({ length: 13 }, async (_, index) => {
      const client = new Client({ connectionString: connection, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
      clients[index] = client
      await client.connect()
    }))
    primary = clients[0]
    // 새 마이그레이션은 예외 명단 표를 참조만 한다(만드는 쪽은 20260909120000) — 격리 공간에서는 같은 모양으로 직접 만든다.
    await primary.query(`
      create table ${schema}.users(id uuid primary key);
      create table ${schema}.generation_jobs(id uuid primary key, user_id uuid references ${schema}.users(id), kind text not null,
        status text not null, fal_key_id text, created_at timestamptz not null default now());
      create table ${schema}.generation_capacity_exempt_users(user_id uuid primary key references ${schema}.users(id) on delete cascade,
        updated_at timestamptz not null default now());
      alter table ${schema}.users enable row level security;
      alter table ${schema}.generation_jobs enable row level security;
      alter table ${schema}.generation_capacity_exempt_users enable row level security;
    `)
    const original = readFileSync(migrationPath, 'utf8')
    const isolated = original.replaceAll('public.', `${schema}.`).replaceAll('auth.users', `${schema}.users`)
      .replaceAll('search_path = public', `search_path = ${schema}`).replace(/^notify pgrst, 'reload schema';\r?\n/m, '')
    // 주석 줄은 실행 의미가 없으니 잔존 검사에서 뺀다 — 검사는 적용될 본문만 본다(주석은 그대로 적용한다).
    const executable = isolated.replace(/^[ \t]*--.*$/gm, '')
    if (/\b(public|auth)\./.test(executable) || /\bnotify\s/i.test(executable) || isolated === original) throw new Error('Migration isolation failed')
    await primary.query(isolated)

    await reset()
    const videoUser = randomUUID()
    await addUsers([videoUser])
    for (let index = 0; index < 2; index++) await insert(primary, { userId: videoUser, kind: 'shot_video' })
    await runRace({ id: 'user_video_3', promise: '영상이 2개 진행 중일 때 12건을 동시에 요청해도 진행 영상은 3개를 넘지 않는다',
      expectedLimit: 3, expectedAccepted: 1, baseline: 2,
      requests: Array.from({ length: 12 }, (_, index) => ({ userId: videoUser, kind: index % 2 ? 'shot_video' : 'shot_previz_video' })),
      userId: videoUser, category: 'video', allowedErrors: ['video_user_at_capacity'], lockCapacity: true })

    await reset()
    const imageUser = randomUUID()
    await addUsers([imageUser])
    for (let index = 0; index < 5; index++) await insert(primary, { userId: imageUser, kind: index < 3 ? 'shot_storyboard' : 'shot_rough_storyboard' })
    await runRace({ id: 'user_image_6', promise: '이미지가 5개 진행 중일 때 12건을 동시에 요청해도 진행 이미지 작업은 6개를 넘지 않는다',
      expectedLimit: 6, expectedAccepted: 1, baseline: 5,
      requests: Array.from({ length: 12 }, (_, index) => ({ userId: imageUser, kind: index % 2 ? 'shot_storyboard' : 'shot_rough_storyboard' })),
      userId: imageUser, category: 'image', allowedErrors: ['image_user_at_capacity'] })

    await reset()
    const globalUsers = Array.from({ length: 79 }, () => randomUUID())
    await addUsers(globalUsers)
    await seedJobs(globalUsers.slice(0, 33), 'shot_storyboard', 'key-a')
    await seedJobs(globalUsers.slice(33, 67), 'shot_storyboard', 'key-b')
    await setKeyLimits([['key-a', 34], ['key-b', 34]])
    await runRace({ id: 'global_68', promise: '전체 68칸(34+34) 중 1칸이 남았을 때 서로 다른 12명이 동시에 요청해도 전체 진행 작업은 68개를 넘지 않는다',
      expectedLimit: 68, expectedAccepted: 1, baseline: 67,
      requests: globalUsers.slice(67).map((userId, index) => ({ userId, kind: index % 2 ? 'shot_storyboard' : 'shot_video', falKeyId: index % 2 ? 'key-b' : 'key-a' })),
      allowedErrors: ['global_at_capacity', 'key_at_capacity'] })

    await reset()
    const spilloverUsers = Array.from({ length: 39 }, () => randomUUID())
    await addUsers(spilloverUsers)
    await seedJobs(spilloverUsers.slice(0, 34), 'shot_storyboard', 'key-a')
    await setKeyLimits([['key-a', 34], ['key-b', 34]])
    await runRace({ id: 'key_spillover', promise: '내가 고른 계정이 찼어도 옆 계정에 자리가 있으면 거절하지 않고 그 계정으로 넣는다',
      expectedLimit: 68, expectedAccepted: 5, baseline: 34,
      requests: spilloverUsers.slice(34).map((userId) => ({ userId, kind: 'shot_storyboard', falKeyId: 'key-a' })),
      allowedErrors: [], expectedKeyId: 'key-b' })

    await reset()
    const fullUsers = Array.from({ length: 68 }, () => randomUUID())
    const blockedExemptUser = randomUUID()
    await addUsers([...fullUsers, blockedExemptUser])
    await seedJobs(fullUsers.slice(0, 34), 'shot_storyboard', 'key-a')
    await seedJobs(fullUsers.slice(34), 'shot_storyboard', 'key-b')
    await setKeyLimits([['key-a', 34], ['key-b', 34]])
    await addExemptUsers([blockedExemptUser])
    await runRace({ id: 'exempt_global_block', promise: '두 계정이 모두 찼으면 관리자도 거절된다',
      expectedLimit: 68, expectedAccepted: 0, baseline: 68,
      requests: [{ userId: blockedExemptUser, kind: 'shot_video', falKeyId: 'key-a' }],
      allowedErrors: ['global_at_capacity', 'key_at_capacity'] })

    await reset()
    const exemptVideoUser = randomUUID()
    await addUsers([exemptVideoUser])
    await addExemptUsers([exemptVideoUser])
    for (let index = 0; index < 3; index++) await insert(primary, { userId: exemptVideoUser, kind: 'shot_video', falKeyId: 'key-a' })
    await setKeyLimits([['key-a', 34], ['key-b', 34]])
    // expectedLimit 4 는 "개인 영상 3 을 넘겨 받아들인 결과"를 그대로 고정한 관측 상한이다.
    await runRace({ id: 'exempt_video_over_limit', promise: '관리자는 내 영상 3개를 넘어도 전체 자리가 남아 있으면 수용된다',
      expectedLimit: 4, expectedAccepted: 1, baseline: 3,
      requests: [{ userId: exemptVideoUser, kind: 'shot_video', falKeyId: 'key-a' }],
      userId: exemptVideoUser, category: 'video', allowedErrors: [] })

    await reset()
    const releasedUser = randomUUID()
    await addUsers([releasedUser])
    for (let index = 0; index < 3; index++) await insert(primary, { userId: releasedUser, kind: 'shot_video' })
    await primary.query(`update ${schema}.generation_jobs set status='completed' where id=(select id from ${schema}.generation_jobs order by id limit 1)`)
    await runRace({ id: 'completed_video_releases_slot', promise: '진행 영상 3개 중 1개가 끝나면 다음 영상 1개를 시작할 수 있다',
      expectedLimit: 3, expectedAccepted: 1, baseline: 2,
      requests: [{ userId: releasedUser, kind: 'shot_video' }], userId: releasedUser, category: 'video', allowedErrors: [] })
  }, 240000)

  afterAll(async () => {
    await Promise.allSettled(clients.map((client) => client.end()))
    if (outputPath) {
      const result = JSON.parse(readFileSync(outputPath, 'utf8'))
      result.observations = observations
      result.policyResults = observations.map(({ id, promise, expectedLimit, expectedAccepted, accepted, finalActive, reassignedTo, policyPassed }) =>
        ({ id, promise, expectedLimit, expectedAccepted, accepted, observedActive: finalActive, reassignedTo, passed: policyPassed }))
      writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
    }
  }, 30000)

  for (const [id, label] of [
    ['user_video_3', '같은 사용자의 영상 12건이 전체 자리 잠금을 실제로 대기한 뒤 진행된 결과를 기록한다'],
    ['user_image_6', '같은 사용자의 이미지 12건이 같은 작업 수를 읽은 뒤 저장된 결과를 기록한다'],
    ['global_68', '전체 67개를 읽은 12개의 독립 요청이 저장된 결과를 기록한다'],
    ['key_spillover', '계정이 꽉 찬 같은 상태를 읽은 5명의 독립 요청이 저장된 결과를 기록한다'],
    ['exempt_global_block', '두 계정이 모두 찬 상태를 읽은 관리자 요청의 결과를 기록한다'],
    ['exempt_video_over_limit', '영상 3개를 읽은 관리자 요청이 저장된 결과를 기록한다'],
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
    ['global_68', '전체 68칸(34+34) 중 1칸이 남았을 때 서로 다른 12명이 동시에 요청해도 전체 진행 작업은 68개를 넘지 않는다'],
    ['key_spillover', '내가 고른 계정이 찼어도 옆 계정에 자리가 있으면 거절하지 않고 그 계정으로 넣는다'],
    ['exempt_global_block', '두 계정이 모두 찼으면 관리자도 거절된다'],
    ['exempt_video_over_limit', '관리자는 내 영상 3개를 넘어도 전체 자리가 남아 있으면 수용된다'],
    ['completed_video_releases_slot', '진행 영상 3개 중 1개가 끝나면 다음 영상 1개를 시작할 수 있다'],
  ]) {
    // 왜: 새 트리거의 약속이 DB 최종 저장에서도 유지되는지 판정하며 실패를 정상 동작으로 바꾸지 않는다.
    it(promise, () => {
      const observation = observations.find((entry) => entry.id === id)
      expect(observation).toBeDefined()
      expect(observation?.finalActive).toBeLessThanOrEqual(observation?.expectedLimit ?? -1)
      expect(observation?.policyPassed).toBe(true)
    })
  }
})
