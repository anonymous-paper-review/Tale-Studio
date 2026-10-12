// 개발 DB(pbiumddivadgbzxuymak)에서 take_settle_for_job(20261012210000)을 실제 원장으로 확인하고 전부 되돌린다.
//
// 확인하는 동작 (실패 후 대체 모델이 만들면 차액을 돌려준다 · 오너 결정 2026-10-12)
//   · 5 를 잡은 작업을 1 로 낮추면 4 를 돌려주고, 마지막에 꺼낸 묶음(plan)부터 되돌린다.
//   · 같은 작업에 다시 불러도 더 돌려주지 않는다. 잡은 양보다 큰 값으로 불러도 더 받지 않는다.
//   · 그 뒤 최종 실패로 take_release_for_job 을 부르면 남은 1 만 돌려준다.
//   · 묶음 없이 잡힌 초과분(shadow)부터 먼저 되돌린다.
//   · hold 가 없는 작업은 0, 음수 값은 거절한다.
//
// 모든 쓰기는 한 트랜잭션 안에서 하고 마지막에 ROLLBACK 한다 — 개발 DB 에도 흔적을 남기지 않는다.
// 사용: node scripts/test-take-settle-dev-db.mjs
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import pg from 'pg'

const env = dotenv.parse(readFileSync('.env.local'))
const ref = 'pbiumddivadgbzxuymak'
let client
let connectionText = ''
let stage = 'development identity'
let failures = 0

function redact(error) {
  let message = error instanceof Error ? error.message : String(error)
  for (const secret of [env.SUPABASE_ACCESS_TOKEN, env.SUPABASE_DEV_DB_PASSWORD, connectionText]) {
    if (secret) message = message.replaceAll(secret, '[redacted]')
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted connection]')
}

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

async function one(sql, params) {
  return (await client.query(sql, params)).rows[0]
}

async function createWorkspace(label) {
  const { id } = await one(
    "insert into public.workspaces (name, slug) values ($1, $2) returning id",
    [label, `${label}-${randomUUID().slice(0, 8)}`],
  )
  // 작업공간을 만들 때 자동으로 들어가는 지급이 있으면 지우고 이 검증의 지급만 남긴다.
  await client.query('delete from public.take_ledger where workspace_id = $1', [id])
  return id
}

async function grant(workspaceId, kind, amount, daysAgo) {
  const { id } = await one(
    "insert into public.take_ledger (workspace_id, delta, kind, created_at, reason) values ($1, $2, $3, now() - make_interval(days => $4), 'settle test') returning id",
    [workspaceId, amount, kind, daysAgo],
  )
  return id
}

// take_hold 는 대기 중인 작업 행이 있어야 잡는다. 아무 프로젝트에나 붙이되 작업공간은 이 검증용으로 지정한다.
//   생성 자리 트리거가 주인을 찾지 않도록, 진행 중인 작업이 없는 기존 사용자를 user_id 로 바로 적는다.
async function queuedJob(workspaceId) {
  const id = randomUUID()
  const { project_id: projectId, kind } = await one(
    "select project_id, kind from public.generation_jobs where kind not in ('shot_video', 'shot_previz_video') order by created_at desc limit 1",
  )
  const { owner_id: userId } = await one(
    "select w.owner_id from public.workspaces w where w.owner_id is not null and not exists (select 1 from public.generation_jobs j where j.user_id = w.owner_id and j.status = 'queued') limit 1",
  )
  await client.query(
    "insert into public.generation_jobs (id, project_id, workspace_id, user_id, request_id, model, kind, status, target, input_snapshot) values ($1, $2, $3, $4, $5, 'settle-test', $6, 'queued', '{}'::jsonb, '{}'::jsonb)",
    [id, projectId, workspaceId, userId, `reserved:${id}`, kind],
  )
  return id
}

async function heldByGrant(jobId) {
  const rows = (await client.query(
    "select coalesce(g.kind, 'unallocated') as lot, -sum(h.delta)::int as held from public.take_ledger h left join public.take_ledger g on g.id = h.grant_id where h.ref_kind = 'generation_job' and h.ref_id = $1 and h.kind in ('hold', 'hold_release') group by 1 order by 1",
    [jobId],
  )).rows
  return Object.fromEntries(rows.map((row) => [row.lot, row.held]))
}

async function settle(jobId, amount) {
  return (await one('select public.take_settle_for_job($1, $2) as released', [jobId, amount])).released
}

