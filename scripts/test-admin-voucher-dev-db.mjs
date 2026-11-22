// 바우처 관리자 [저장]·[해지] DB 검사(tests/manual/admin-voucher-db.manual.test.ts)를 개발 DB에서 돌린다.
//   검사는 한 트랜잭션 안에서만 쓰고 무조건 rollback 하므로 개발 DB에 남는 것은 없다. 운영 DB는 건드리지 않는다.
//
// 사용: node scripts/test-admin-voucher-dev-db.mjs [--baseline]
//   --baseline 은 새 마이그레이션(20261122041500)을 트랜잭션에 올리지 않고 개발 DB에 지금 있는 함수로 돌린다.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'

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
const child = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/manual/admin-voucher-db.manual.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, ADMIN_VOUCHER_TEST_DATABASE_URL: connection.toString(), ADMIN_VOUCHER_TEST_CA: ca,
    ADMIN_VOUCHER_TEST_BASELINE: process.argv.includes('--baseline') ? 'true' : 'false' },
})
if (child.error) throw new Error('Unable to launch development database tests')
process.exitCode = child.status ?? 1
