// One-off DDL applier — runs a single migration file against the live Supabase
// pooler connection WITHOUT touching supabase CLI migration history.
// Reads password from env (SUPABASE_DB_PASSWORD); never logs it.
//
// Usage: node .claude/cache/db/_apply_migration.mjs databases/migrations/007_align_live_schema.sql [--dry]
import { readFileSync } from 'node:fs'
import pg from 'pg'

const file = process.argv[2]
const dry = process.argv.includes('--dry')
if (!file) { console.error('usage: _apply_migration.mjs <sql-file> [--dry]'); process.exit(1) }

const pw = process.env.SUPABASE_DB_PASSWORD
if (!pw) { console.error('SUPABASE_DB_PASSWORD not set'); process.exit(1) }

const sql = readFileSync(file, 'utf8')
const connectionString =
  `postgresql://postgres.qnjnrihfpqkdhjuzvepy:${encodeURIComponent(pw)}` +
  `@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`

const client = new pg.Client({ connectionString })
await client.connect()
try {
  // snapshot shots columns before
  const before = await client.query(
    `select column_name from information_schema.columns where table_name='shots' order by 1`)
  const beforeCols = new Set(before.rows.map(r => r.column_name))
  console.log(`shots columns before: ${beforeCols.size}`)

  if (dry) {
    console.log('--- DRY: SQL to execute ---')
    console.log(sql)
  } else {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log('✅ applied:', file)
  }

  const after = await client.query(
    `select column_name, data_type from information_schema.columns where table_name='shots' order by 1`)
  const afterCols = after.rows.map(r => `${r.column_name}:${r.data_type}`)
  const added = after.rows.filter(r => !beforeCols.has(r.column_name)).map(r => `${r.column_name} (${r.data_type})`)
  console.log(`shots columns after: ${after.rows.length}`)
  if (added.length) console.log('newly added:\n  - ' + added.join('\n  - '))
  else console.log('no new columns (already present or dry-run)')
} catch (e) {
  try { await client.query('ROLLBACK') } catch {}
  console.error('❌ failed:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