try {
  if (new URL(env.SUPABASE_DEV_URL).hostname !== `${ref}.supabase.co`
    || new URL(env.SUPABASE_LIVE_URL).hostname === `${ref}.supabase.co`) throw new Error('Development identity mismatch')
  if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_DEV_DB_PASSWORD) throw new Error('Development credentials missing')

  stage = 'development pooler lookup'
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/database/pooler`, {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Development pooler HTTP ${response.status}`)
  const pool = (await response.json()).find((entry) => entry.database_type === 'PRIMARY')
  if (!pool || pool.db_user !== `postgres.${ref}` || !pool.db_host.endsWith('.pooler.supabase.com')) throw new Error('Pooler identity mismatch')
  const certificate = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt', { signal: AbortSignal.timeout(20000) })
  if (!certificate.ok) throw new Error(`TLS certificate HTTP ${certificate.status}`)
  const ca = await certificate.text()
  const connection = new URL(`postgresql://${pool.db_host}:${pool.db_port}/${pool.db_name}`)
  connection.username = pool.db_user
  connection.password = env.SUPABASE_DEV_DB_PASSWORD
  connectionText = connection.toString()
  client = new pg.Client({ connectionString: connectionText, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
  await client.connect()

  stage = 'checks'
  await client.query('begin')

  // ① 묶음 여러 개에 걸친 hold: free 3 → plan 2 순으로 꺼내 5 를 잡는다.
  const ws = await createWorkspace('settle-test')
  await grant(ws, 'grant_free', 3, 2)
  await grant(ws, 'grant_plan', 10, 1)
  const jobA = await queuedJob(ws)
  const holdA = await one('select public.take_hold($1, 5, $2, true) as result', [ws, jobA])
  check('Seedance 값 5 를 잡는다', holdA.result.held, 5)
  check('free 3 → plan 2 순서로 꺼낸다', await heldByGrant(jobA), { grant_free: 3, grant_plan: 2 })

  check('대체 모델 값 1 로 낮추면 차액 4 를 돌려준다', await settle(jobA, 1), 4)
  check('마지막에 꺼낸 plan 부터 되돌려 free 1 만 남는다', await heldByGrant(jobA), { grant_free: 1, grant_plan: 0 })
  check('잔액은 지급 13 에서 1 만 빠진 12 다', (await one('select sum(delta)::int as balance from public.take_ledger where workspace_id = $1', [ws])).balance, 12)
  check('같은 작업에 다시 불러도 더 돌려주지 않는다', await settle(jobA, 1), 0)
  check('잡은 양보다 큰 값으로 불러도 더 받지 않는다', await settle(jobA, 5), 0)
  check('잡힌 양은 그대로 1 이다', await heldByGrant(jobA), { grant_free: 1, grant_plan: 0 })
  check('그 뒤 최종 실패하면 남은 1 만 돌려준다', (await one('select public.take_release_for_job($1) as released', [jobA])).released, 1)

  // ② 잔액이 모자라 묶음 없이 잡힌 초과분(shadow)부터 되돌린다.
  const ws2 = await createWorkspace('settle-test-over')
  await grant(ws2, 'grant_free', 2, 1)
  const jobB = await queuedJob(ws2)
  await one('select public.take_hold($1, 5, $2, false) as result', [ws2, jobB])
  check('free 2 와 묶음 없는 초과분 3 으로 잡는다', await heldByGrant(jobB), { grant_free: 2, unallocated: 3 })
  check('1 로 낮추면 4 를 돌려준다', await settle(jobB, 1), 4)
  check('초과분부터 되돌려 free 1 만 남는다', await heldByGrant(jobB), { grant_free: 1, unallocated: 0 })

  // ③ 0 으로 낮추면 전부 돌려준다.
  check('0 으로 낮추면 남은 1 을 돌려준다', await settle(jobB, 0), 1)

  // ④ hold 가 없는 작업(admin·과금 꺼짐)은 아무것도 하지 않는다.
  check('hold 가 없는 작업은 0', await settle(randomUUID(), 1), 0)

  // ⑤ 음수 값은 거절한다.
  await client.query('savepoint negative')
  let rejected = false
  try {
    await settle(jobA, -1)
  } catch {
    rejected = true
  }
  await client.query('rollback to savepoint negative')
  check('음수 값은 거절한다', rejected, true)

  // ⑥ 브라우저 키로는 부를 수 없다.
  const grants = (await client.query(
    "select grantee from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'take_settle_for_job' and privilege_type = 'EXECUTE' order by grantee",
  )).rows.map((row) => row.grantee)
  check('anon·authenticated 에는 실행 권한이 없다', grants.filter((g) => g === 'anon' || g === 'authenticated'), [])

  await client.query('rollback')
  console.log(JSON.stringify({ result: failures ? 'failed' : 'passed', failures, environment: 'development', rolledBack: true }))
  if (failures) process.exitCode = 1
} catch (error) {
  process.exitCode = 1
  if (client) await client.query('rollback').catch(() => {})
  console.error(JSON.stringify({ failedStage: stage, error: redact(error) }))
} finally {
  if (client) await client.end().catch(() => {})
}
