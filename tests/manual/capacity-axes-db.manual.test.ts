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
const migrationDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations')
const migrationPaths = [
  resolve(migrationDir, '20260914110000_generation_capacity_all_axes.sql'),
  resolve(migrationDir, '20260914150000_generation_capacity_key_assignment.sql'),
]
const videoKinds = ['shot_video', 'shot_previz_video']
const clients: Client[] = []
let primary: Client
const observations: Observation[] = []
type Request = {
  userId: string | null; kind: string; falKeyId?: string | null; provider?: string;
  projectId?: string; workspaceId?: string;
}
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
  const result = await client.query(`insert into ${schema}.generation_jobs(id,project_id,workspace_id,user_id,kind,status,provider,fal_key_id)
    values($1,$2,$3,$4,$5,'queued',$6,$7) returning fal_key_id`,
  [randomUUID(), request.projectId ?? null, request.workspaceId ?? null, request.userId, request.kind,
    request.provider ?? 'local', request.falKeyId ?? null])
  return result.rows[0]?.fal_key_id as string | null
}

async function reset() {
  await primary.query(`truncate ${schema}.generation_jobs, ${schema}.generation_capacity_exempt_users, ${schema}.fal_key_limits,
    ${schema}.projects, ${schema}.workspaces, ${schema}.users`)
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

// provider='fal' baseline 은 키 설정표를 넣은 뒤 채운다 — 명시 키가 설정표에 있는지 새 트리거가 함께 검증한다.
async function seedJobs(userIds: string[], kind: string, falKeyId: string | null, provider = 'local') {
  await primary.query(`insert into ${schema}.generation_jobs(id,user_id,kind,status,provider,fal_key_id)
    select id,id,$2,'queued',$3,$4 from unnest($1::uuid[]) as fixture(id)`, [userIds, kind, provider, falKeyId])
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
      create table ${schema}.workspaces(id uuid primary key, owner_id uuid references ${schema}.users(id));
      create table ${schema}.projects(id uuid primary key, workspace_id uuid references ${schema}.workspaces(id));
      create table ${schema}.generation_jobs(id uuid primary key, project_id uuid references ${schema}.projects(id),
        workspace_id uuid references ${schema}.workspaces(id), user_id uuid references ${schema}.users(id), kind text not null,
        status text not null, provider text not null default 'fal', fal_key_id text, created_at timestamptz not null default now());
      create table ${schema}.generation_capacity_exempt_users(user_id uuid primary key references ${schema}.users(id) on delete cascade,
        updated_at timestamptz not null default now());
      alter table ${schema}.users enable row level security;
      alter table ${schema}.generation_jobs enable row level security;
      alter table ${schema}.generation_capacity_exempt_users enable row level security;
    `)
    for (const migrationPath of migrationPaths) {
      const original = readFileSync(migrationPath, 'utf8')
      const isolated = original.replaceAll('public.', `${schema}.`).replaceAll('auth.users', `${schema}.users`)
        .replaceAll('search_path = public', `search_path = ${schema}`).replace(/^notify pgrst, 'reload schema';\r?\n/m, '')
      // 주석 줄은 실행 의미가 없으니 잔존 검사에서 뺀다 — 검사는 적용될 본문만 본다(주석은 그대로 적용한다).
      const executable = isolated.replace(/^[ \t]*--.*$/gm, '')
      if (/\b(public|auth)\./.test(executable) || /\bnotify\s/i.test(executable) || isolated === original) throw new Error('Migration isolation failed')
      await primary.query(isolated)
    }

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
    const nullKeyUsers = [randomUUID(), randomUUID()]
    await addUsers(nullKeyUsers)
    await setKeyLimits([['key-a', 1], ['key-b', 1]])
    await seedJobs([nullKeyUsers[0]], 'shot_storyboard', 'key-a', 'fal')
    await runRace({ id: 'null_key_reassigned', promise: 'fal 예약 키가 비어 있으면 A가 꽉 차도 여유가 가장 큰 B에 최종 기록된다',
      expectedLimit: 2, expectedAccepted: 1, baseline: 1,
      requests: [{ userId: nullKeyUsers[1], kind: 'shot_storyboard', provider: 'fal', falKeyId: null }],
      allowedErrors: [], expectedKeyId: 'key-b' })

    await reset()
    const allFullUsers = [randomUUID(), randomUUID(), randomUUID()]
    await addUsers(allFullUsers)
    await setKeyLimits([['key-a', 1], ['key-b', 1]])
    await seedJobs([allFullUsers[0]], 'shot_storyboard', 'key-a', 'fal')
    await seedJobs([allFullUsers[1]], 'shot_storyboard', 'key-b', 'fal')
    await runRace({ id: 'all_keys_full', promise: 'fal 계정 두 개가 모두 차면 키를 생략한 예약도 거절된다',
      expectedLimit: 2, expectedAccepted: 0, baseline: 2,
      requests: [{ userId: allFullUsers[2], kind: 'shot_storyboard', provider: 'fal', falKeyId: null }],
      allowedErrors: ['key_at_capacity'] })

    await reset()
    const emptyLimitsUser = randomUUID()
    await addUsers([emptyLimitsUser])
    await runRace({ id: 'empty_key_limits', promise: 'fal 키 설정표가 비어 있으면 키를 생략한 예약은 명시 오류로 닫힌다',
      expectedLimit: 0, expectedAccepted: 0, baseline: 0,
      requests: [{ userId: emptyLimitsUser, kind: 'shot_storyboard', provider: 'fal', falKeyId: null }],
      allowedErrors: ['fal_key_unavailable'] })

    await reset()
    const unknownKeyUser = randomUUID()
    await addUsers([unknownKeyUser])
    await setKeyLimits([['key-a', 1]])
    await runRace({ id: 'unknown_explicit_key', promise: '설정표 밖의 fal 키를 명시하면 명시 오류로 닫힌다',
      expectedLimit: 1, expectedAccepted: 0, baseline: 0,
      requests: [{ userId: unknownKeyUser, kind: 'shot_storyboard', provider: 'fal', falKeyId: 'key-missing' }],
      allowedErrors: ['fal_key_unknown'] })

    await reset()
    const localUser = randomUUID()
    await addUsers([localUser])
    await setKeyLimits([['key-a', 1]])
    await runRace({ id: 'local_key_untouched', promise: 'local 예약은 fal 키 설정이 있어도 키를 배정하지 않고 기존 전체 한도만 따른다',
      expectedLimit: 1, expectedAccepted: 1, baseline: 0,
      requests: [{ userId: localUser, kind: 'shot_storyboard', provider: 'local', falKeyId: null }],
      allowedErrors: [] })
    const localKey = (await primary.query(`select fal_key_id from ${schema}.generation_jobs
      where user_id=$1 and status='queued'`, [localUser])).rows[0]?.fal_key_id
    if (localKey !== null) throw new Error('Local provider unexpectedly received a fal key')

    await reset()
    await runRace({ id: 'null_user_unresolved', promise: 'user_id와 소유 workspace를 모두 확인할 수 없으면 예약을 fail closed 한다',
      expectedLimit: 0, expectedAccepted: 0, baseline: 0,
      requests: [{ userId: null, kind: 'shot_storyboard', provider: 'local' }],
      allowedErrors: ['generation_owner_unresolved'] })

    await reset()
    const ownerUser = randomUUID()
    const ownerWorkspace = randomUUID()
    const ownerProject = randomUUID()
    await addUsers([ownerUser])
    await primary.query(`insert into ${schema}.workspaces(id,owner_id) values($1,$2)`, [ownerWorkspace, ownerUser])
    await primary.query(`insert into ${schema}.projects(id,workspace_id) values($1,$2)`, [ownerProject, ownerWorkspace])
    for (let index = 0; index < 5; index++) {
      await insert(primary, { userId: ownerUser, kind: 'shot_storyboard', provider: 'local' })
    }
    await runRace({ id: 'null_user_owner_resolved', promise: 'user_id가 비어도 project workspace 소유자로 보완해 개인 이미지 한도를 그대로 적용한다',
      expectedLimit: 6, expectedAccepted: 1, baseline: 5,
      requests: [{ userId: null, projectId: ownerProject, kind: 'shot_storyboard', provider: 'local' }],
      userId: ownerUser, category: 'image', allowedErrors: [] })
    const resolvedOwner = (await primary.query(`select user_id from ${schema}.generation_jobs
      where project_id=$1 and workspace_id=$2 and kind='shot_storyboard' and status='queued'`, [ownerProject, ownerWorkspace])).rows[0]?.user_id
    if (resolvedOwner !== ownerUser) throw new Error('Owner-resolution observation expected project owner')

    await reset()
    const globalUsers = Array.from({ length: 79 }, () => randomUUID())
    await addUsers(globalUsers)
    await setKeyLimits([['key-a', 34], ['key-b', 34]])
    await seedJobs(globalUsers.slice(0, 33), 'shot_storyboard', 'key-a', 'fal')
    await seedJobs(globalUsers.slice(33, 67), 'shot_storyboard', 'key-b', 'fal')
    await runRace({ id: 'global_68', promise: '전체 68칸(34+34) 중 1칸이 남았을 때 서로 다른 12명이 동시에 요청해도 전체 진행 작업은 68개를 넘지 않는다',
      expectedLimit: 68, expectedAccepted: 1, baseline: 67,
      requests: globalUsers.slice(67).map((userId, index) => ({ userId, kind: index % 2 ? 'shot_storyboard' : 'shot_video',
        provider: 'fal', falKeyId: index % 2 ? 'key-b' : 'key-a' })),
      allowedErrors: ['global_at_capacity', 'key_at_capacity'] })

    await reset()
    const spilloverUsers = Array.from({ length: 39 }, () => randomUUID())
    await addUsers(spilloverUsers)
    await setKeyLimits([['key-a', 34], ['key-b', 34]])
    await seedJobs(spilloverUsers.slice(0, 34), 'shot_storyboard', 'key-a', 'fal')
    await runRace({ id: 'key_spillover', promise: '내가 고른 계정이 찼어도 옆 계정에 자리가 있으면 거절하지 않고 그 계정으로 넣는다',
      expectedLimit: 68, expectedAccepted: 5, baseline: 34,
      requests: spilloverUsers.slice(34).map((userId) => ({ userId, kind: 'shot_storyboard', provider: 'fal', falKeyId: 'key-a' })),
      allowedErrors: [], expectedKeyId: 'key-b' })

    await reset()
    const fullUsers = Array.from({ length: 68 }, () => randomUUID())
    const blockedExemptUser = randomUUID()
    await addUsers([...fullUsers, blockedExemptUser])
    await setKeyLimits([['key-a', 34], ['key-b', 34]])
    await seedJobs(fullUsers.slice(0, 34), 'shot_storyboard', 'key-a', 'fal')
    await seedJobs(fullUsers.slice(34), 'shot_storyboard', 'key-b', 'fal')
    await addExemptUsers([blockedExemptUser])
    await runRace({ id: 'exempt_global_block', promise: '두 계정이 모두 찼으면 관리자도 거절된다',
      expectedLimit: 68, expectedAccepted: 0, baseline: 68,
      requests: [{ userId: blockedExemptUser, kind: 'shot_video', provider: 'fal', falKeyId: 'key-a' }],
      allowedErrors: ['global_at_capacity', 'key_at_capacity'] })

    await reset()
    const exemptVideoUser = randomUUID()
    await addUsers([exemptVideoUser])
    await addExemptUsers([exemptVideoUser])
    await setKeyLimits([['key-a', 34], ['key-b', 34]])
    for (let index = 0; index < 3; index++) {
      await insert(primary, { userId: exemptVideoUser, kind: 'shot_video', provider: 'fal', falKeyId: 'key-a' })
    }
    // expectedLimit 4 는 "개인 영상 3 을 넘겨 받아들인 결과"를 그대로 고정한 관측 상한이다.
    await runRace({ id: 'exempt_video_over_limit', promise: '관리자는 내 영상 3개를 넘어도 전체 자리가 남아 있으면 수용된다',
      expectedLimit: 4, expectedAccepted: 1, baseline: 3,
      requests: [{ userId: exemptVideoUser, kind: 'shot_video', provider: 'fal', falKeyId: 'key-a' }],
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
    ['null_key_reassigned', '키를 생략한 fal 예약이 여유 계정으로 원자 재배정된 결과를 기록한다'],
    ['all_keys_full', '모든 fal 계정이 찬 키 생략 예약이 거절된 결과를 기록한다'],
    ['empty_key_limits', '빈 fal 키 설정표 예약이 명시 오류로 거절된 결과를 기록한다'],
    ['unknown_explicit_key', '설정표 밖의 fal 키 명시 예약이 명시 오류로 거절된 결과를 기록한다'],
    ['local_key_untouched', 'local 예약이 fal 키 없이 저장된 결과를 기록한다'],
    ['null_user_unresolved', '소유자를 확인할 수 없는 user_id 누락 예약이 거절된 결과를 기록한다'],
    ['null_user_owner_resolved', 'user_id가 비어도 project workspace 소유자로 보완된 결과를 기록한다'],
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
    ['null_key_reassigned', 'fal 키를 생략해도 A가 찬 경우 여유 있는 B에 기록된다'],
    ['all_keys_full', '두 fal 계정이 모두 찬 경우 키를 생략한 예약은 거절된다'],
    ['empty_key_limits', 'fal 키 설정표가 비어 있으면 키를 생략한 예약은 거절된다'],
    ['unknown_explicit_key', '설정표에 없는 fal 키를 명시한 예약은 거절된다'],
    ['local_key_untouched', 'local 예약은 fal 키를 배정하지 않는다'],
    ['null_user_unresolved', '소유자를 확인할 수 없으면 user_id 누락 예약은 거절된다'],
    ['null_user_owner_resolved', 'user_id가 비어도 project workspace 소유자 개인 한도를 적용한다'],
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
