// 환불·만료 DB 검사는 고정 개발 DB의 격리 스키마에서 실행하고 전부 롤백한다. 운영·기존 장부는 건드리지 않는다.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import pg from 'pg'

const env = dotenv.parse(readFileSync('.env.local'))
const ref = 'pbiumddivadgbzxuymak'
if (new URL(env.SUPABASE_DEV_URL).hostname !== `${ref}.supabase.co`
  || new URL(env.SUPABASE_LIVE_URL).hostname === `${ref}.supabase.co`) throw new Error('Development identity mismatch')
if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_DEV_DB_PASSWORD) throw new Error('Development credentials missing')
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/database/pooler`, {
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(20000),
})
if (!response.ok) throw new Error(`Development pooler HTTP ${response.status}`)
const pool = (await response.json()).find((entry) => entry.database_type === 'PRIMARY')
if (!pool || pool.db_user !== `postgres.${ref}` || pool.db_port !== 6543
  || !pool.db_host.endsWith('.pooler.supabase.com') || pool.db_name !== 'postgres') throw new Error('Pooler identity mismatch')
const certificate = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt', {
  signal: AbortSignal.timeout(20000),
})
if (!certificate.ok) throw new Error(`TLS certificate HTTP ${certificate.status}`)
const ca = await certificate.text()
if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('Invalid TLS certificate')
const connection = new URL(`postgresql://${pool.db_host}:${pool.db_port}/${pool.db_name}`)
connection.username = pool.db_user
connection.password = env.SUPABASE_DEV_DB_PASSWORD
if (process.argv.includes('--audit-test-schemas') || process.argv.includes('--cleanup-test-schema')) {
  const client = new pg.Client({ connectionString: connection.toString(), ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
  await client.connect()
  try {
    const names = (await client.query("select nspname from pg_namespace where nspname ~ '^refund_expiry_[a-f0-9]{32}$' order by nspname")).rows.map(r => r.nspname)
    const requested = process.argv[process.argv.indexOf('--cleanup-test-schema') + 1]
    if (process.argv.includes('--cleanup-test-schema') && !names.includes(requested)) throw new Error('Unknown test schema')
    for (const name of names) {
      const tables = (await client.query('select tablename from pg_tables where schemaname=$1 order by tablename', [name])).rows.map(r => r.tablename)
      if (JSON.stringify(tables) !== JSON.stringify(['take_ledger', 'workspaces'])) throw new Error('Unexpected test schema objects')
      const counts = (await client.query(`select (select count(*)::int from ${name}.take_ledger) as ledger, (select count(*)::int from ${name}.workspaces) as workspaces`)).rows[0]
      console.log(JSON.stringify({ testSchema: name, tables, counts }))
      if (process.argv.includes('--cleanup-test-schema') && requested === name) {
        if (counts.ledger !== 0 || counts.workspaces !== 1) throw new Error('Unexpected test data; do not remove')
        await client.query(`drop schema ${name} cascade`)
        console.log(JSON.stringify({ removedEmptyTestSchema: name, applicationSchemasUntouched: true }))
      }
    }
  } finally { await client.end() }
  process.exit(0)
}
const child = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/manual/refund-expiry-db.manual.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, PADDLE_REFUND_TEST_DATABASE_URL: connection.toString(), PADDLE_REFUND_TEST_CA: ca,
    PADDLE_REFUND_TEST_BASELINE: process.argv.includes('--baseline') ? 'true' : 'false' },
})
if (child.error) throw new Error('Unable to launch isolated database tests')
process.exitCode = child.status ?? 1
