// 고정 개발 DB의 임시 스키마만 사용해 실제 러프 예약 경합을 검증하고 마지막에 제거한다.
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import dotenv from 'dotenv'
import pg from 'pg'

const env = dotenv.parse(readFileSync('.env.local'))
const ref = 'pbiumddivadgbzxuymak'
const schema = `mvp_rough_${randomUUID().replaceAll('-', '')}`
let client
let created = false
let publicBefore
let stage = 'development identity'
let connectionText = ''

function redact(error) {
  let message = error instanceof Error ? error.message : String(error)
  for (const secret of [env.SUPABASE_ACCESS_TOKEN, env.SUPABASE_DEV_DB_PASSWORD, connectionText]) {
    if (secret) message = message.replaceAll(secret, '[redacted]')
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted connection]')
}

async function publicFingerprint() {
  return (await client.query("select md5(pg_get_functiondef(p.oid)) as fingerprint from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reserve_rough_storyboard_grid' order by p.oid")).rows
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
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('Invalid TLS certificate')
  const connection = new URL(`postgresql://${pool.db_host}:${pool.db_port}/${pool.db_name}`)
  connection.username = pool.db_user
  connection.password = env.SUPABASE_DEV_DB_PASSWORD
  connectionText = connection.toString()
  client = new pg.Client({ connectionString: connectionText, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
  stage = 'read-only connection verification'
  await client.connect()
  await client.query('begin read only')
  try {
    const identity = (await client.query("select current_database() as database, current_user as role, current_setting('transaction_read_only') as read_only, pg_is_in_recovery() as recovery")).rows[0]
    if (identity.database !== 'postgres' || identity.read_only !== 'on' || identity.recovery) throw new Error('Unexpected development database identity')
    publicBefore = await publicFingerprint()
    console.log(JSON.stringify({ check: 'read-only development connection', passed: true, developmentProject: ref, liveScopeSeparate: true, verifiedTls: true, applicationRowsRead: 0 }))
    const migrationTable = (await client.query("select to_regclass('supabase_migrations.schema_migrations') is not null as present")).rows[0].present
    const migrationRows = migrationTable
      ? (await client.query('select version from supabase_migrations.schema_migrations where version=$1', ['20260910001500'])).rows
      : []
    console.log(JSON.stringify({ check: 'existing public installation', publicFunctionCount: publicBefore.length, migrationVersion: '20260910001500', migrationHistoryPresent: migrationTable, versionRecorded: migrationRows.length > 0 }))
  } finally { await client.query('rollback') }

  if (!process.argv.includes('--read-only')) {
    stage = 'isolated schema setup'
    if (!/^mvp_rough_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema identifier')
    await client.query(`create schema ${schema}`)
    created = true
    const sql = readFileSync('supabase/migrations/20260910001500_reserve_rough_storyboard_jobs.sql')
    console.log(JSON.stringify({ check: 'isolated migration test', testSchema: schema, migrationSha256: createHash('sha256').update(sql).digest('hex'), fixture: 'new users, projects, shots and jobs only; no application rows copied' }))
    stage = 'isolated database tests'
    process.exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/manual/rough-reservation-dev-db.manual.test.ts', '--reporter=verbose'], {
        stdio: 'inherit', timeout: 240000,
        env: { ...process.env, MVP_ROUGH_TEST_DATABASE_URL: connectionText, MVP_ROUGH_TEST_CA: ca, MVP_ROUGH_TEST_SCHEMA: schema },
      })
      child.once('error', () => reject(new Error('Unable to launch isolated database tests')))
      child.once('exit', (code, signal) => signal ? reject(new Error(`Isolated test process ended: ${signal}`)) : resolve(code ?? 1))
    })
  }
} catch (error) {
  process.exitCode = 1
  console.error(JSON.stringify({ failedStage: stage, error: redact(error) }))
} finally {
  if (client) {
    try {
      if (created) {
        await client.query('begin')
        await client.query("set local statement_timeout = '15s'")
        await client.query(`drop schema ${schema} cascade`)
        await client.query('commit')
        const remains = (await client.query('select exists(select 1 from pg_namespace where nspname=$1) as remains', [schema])).rows[0].remains
        if (remains) throw new Error('Test schema cleanup did not complete')
        console.log(JSON.stringify({ check: 'test schema cleanup', removedTestSchema: schema, remaining: 0 }))
      }
      if (publicBefore) {
        const publicAfter = await publicFingerprint()
        if (JSON.stringify(publicAfter) !== JSON.stringify(publicBefore)) throw new Error('Public rough function changed during verification')
        console.log(JSON.stringify({ check: 'public rough function fingerprint', unchanged: true, publicMigrationsApplied: 0 }))
      }
    } catch (error) {
      process.exitCode = 1
      console.error(JSON.stringify({ failedStage: 'test cleanup', testSchema: schema, error: redact(error) }))
    } finally { await client.end().catch(() => {}) }
  }
}
