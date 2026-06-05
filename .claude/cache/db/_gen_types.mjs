// Generate src/types/database.ts from the live DB via information_schema.
// Avoids Docker/login that `supabase gen types` requires. Reuses the static
// Json type + helper-type footer from the existing database.ts so only the
// public.Tables block is regenerated from live truth.
//
// Usage: node .claude/cache/db/_gen_types.mjs   (writes to src/types/database.ts)
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const pw = process.env.SUPABASE_DB_PASSWORD
if (!pw) { console.error('SUPABASE_DB_PASSWORD not set'); process.exit(1) }
const client = new pg.Client({
  connectionString:
    `postgresql://postgres.qnjnrihfpqkdhjuzvepy:${encodeURIComponent(pw)}` +
    `@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
})

function tsType(col) {
  // array
  if (col.data_type === 'ARRAY') {
    const el = col.udt_name.replace(/^_/, '')
    return base(el) + '[]'
  }
  return base(col.udt_name || col.data_type)
}
function base(udt) {
  switch (udt) {
    case 'uuid': case 'text': case 'varchar': case 'bpchar': case 'name':
    case 'timestamptz': case 'timestamp': case 'date': case 'time': case 'timetz':
      return 'string'
    case 'int2': case 'int4': case 'int8': case 'numeric': case 'float4': case 'float8':
      return 'number'
    case 'bool': return 'boolean'
    case 'json': case 'jsonb': return 'Json'
    default: return 'string'
  }
}

const client_ = client
await client_.connect()
try {
  const tablesRes = await client.query(`
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'
    order by table_name`)
  const tables = tablesRes.rows.map(r => r.table_name)

  const colsRes = await client.query(`
    select table_name, column_name, data_type, udt_name, is_nullable,
           column_default, is_identity, is_generated
    from information_schema.columns
    where table_schema='public'
    order by table_name, ordinal_position`)

  // FKs
  const fkRes = await client.query(`
    select tc.constraint_name, tc.table_name,
           kcu.column_name, ccu.table_name as ref_table, ccu.column_name as ref_col
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name=ccu.constraint_name and tc.table_schema=ccu.table_schema
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
    order by tc.table_name, kcu.column_name`)

  const byTable = {}
  for (const t of tables) byTable[t] = { cols: [], fks: [] }
  for (const c of colsRes.rows) if (byTable[c.table_name]) byTable[c.table_name].cols.push(c)
  for (const f of fkRes.rows) if (byTable[f.table_name]) byTable[f.table_name].fks.push(f)

  const indent = (n) => '  '.repeat(n)
  let out = ''
  for (const t of tables) {
    const { cols, fks } = byTable[t]
    out += `${indent(3)}${t}: {\n`
    // Row
    out += `${indent(4)}Row: {\n`
    for (const c of cols) {
      const nul = c.is_nullable === 'YES' ? ' | null' : ''
      out += `${indent(5)}${c.column_name}: ${tsType(c)}${nul}\n`
    }
    out += `${indent(4)}}\n`
    // Insert
    out += `${indent(4)}Insert: {\n`
    for (const c of cols) {
      const optional = c.is_nullable === 'YES' || c.column_default != null ||
        c.is_identity === 'YES' || c.is_generated === 'ALWAYS'
      const nul = c.is_nullable === 'YES' ? ' | null' : ''
      out += `${indent(5)}${c.column_name}${optional ? '?' : ''}: ${tsType(c)}${nul}\n`
    }
    out += `${indent(4)}}\n`
    // Update (all optional)
    out += `${indent(4)}Update: {\n`
    for (const c of cols) {
      const nul = c.is_nullable === 'YES' ? ' | null' : ''
      out += `${indent(5)}${c.column_name}?: ${tsType(c)}${nul}\n`
    }
    out += `${indent(4)}}\n`
    // Relationships
    out += `${indent(4)}Relationships: [\n`
    for (const f of fks) {
      out += `${indent(5)}{\n`
      out += `${indent(6)}foreignKeyName: "${f.constraint_name}"\n`
      out += `${indent(6)}columns: ["${f.column_name}"]\n`
      out += `${indent(6)}isOneToOne: false\n`
      out += `${indent(6)}referencedRelation: "${f.ref_table}"\n`
      out += `${indent(6)}referencedColumns: ["${f.ref_col}"]\n`
      out += `${indent(5)}},\n`
    }
    out += `${indent(4)}]\n`
    out += `${indent(3)}}\n`
  }

  // Stitch: reuse existing header (Json + Database opening) and footer (helper types)
  const existing = readFileSync('src/types/database.ts', 'utf8')
  const footerStart = existing.indexOf('type DatabaseWithoutInternals')
  const footer = existing.slice(footerStart)

  const header =
`export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
`
  const mid =
`    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

`
  writeFileSync('src/types/database.ts', header + out + mid + footer)
  console.log(`✅ wrote src/types/database.ts — ${tables.length} tables: ${tables.join(', ')}`)
} catch (e) {
  console.error('❌', e.message); process.exitCode = 1
} finally {
  await client.end()
}
