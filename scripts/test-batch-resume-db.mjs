// 일괄 이어가기 DB 검사는 고정한 개발 프로젝트에서만 실행한다. 운영 연결과 비밀값 출력은 금지한다.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'

const env = dotenv.parse(readFileSync('.env.local'))
const ref = 'pbiumddivadgbzxuymak'
const expectedHost = `${ref}.supabase.co`
if (!env.SUPABASE_DEV_URL || new URL(env.SUPABASE_DEV_URL).hostname !== expectedHost
  || !env.SUPABASE_LIVE_URL || new URL(env.SUPABASE_LIVE_URL).hostname === expectedHost) {
  throw new Error('Development database identity is not confirmed')
}
if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_DEV_DB_PASSWORD) {
  throw new Error('Development database test credentials are missing')
}
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/database/pooler`, {
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
})
if (!response.ok) throw new Error(`Development pooler metadata HTTP ${response.status}`)
const pools = await response.json()
const pool = pools.find((entry) => entry.database_type === 'PRIMARY')
if (!pool || pool.db_user !== `postgres.${ref}` || pool.db_port !== 6543
  || !pool.db_host.endsWith('.pooler.supabase.com') || pool.db_name !== 'postgres') {
  throw new Error('Development pooler identity is not confirmed')
}
const certificate = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt')
if (!certificate.ok) throw new Error(`Supabase TLS certificate HTTP ${certificate.status}`)
const ca = await certificate.text()
if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('Invalid Supabase TLS certificate response')
const connection = new URL(`postgresql://${pool.db_host}:${pool.db_port}/${pool.db_name}`)
connection.username = pool.db_user
connection.password = env.SUPABASE_DEV_DB_PASSWORD
console.log('Running batch reservation tests against the pinned development database. Live untouched.')
const child = spawnSync('pnpm', ['exec', 'vitest', 'run', 'tests/manual/batch-resume-db.manual.test.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    BATCH_RESUME_TEST_DATABASE_URL: connection.toString(),
    BATCH_RESUME_TEST_CA: ca,
  },
})
if (child.error) throw new Error('Unable to launch development database tests', { cause: child.error })
process.exitCode = child.status ?? 1
