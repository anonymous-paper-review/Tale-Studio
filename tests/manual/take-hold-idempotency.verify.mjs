// 개발 DB의 격리 공간에서 Take hold/release 원본과 보완 SQL을 실행해 작업별 멱등성을 검증한다.
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import dotenv from 'dotenv'
import pg from 'pg'

const root = process.cwd()
const env = dotenv.parse(readFileSync(resolve(root, '.env.local')))
const ref = 'pbiumddivadgbzxuymak'
const schema = `take_hold_${randomUUID().replaceAll('-', '')}`
const baseline = process.argv.includes('--baseline')
const output = resolve(root, `.claude/docs/2026-09-14/button-gating/take-hold-idempotency.${baseline ? 'before' : 'after'}.json`)
const result = { startedAt: new Date().toISOString(), developmentProject: ref, schema,
  safety: { paidProviderRequests: 0, applicationRowsRead: 0, applicationRowsWritten: 0, productionWrites: 0 },
  scope: 'Actual hold/release SQL in isolated PostgreSQL schema; synthetic jobs/ledgers only; no provider or application API.', baseline,
  observations: [] }
const sources = {
  take_resolved_ledger: '20260909130000_fix_refund_expiry.sql',
  take_hold: baseline ? '20260909130000_fix_refund_expiry.sql' : '20260914170000_take_hold_idempotency.sql',
  take_release_for_job: baseline ? '20260902150000_take_hold_rpcs.sql' : '20260914170000_take_hold_idempotency.sql',
}

