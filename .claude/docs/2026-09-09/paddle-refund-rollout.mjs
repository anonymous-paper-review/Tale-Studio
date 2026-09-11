// 환불·만료 migration 한 파일만 감사·적용한다. 코드 main 착륙 전에는 Live 적용을 허용하지 않는다.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parse } from 'dotenv'
import pg from 'pg'

const env = parse(readFileSync('.env.local'))
const action = process.argv[2]
assert.ok(['audit-dev', 'apply-dev', 'audit-live', 'apply-live'].includes(action))
const live = action.endsWith('-live')
const targetUrl = env[live ? 'SUPABASE_LIVE_URL' : 'SUPABASE_DEV_URL']
const ref = new URL(targetUrl).hostname.split('.')[0]
assert.equal(new URL(env.SUPABASE_DEV_URL).hostname, 'pbiumddivadgbzxuymak.supabase.co')
assert.notEqual(new URL(env.SUPABASE_LIVE_URL).hostname, 'pbiumddivadgbzxuymak.supabase.co')
assert.equal(ref === 'pbiumddivadgbzxuymak', !live)
const password = env[live ? 'SUPABASE_LIVE_DB_PASSWORD' : 'SUPABASE_DEV_DB_PASSWORD']
const management = live && !password
assert.ok(password || management, 'Scoped database password is required')
const file = 'supabase/migrations/20260909130000_fix_refund_expiry.sql'
const sql = readFileSync(file, 'utf8')
const sha256 = createHash('sha256').update(sql).digest('hex')
if (action === 'apply-live') {
  const landed = execFileSync('git', ['show', `origin/main:${file}`], { encoding: 'utf8' })
  assert.equal(landed, sql, 'Live migration requires the exact file on freshly fetched origin/main')
  const dev = JSON.parse(readFileSync('.claude/docs/2026-09-09/paddle-refund-apply-dev.json'))
  assert.equal(dev.appliedSha256, sha256, 'Development verification must precede Live')
}
const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }
const literal = value => Array.isArray(value) ? `array[${value.map(literal).join(',')}]` : `'${String(value).replaceAll("'", "''")}'`
async function managementQuery(sqlText, readOnly) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query${readOnly ? '/read-only' : ''}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sqlText, ...(readOnly ? {} : { read_only: false }) }), signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error(`Scoped SQL API HTTP ${response.status}`)
  const rows = await response.json()
  assert.ok(Array.isArray(rows), 'Unexpected SQL API response; do not assume a result shape')
  return { rows }
}
let client
let query
if (management) {
  // 운영 비밀번호 별명이 없으면 검증한 Live ref의 공식 API를 쓴다. 개발 비밀번호를 운영에 재사용하지 않는다.
  assert.equal(ref, 'qnjnrihfpqkdhjuzvepy')
  query = (text, values = []) => {
    assert.match(text.trim(), /^select\b/i, 'HTTP requests cannot share BEGIN/COMMIT state')
    return managementQuery(text.replace(/\$(\d+)/g, (_, i) => literal(values[Number(i) - 1])), true)
  }
} else {
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/database/pooler`, { headers, signal: AbortSignal.timeout(20000) })
assert.ok(response.ok, `Pooler metadata HTTP ${response.status}`)
const pool = (await response.json()).find(x => x.database_type === 'PRIMARY')
assert.ok(pool && pool.db_user === `postgres.${ref}` && pool.db_port === 6543 && pool.db_host.endsWith('.pooler.supabase.com'))
const certificate = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt', { signal: AbortSignal.timeout(20000) })
assert.ok(certificate.ok)
const ca = await certificate.text()
client = new pg.Client({ host: pool.db_host, port: pool.db_port, user: pool.db_user, database: pool.db_name, password,
  ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
query = (text, values = []) => client.query(text, values)
await client.connect()
}
try {
  const before = (await query(`select p.proname, p.prosrc, p.prosecdef, p.proconfig,
    has_function_privilege('anon', p.oid, 'execute') as anon_execute,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('take_hold','take_expire_due','take_resolved_ledger') order by p.proname`)).rows
  const ledger = (await query(`select count(*)::int as rows, count(*) filter(where kind='refund_revoke')::int as refunds,
    count(*) filter(where kind='refund_revoke' and grant_id is not null)::int as linked_refunds from public.take_ledger`)).rows[0]
  const unmatched = (await query(`select count(*)::int as refunds_without_unique_source from public.take_ledger r
    where r.kind='refund_revoke' and r.grant_id is null and
    (select count(*) from public.take_ledger g where g.workspace_id=r.workspace_id
      and g.kind in ('grant_free','grant_plan','grant_purchase','grant_bonus') and g.ref_kind='paddle_transaction'
      and g.ref_id=substring(r.reason from '^paddle (?:refund|chargeback) of (txn_[a-z0-9]+) \\([0-9]+%\\)$')) <> 1`)).rows[0]
  const out = { at: new Date().toISOString(), environment: live ? 'live' : 'development', ref, migration: file, sha256, ledger, ...unmatched,
    functionsBefore: before.map(({ prosrc, ...rest }) => ({ ...rest, bodySha256: createHash('sha256').update(prosrc).digest('hex') })), applied: false }
  if (action.startsWith('apply-')) {
    // 현재 함수는 검증한 운영 기준 또는 같은 수정본이어야 한다. 다른 세션의 새 함수 구현은 덮어쓰지 않는다.
    const baseline = readFileSync('supabase/migrations/20260908090000_take_expire_and_grant_unique.sql', 'utf8')
    for (const fn of before) {
      assert.ok(baseline.includes(fn.prosrc) || sql.includes(fn.prosrc), `Unexpected ${fn.proname} body; stop before overwrite`)
    }
    if (management) {
      // BEGIN/COMMIT을 HTTP 요청 둘로 나누지 않는다. 이력 검증·함수 교체·이력 기록은 단일 트랜잭션이다.
      const atomic = `begin; set local lock_timeout='5s'; set local statement_timeout='30s';
        do $guard$ begin
          if exists (select 1 from supabase_migrations.schema_migrations where version='20260909130000'
            and statements <> ${literal([sql])}::text[]) then raise exception 'Migration version conflict'; end if;
        end $guard$;
        ${sql}
        insert into supabase_migrations.schema_migrations(version,name,statements)
        values ('20260909130000','fix_refund_expiry',${literal([sql])}::text[]) on conflict(version) do nothing;
        commit;`
      await managementQuery(atomic, false)
    } else {
    await query('begin')
    await query("set local lock_timeout='5s'")
    await query("set local statement_timeout='30s'")
    const history = await query('select statements from supabase_migrations.schema_migrations where version=$1', ['20260909130000'])
    if (history.rows.length) {
      assert.ok(history.rows[0].statements.join('\n').includes(sql.trim()), 'Migration version already used by different SQL')
    } else {
      await query(sql)
      await query('insert into supabase_migrations.schema_migrations(version, name, statements) values ($1,$2,$3)', ['20260909130000', 'fix_refund_expiry', [sql]])
    }
    await query('commit')
    }
    out.applied = true
    out.appliedSha256 = sha256
    out.ledgerRowsRewritten = 0
    out.connection = management ? 'official scoped Management API; one explicit transaction' : 'scoped TLS PostgreSQL connection'
    const permission = (await query(`select has_function_privilege('anon','public.take_resolved_ledger(uuid)','execute') as anon,
      has_function_privilege('authenticated','public.take_resolved_ledger(uuid)','execute') as authenticated,
      has_function_privilege('service_role','public.take_resolved_ledger(uuid)','execute') as service_role`)).rows[0]
    assert.deepEqual(permission, { anon: false, authenticated: false, service_role: true })
    out.helperPermissions = permission
  }
  const path = `.claude/docs/2026-09-09/paddle-refund-${action}.json`
  const text = JSON.stringify(out, null, 2) + '\n'
  const old = existsSync(path) ? readFileSync(path, 'utf8') : null
  const patch = old ? `*** Update File: ${path}\n@@\n${old.trimEnd().split('\n').map(l=>'-'+l).join('\n')}\n${text.trimEnd().split('\n').map(l=>'+'+l).join('\n')}\n`
    : `*** Add File: ${path}\n${text.trimEnd().split('\n').map(l=>'+'+l).join('\n')}\n`
  execFileSync('apply_patch', [`*** Begin Patch\n${patch}*** End Patch`], { stdio: 'pipe' })
  console.log(JSON.stringify(out, null, 2))
} catch (error) {
  if (client) await query('rollback').catch(() => {})
  throw error
} finally { if (client) await client.end() }
