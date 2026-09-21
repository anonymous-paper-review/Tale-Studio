// 개발 DB의 임시 공간에서 main 영상 제한의 실제 경합을 검사하고 공용 데이터 변경 없이 제거한다.
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import dotenv from 'dotenv'
import pg from 'pg'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error(`Missing ${name}`)
  return resolve(process.argv[index + 1])
}
const repoPath = argument('--repo-path')
if (!repoPath) throw new Error('Required --repo-path: use the main 867cda83 snapshot')
const credentialsPath = argument('--credentials-path', resolve(workspace, '.env.local'))
const outputPath = argument('--output-path', resolve(workspace, '.claude/docs/2026-09-11/concurrency-audit/db-results.json'))
const migrationPath = resolve(repoPath, 'supabase/migrations/20260909120000_generation_video_capacity_gate.sql')
const migrationSha256 = createHash('sha256').update(readFileSync(migrationPath)).digest('hex')
const expectedMigrationSha256 = '4e73f397d7a7e732275df7f8e2728cef452e9aff4e4e053d006fa1a7cf4af4a6'
if (migrationSha256 !== expectedMigrationSha256) throw new Error('Main 867cda83 migration fingerprint mismatch; database experiment not started')
const env = dotenv.parse(readFileSync(credentialsPath))
const ref = 'pbiumddivadgbzxuymak'
const schema = `capacity_audit_${randomUUID().replaceAll('-', '')}`
const result = {
  startedAt: new Date().toISOString(), developmentProject: ref, schema,
  codeSource: repoPath, migration: '20260909120000_generation_video_capacity_gate.sql',
  migrationSha256,
  safety: { applicationRowsRead: 0, applicationRowsWritten: 0, paidFalRequests: 0, publicMigrationsApplied: 0 },
  observations: [], policyResults: [],
}
let client
let created = false
let publicBefore
let connectionText = ''
let stage = 'development identity'
function redact(error) {
  let message = error instanceof Error ? error.message : String(error)
  for (const secret of Object.values(env).filter((value) => value.length >= 8).concat(connectionText)) {
    if (secret) message = message.replaceAll(secret, '[redacted]')
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted connection]')
}
function save() {
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
}
async function publicFingerprint() {
  return (await client.query("select count(*)::int as function_count, md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\\n' order by p.oid), '')) as fingerprint from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p')")).rows[0]
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
  stage = 'read-only development connection verification'
  await client.connect()
  await client.query('begin read only')
  try {
    const identity = (await client.query("select current_database() as database, current_user as role, current_setting('transaction_read_only') as read_only, pg_is_in_recovery() as recovery")).rows[0]
    if (identity.database !== 'postgres' || identity.read_only !== 'on' || identity.recovery) throw new Error('Unexpected development database identity')
    publicBefore = await publicFingerprint()
    Object.assign(result.safety, { verifiedTls: true, developmentIdentityVerified: true, publicFunctionsBefore: publicBefore })
  } finally { await client.query('rollback') }
  stage = 'isolated schema creation'
  if (!/^capacity_audit_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema identifier')
  await client.query(`create schema ${schema}`)
  created = true
  save()
  console.log(JSON.stringify({ check: 'isolated database experiment', developmentProject: ref, migrationSha256: result.migrationSha256, concurrency: 12, verifiedTls: true }))
  stage = 'isolated database tests'
  const status = await new Promise((resolveStatus, reject) => {
    const child = spawn(process.execPath, [resolve(workspace, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/manual/concurrency-capacity-db.manual.test.ts', '--reporter=verbose'], {
      cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000,
      env: {
        ...process.env, CAPACITY_AUDIT_DATABASE_URL: connectionText, CAPACITY_AUDIT_CA: ca,
        CAPACITY_AUDIT_SCHEMA: schema, CAPACITY_AUDIT_REPO_PATH: repoPath, CAPACITY_AUDIT_OUTPUT_PATH: outputPath,
      },
    })
    child.stdout.on('data', (chunk) => process.stdout.write(redact(chunk.toString())))
    child.stderr.on('data', (chunk) => process.stderr.write(redact(chunk.toString())))
    child.once('error', () => reject(new Error('Unable to launch isolated database tests')))
    child.once('exit', (code, signal) => signal ? reject(new Error(`Isolated test process ended: ${signal}`)) : resolveStatus(code ?? 1))
  })
  if (existsSync(outputPath)) Object.assign(result, JSON.parse(readFileSync(outputPath, 'utf8')))
  result.testProcessExitCode = status
  process.exitCode = status
} catch (error) {
  process.exitCode = 1
  result.failure = { stage, message: redact(error) }
  console.error(JSON.stringify(result.failure))
} finally {
  if (client) {
    try {
      await client.query('rollback')
      if (created) {
        await client.query('begin')
        await client.query("set local statement_timeout = '15s'")
        await client.query(`drop schema ${schema} cascade`)
        await client.query('commit')
        const remains = (await client.query('select exists(select 1 from pg_namespace where nspname=$1) as remains', [schema])).rows[0].remains
        if (remains) throw new Error('Test schema cleanup did not complete')
        result.safety.temporarySchemaRemoved = true
      }
      if (publicBefore) {
        const publicAfter = await publicFingerprint()
        result.safety.publicFunctionsAfter = publicAfter
        result.safety.publicFunctionsUnchanged = JSON.stringify(publicAfter) === JSON.stringify(publicBefore)
        if (!result.safety.publicFunctionsUnchanged) throw new Error('Public function fingerprint changed during experiment')
      }
      console.log(JSON.stringify({ check: 'cleanup and public function fingerprints', temporarySchemaRemoved: result.safety.temporarySchemaRemoved, publicFunctionsUnchanged: result.safety.publicFunctionsUnchanged }))
    } catch (error) {
      process.exitCode = 1
      result.cleanupFailure = redact(error)
      console.error(JSON.stringify({ failedStage: 'test cleanup', schema, error: redact(error) }))
    } finally { await client.end().catch(() => {}) }
  }
  result.finishedAt = new Date().toISOString()
  save()
}
