// 개발 DB에서 바우처 관리자 함수(20261118090000)를 실제 원장으로 한 바퀴 돌려 보고 마지막에 전부 되돌린다(rollback).
//   흐름: 코드 등록 → 중지한 코드는 새 등록 거절 → 관리자가 티어 · 종료일 변경 → 관리자가 해지 → 만료 정리 함수.
//   한 트랜잭션 안에서만 쓰고 무조건 rollback 하므로 개발 DB에 남는 것은 없다.
//
// 사용: node scripts/test-admin-voucher-dev-db.mjs
import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import pg from 'pg'

const env = dotenv.parse(readFileSync('.env.local'))
const ref = 'pbiumddivadgbzxuymak'
let client
let connectionText = ''
let stage = 'development identity'
const checks = []

function redact(error) {
  let message = error instanceof Error ? error.message : String(error)
  for (const secret of [env.SUPABASE_ACCESS_TOKEN, env.SUPABASE_DEV_DB_PASSWORD, connectionText]) {
    if (secret) message = message.replaceAll(secret, '[redacted]')
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted connection]')
}

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  checks.push({ name, ok, actual, expected })
  if (!ok) throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

async function one(sql, params = []) {
  return (await client.query(sql, params)).rows[0]
}

async function balance(workspace) {
  return Number((await one('select coalesce(sum(delta), 0)::int as total from public.take_ledger where workspace_id = $1', [workspace])).total)
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
  if (!pool || pool.db_user !== `postgres.${ref}` || pool.db_port !== 6543
    || !pool.db_host.endsWith('.pooler.supabase.com') || pool.db_name !== 'postgres') throw new Error('Pooler identity mismatch')
  const certificate = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt', { signal: AbortSignal.timeout(20000) })
  if (!certificate.ok) throw new Error(`TLS certificate HTTP ${certificate.status}`)
  const ca = await certificate.text()
  const connection = new URL(`postgresql://${pool.db_host}:${pool.db_port}/${pool.db_name}`)
  connection.username = pool.db_user
  connection.password = env.SUPABASE_DEV_DB_PASSWORD
  connectionText = connection.toString()
  client = new pg.Client({ connectionString: connectionText, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
  await client.connect()

  stage = 'scenario'
  await client.query('begin')
  try {
    const recorded = await one("select count(*)::int as n from supabase_migrations.schema_migrations where version = '20261118090000'")
    check('개발 DB에 관리자 바우처 마이그레이션이 적용돼 있다', recorded.n, 1)

    const pair = (await client.query(`
      select w.id, w.owner_id from public.workspaces w
       where w.owner_id is not null
         and not exists (select 1 from public.subscriptions s where s.workspace_id = w.id and s.status in ('active', 'trialing', 'past_due'))
       order by w.created_at limit 2`)).rows
    if (pair.length < 2) throw new Error('need two workspaces without an active subscription on development DB')
    const [a, b] = pair
    await client.query("update public.workspaces set plan = 'free' where id = any($1::uuid[])", [[a.id, b.id]])
    const startA = await balance(a.id)

    await client.query("insert into public.vouchers (code, plan, note, max_uses, duration_days, active) values ('ADMINTEST0001', 's2', 'rollback test', 2, 30, true)")
    const redeemed = await one("select public.redeem_voucher('ADMINTEST0001', $1, $2, 's2', 30, now() + interval '30 days') as r", [a.id, a.owner_id])
    check('코드를 등록하면 ok 와 s2 플랜 Take 30개를 돌려준다', redeemed.r, { plan: 's2', takes: 30, status: 'ok' })
    check('등록한 계정의 요금제가 s2 가 된다', (await one('select plan from public.workspaces where id = $1', [a.id])).plan, 's2')
    check('등록 기록에 실제 적용한 플랜이 남는다', (await one("select plan from public.voucher_redemptions where code = 'ADMINTEST0001'")).plan, 's2')
    check('Take 30개가 들어온다', await balance(a.id) - startA, 30)

    await client.query("update public.vouchers set active = false where code = 'ADMINTEST0001'")
    const paused = await one("select public.redeem_voucher('ADMINTEST0001', $1, $2, 's2', 30, now() + interval '30 days') as r", [b.id, b.owner_id])
    check('관리자가 중지한 코드는 자리가 남아도 새 등록을 invalid 로 거절한다', paused.r, { status: 'invalid' })

    const redemption = (await one("select id from public.voucher_redemptions where code = 'ADMINTEST0001' and redeemed_workspace_id = $1", [a.id])).id
    const grant = (await one("select id from public.take_ledger where ref_kind = 'voucher_redemption' and ref_id = $1", [redemption])).id
    await client.query("insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason) values ($1, -10, 'consume', $2, 'admin_voucher_test', 'consume-1', 'rollback test')", [a.id, grant])

    const updated = await one("select public.admin_update_voucher_redemption($1, 'p10', now() + interval '45 days', false) as r", [redemption])
    check('관리자가 티어를 p10 으로 바꾸면 남은 Take 20개를 회수하고 p10 Take 150개를 새로 준다', updated.r, { status: 'updated', granted_takes: 150, revoked_takes: 20 })
    check('티어를 바꾸면 계정 요금제도 p10 이 된다', (await one('select plan from public.workspaces where id = $1', [a.id])).plan, 'p10')
    check('티어를 바꾼 뒤 잔액은 처음 + 150 이다(쓴 10개는 기록으로 남는다)', await balance(a.id) - startA, 150)
    const ends = await one('select plan, plan_ended_at is null as open, plan_ends_at > now() + interval \'44 days\' as extended from public.voucher_redemptions where id = $1', [redemption])
    check('등록 기록의 플랜 · 종료일이 바뀌고 열린 상태로 남는다', ends, { plan: 'p10', open: true, extended: true })

    const ended = await one('select public.admin_end_voucher_redemption($1) as r', [redemption])
    check('관리자가 해지하면 남은 Take 150개를 회수하고 ended 를 돌려준다', ended.r, { status: 'ended', revoked_takes: 150 })
    check('해지하면 계정 요금제가 무료로 돌아간다', (await one('select plan from public.workspaces where id = $1', [a.id])).plan, 'free')
    check('해지한 뒤 잔액은 처음과 같다', await balance(a.id) - startA, 0)

    const expire = await one('select public.voucher_plan_expire_due() as r')
    check('만료 정리 함수가 새 열(plan)로 오류 없이 돈다', typeof expire.r.reverted, 'number')
  } finally {
    await client.query('rollback')
  }
  console.log(JSON.stringify({ result: 'passed', rolledBack: true, checks: checks.map((c) => c.name) }, null, 2))
} catch (error) {
  process.exitCode = 1
  console.error(JSON.stringify({ failedStage: stage, error: redact(error), passed: checks.filter((c) => c.ok).map((c) => c.name) }, null, 2))
} finally {
  if (client) await client.end().catch(() => {})
}
