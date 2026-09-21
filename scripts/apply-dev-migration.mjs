// 개발 DB(pbiumddivadgbzxuymak)에만 마이그레이션 파일 하나를 적용하고 supabase 이력 표에 기록한다.
//
// 왜 CLI `supabase db push` 를 안 쓰나: supabase/.temp/project-ref 가 live(qnjnrihfpqkdhjuzvepy)에 링크돼 있어
//   그냥 돌리면 운영 DB 에 올라간다. 이 스크립트는 .env.local 의 개발 식별자를 세 번 대조하고(SUPABASE_DEV_URL ·
//   LIVE 와 다름 · pooler 사용자 이름) 그 뒤에만 실행한다. 접속 방식은 scripts/test-rough-reservation-dev-db.mjs 와 같다.
//
// 사용: node scripts/apply-dev-migration.mjs supabase/migrations/<version>_<name>.sql [--dry-run]
//   · 같은 version 이 supabase_migrations.schema_migrations 에 이미 있으면 아무것도 하지 않는다.
//   · SQL 파일이 begin/commit 을 스스로 갖는 관례라 파일을 그대로 실행하고, 성공한 뒤 이력 행을 넣는다.
//   · --dry-run 은 접속·식별자·이력 확인까지만 하고 실행하지 않는다.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import dotenv from 'dotenv'
import pg from 'pg'

const file = process.argv[2]
if (!file || !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(file)) {
  console.error('usage: node scripts/apply-dev-migration.mjs supabase/migrations/<version>_<name>.sql [--dry-run]')
  process.exit(2)
}
const dryRun = process.argv.includes('--dry-run')
const version = basename(file).slice(0, 14)
const name = basename(file).slice(15, -4)
const sql = readFileSync(file, 'utf8')
const sha256 = createHash('sha256').update(sql).digest('hex')

const env = dotenv.parse(readFileSync('.env.local'))
const ref = 'pbiumddivadgbzxuymak'
let client
let connectionText = ''
let stage = 'development identity'

function redact(error) {
  let message = error instanceof Error ? error.message : String(error)
  for (const secret of [env.SUPABASE_ACCESS_TOKEN, env.SUPABASE_DEV_DB_PASSWORD, connectionText]) {
    if (secret) message = message.replaceAll(secret, '[redacted]')
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted connection]')
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

  stage = 'connection verification'
  await client.connect()
  const identity = (await client.query("select current_database() as database, pg_is_in_recovery() as recovery")).rows[0]
  if (identity.database !== 'postgres' || identity.recovery) throw new Error('Unexpected development database identity')

  stage = 'migration history check'
  const historyPresent = (await client.query("select to_regclass('supabase_migrations.schema_migrations') is not null as present")).rows[0].present
  if (!historyPresent) throw new Error('supabase_migrations.schema_migrations missing on development DB')
  const recorded = (await client.query('select version, name from supabase_migrations.schema_migrations where version=$1', [version])).rows
  console.log(JSON.stringify({ check: 'history', developmentProject: ref, version, name, sha256, alreadyRecorded: recorded.length > 0, dryRun }))
  if (recorded.length > 0) {
    console.log(JSON.stringify({ result: 'skipped', reason: 'version already recorded' }))
  } else if (dryRun) {
    console.log(JSON.stringify({ result: 'dry-run', wouldApply: file }))
  } else {
    stage = 'apply'
    await client.query(sql)
    stage = 'record history'
    await client.query(
      'insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)',
      [version, name, [sql]],
    )
    console.log(JSON.stringify({ result: 'applied', appliedAt: new Date().toISOString(), environment: 'development', version, name, sha256, productionChanged: false }))
  }
} catch (error) {
  process.exitCode = 1
  console.error(JSON.stringify({ failedStage: stage, error: redact(error) }))
} finally {
  if (client) await client.end().catch(() => {})
}
