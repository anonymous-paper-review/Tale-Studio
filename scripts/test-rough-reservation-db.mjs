// 로컬 PostgreSQL에 격리 DB를 만들고 실제 예약 RPC의 동시성·소유권을 확인한 뒤 지운다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const connection = process.env.ROUGH_RESERVATION_DB_URL
if (!connection) throw new Error('ROUGH_RESERVATION_DB_URL이 필요합니다(로컬 테스트 서버만 허용).')
const url = new URL(connection)
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('로컬 PostgreSQL만 허용합니다.')
const database = `tale_rough_check_${process.pid}_${Date.now()}`
const admin = new pg.Client({ connectionString: connection })
const clients = []
const createdRoles = []
let createdDatabase = false
const checks = []
const project = '11111111-1111-4111-8111-111111111111'
const workspace = '22222222-2222-4222-8222-222222222222'
const owner = '33333333-3333-4333-8333-333333333333'

await admin.connect()
try {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const found = await admin.query('select 1 from pg_roles where rolname = $1', [role])
    if (!found.rowCount) { await admin.query(`create role ${role}`); createdRoles.push(role) }
  }
  await admin.query(`create database ${database}`)
  createdDatabase = true
  url.pathname = `/${database}`
  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()
  clients.push(client)
  // RPC가 참조하는 기존 표/열의 최소 fixture다. 운영 전체 트리거 검증과 구분한다.
  await client.query(`
    create table public.workspaces(id uuid primary key, owner_id uuid not null);
    create table public.projects(id uuid primary key, workspace_id uuid references workspaces(id));
    create table public.shots(project_id uuid references projects(id), shot_id text, action_description text, rough_storyboard jsonb, primary key(project_id, shot_id));
    create table public.generation_jobs(id uuid primary key, project_id uuid references projects(id), request_id text not null, model text not null,
      kind text not null, status text not null, target jsonb not null, input_snapshot jsonb, user_id uuid, workspace_id uuid,
      provider text, actor text, attempts integer, created_at timestamptz not null default now());
  `)
  await client.query('insert into workspaces values($1,$2)', [workspace, owner])
  await client.query('insert into projects values($1,$2)', [project, workspace])
  for (let i = 1; i <= 8; i++) await client.query('insert into shots values($1,$2,$3,null)', [project, `shot-${i}`, 'Open the door'])
  await client.query(await readFile(new URL('../supabase/migrations/20260910001500_reserve_rough_storyboard_jobs.sql', import.meta.url), 'utf8'))

  const reserve = (db, ids = ['shot-1', 'shot-2', 'shot-3', 'shot-4'], overrides = {}) => db.query(
    'select * from public.reserve_rough_storyboard_grid($1,$2,$3,$4,$5,$6,$7,$8)',
    [project, workspace, overrides.owner ?? owner, ids, overrides.variant ?? 'grid4', 'image-model', { prompt: 'empty room', shotIds: ids }, overrides.force ?? false],
  )
  const pool = await Promise.all(Array.from({ length: 20 }, async () => {
    const db = new pg.Client({ connectionString: url.toString() })
    await db.connect(); clients.push(db); return db
  }))
  const same = await Promise.all(pool.map((db) => reserve(db)))
  const jobIds = new Set(same.flatMap((result) => result.rows.map((row) => row.job_id)))
  assert.equal(jobIds.size, 1)
  assert.equal(same.filter((result) => result.rows[0].state === 'reserved').length, 1)
  checks.push('동시 20개 요청은 작업 하나만 예약한다')
  const firstJob = [...jobIds][0]

  const overlap = await reserve(client, ['shot-3', 'shot-4', 'shot-5', 'shot-6'])
  assert.equal(overlap.rows[0].job_id, firstJob)
  assert.deepEqual(overlap.rows[0].shot_ids, ['shot-3', 'shot-4'])
  checks.push('부분이 겹치는 그리드는 기존 작업을 반환하고 새로 접수하지 않는다')

  await client.query("update generation_jobs set created_at = '2000-01-01', input_snapshot = input_snapshot || '{\"rough_submit_state\":\"confirmation_pending\"}'::jsonb where id=$1", [firstJob])
  assert.equal((await reserve(client)).rows[0].job_id, firstJob)
  checks.push('오래된 접수 확인 대기도 예약을 유지한다')

  await assert.rejects(reserve(client, ['shot-7'], { owner: '44444444-4444-4444-8444-444444444444' }), /access denied/)
  await assert.rejects(reserve(client, ['not-this-project']), /do not belong/)
  await assert.rejects(reserve(client, ['shot-7', 'shot-7']), /do not belong/)
  checks.push('다른 소유자·없는 샷·중복 샷은 거절한다')

  await client.query('set role authenticated')
  await assert.rejects(reserve(client), /permission denied/)
  await client.query('reset role')
  checks.push('일반 클라이언트는 예약 함수를 직접 실행하지 못한다')

  await client.query("update generation_jobs set status='failed' where id=$1", [firstJob])
  const retried = (await reserve(client)).rows[0]
  assert.equal(retried.state, 'reserved'); assert.notEqual(retried.job_id, firstJob)
  checks.push('접수 거절로 해제한 뒤에는 새 시도가 가능하다')

  await client.query("update generation_jobs set status='completed' where id=$1", [retried.job_id])
  await client.query("update shots set rough_storyboard='{\"status\":\"completed\",\"url\":\"test\"}'::jsonb where shot_id=any($1)", [['shot-1', 'shot-2', 'shot-3', 'shot-4']])
  assert.equal((await reserve(client)).rows[0].state, 'exists')
  assert.equal((await reserve(client, undefined, { force: true })).rows[0].state, 'reserved')
  checks.push('이미 완성된 샷은 자동 생성에서 제외하고 명시적 재생성만 허용한다')

  console.log(JSON.stringify({ passed: checks.length, checks, scope: '격리 로컬 DB의 최소 기존 스키마 fixture; 운영 전체 트리거 미포함' }, null, 2))
} finally {
  await Promise.allSettled(clients.map((client) => client.end()))
  if (createdDatabase) await admin.query(`drop database ${database}`)
  for (const role of createdRoles.reverse()) await admin.query(`drop role ${role}`)
  await admin.end()
}