let client, created = false, connectionText = '', publicBefore
const redact = (error) => {
  let message = error instanceof Error ? error.message : String(error)
  for (const secret of [...Object.values(env), connectionText].filter((v) => typeof v === 'string' && v.length >= 8)) message = message.replaceAll(secret, '[redacted]')
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted connection]')
}
const save = () => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`) }
const fingerprint = async () => (await client.query("select count(*)::int as count, md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\\n' order by p.oid), '')) as hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p')")).rows[0]
try {
  if (new URL(env.SUPABASE_DEV_URL).hostname !== `${ref}.supabase.co` || new URL(env.SUPABASE_LIVE_URL).hostname === `${ref}.supabase.co`) throw new Error('Development identity mismatch')
  if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_DEV_DB_PASSWORD) throw new Error('Development credentials missing')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/database/pooler`, { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`Development pooler HTTP ${response.status}`)
  const pool = (await response.json()).find((p) => p.database_type === 'PRIMARY')
  if (!pool || pool.db_user !== `postgres.${ref}` || pool.db_port !== 6543 || !pool.db_host.endsWith('.pooler.supabase.com') || pool.db_name !== 'postgres') throw new Error('Pooler identity mismatch')
  const certificate = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt', { signal: AbortSignal.timeout(20000) })
  if (!certificate.ok) throw new Error(`TLS certificate HTTP ${certificate.status}`)
  const ca = await certificate.text()
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('Invalid TLS certificate')
  const connection = new URL(`postgresql://${pool.db_host}:${pool.db_port}/${pool.db_name}`)
  connection.username = pool.db_user; connection.password = env.SUPABASE_DEV_DB_PASSWORD
  connectionText = connection.toString()
  client = new pg.Client({ connectionString: connectionText, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
  await client.connect()
  publicBefore = await fingerprint()
  result.safety.publicFunctionsBefore = publicBefore
  result.safety.verifiedTls = true
  if (!/^take_hold_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe schema identifier')
  await client.query(`create schema ${schema}`); created = true
  const tables = ['workspaces', 'projects', 'generation_jobs', 'take_ledger']
  // LIKE INCLUDING ALL copies definitions/indexes but not rows, foreign keys, triggers or RLS policies.
  for (const table of tables) await client.query(`create table ${schema}.${table} (like public.${table} including all)`)
  const unsafeDefaults = await client.query("select table_name,column_name,column_default from information_schema.columns where table_schema=$1 and column_default ~ '(public\\.|nextval)'", [schema])
  if (unsafeDefaults.rows.length) throw new Error('Cloned defaults reference application objects')
  const qualified = (sql) => sql.replaceAll('public.', `${schema}.`).replaceAll('search_path = public, pg_temp', `search_path = ${schema}, pg_temp`).replaceAll("'generation-capacity'", `'${schema}:generation-capacity'`)
  result.functions = []
  for (const [name, file] of Object.entries(sources)) {
    const source = readFileSync(resolve(root, 'supabase/migrations', file), 'utf8')
    const matched = source.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'))?.[0]
    if (!matched) throw new Error(`Original SQL definition not found: ${name}`)
    const sql = qualified(matched)
    if (/\bpublic\./i.test(sql)) throw new Error('Unqualified application reference remains')
    await client.query(sql)
    await client.query(`revoke all on all functions in schema ${schema} from public, anon, authenticated`)
    const live = (await client.query('select md5(prosrc) as body_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=\'public\' and proname=$1 order by p.oid', [name])).rows
    const isolated = (await client.query('select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and proname=$2', [schema, name])).rows[0].prosrc
    const normalizedBody = isolated.replaceAll(`${schema}.`, 'public.').replaceAll(`${schema}:generation-capacity`, 'generation-capacity')
    const originalBodyHash = createHash('md5').update(normalizedBody).digest('hex')
    result.functions.push({ name, source: `supabase/migrations/${file}`, sqlSha256: createHash('sha256').update(matched).digest('hex'), developmentBodyMatches: live.some((r) => r.body_hash === originalBodyHash) })
  }
  result.safety.isolation = 'Random schema, no application rows copied; original SQL qualified to schema; unique synthetic user/project/workspace ids; capacity advisory namespace isolated; no public/auth writes.'
  save()
  console.log(JSON.stringify({ stage: baseline ? 'baseline SQL loaded into isolated development schema' : 'idempotent SQL loaded into isolated development schema', functions: result.functions.length }))
  const status = await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/manual/take-hold-idempotency.manual.test.ts', '--reporter=verbose'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000,
      env: { ...process.env, TAKE_HOLD_DATABASE_URL: connectionText, TAKE_HOLD_CA: ca, TAKE_HOLD_SCHEMA: schema, TAKE_HOLD_OUTPUT: output },
    })
    child.stdout.on('data', (chunk) => process.stdout.write(redact(chunk.toString())))
    child.stderr.on('data', (chunk) => process.stderr.write(redact(chunk.toString())))
    child.on('error', () => reject(new Error('Unable to launch isolated tests')))
    child.on('exit', (code, signal) => signal ? reject(new Error(`Test process ended: ${signal}`)) : done(code ?? 1))
  })
  Object.assign(result, JSON.parse(readFileSync(output, 'utf8')))
  result.testProcessExitCode = status; process.exitCode = status
} catch (error) { process.exitCode = 1; result.failure = redact(error); console.error(JSON.stringify({ failure: result.failure })) }
finally {
  if (client) {
    try {
      if (created) {
        await client.query('begin'); await client.query("set local statement_timeout = '15s'")
        await client.query(`drop schema ${schema} cascade`); await client.query('commit')
        result.safety.temporarySchemaRemoved = !(await client.query('select exists(select 1 from pg_namespace where nspname=$1) as remains', [schema])).rows[0].remains
      }
      result.safety.publicFunctionsAfter = await fingerprint()
      result.safety.publicFunctionsUnchanged = JSON.stringify(result.safety.publicFunctionsAfter) === JSON.stringify(publicBefore)
      if (!result.safety.publicFunctionsUnchanged || (created && !result.safety.temporarySchemaRemoved)) throw new Error('Isolation cleanup verification failed')
    } catch (error) { process.exitCode = 1; result.cleanupFailure = redact(error) }
    finally { await client.end().catch(() => {}) }
  }
  result.finishedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ stage: 'finished', removed: result.safety.temporarySchemaRemoved, publicFunctionsUnchanged: result.safety.publicFunctionsUnchanged, exitCode: process.exitCode ?? 0 }))
}
