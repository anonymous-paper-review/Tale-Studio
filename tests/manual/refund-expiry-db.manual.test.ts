// 환불·만료·사용 판정은 같은 잔액을 보고, 실제 DB 검사는 기존 고객 장부를 바꾸지 않는다.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { takeBreakdown, type LedgerRow } from '@/lib/billing/account-summary'

const connectionString = process.env.PADDLE_REFUND_TEST_DATABASE_URL
if (!connectionString || !process.env.PADDLE_REFUND_TEST_CA) throw new Error('Run node scripts/test-refund-expiry-db.mjs')
const client = new Client({ connectionString, ssl: { ca: process.env.PADDLE_REFUND_TEST_CA, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
const schema = `refund_expiry_${randomUUID().replaceAll('-', '')}`
const ws = randomUUID()
const grantId = randomUUID()
const txn = 'txn_01m22n0brb6h60e2gxrp0e1jrn'
const query = (sql: string, values: unknown[] = []) => client.query(sql, values)
// 旧 migration의 바깥 BEGIN/COMMIT은 검사 트랜잭션을 끝내면 안 된다. 함수 안의 begin은 유지한다.
const qualify = (sql: string) => sql.replace(/^(?:begin|commit);\s*$/gim, '')
  .replaceAll('public.', `${schema}.`).replaceAll('search_path = public, pg_temp', `search_path = ${schema}, pg_temp`)

beforeAll(async () => {
  await client.connect()
  await query('begin')
  await query("set local statement_timeout = '15s'")
  await query(`create schema ${schema}`)
  await query(`create table ${schema}.workspaces (id uuid primary key)`)
  const original = readFileSync('supabase/migrations/20260901220000_add_billing_tables.sql', 'utf8')
  const table = original.slice(original.indexOf('create table public.take_ledger ('), original.indexOf('create index take_ledger_workspace_created_idx'))
  await query(qualify(table))
  await query(qualify(readFileSync('supabase/migrations/20260902150000_take_hold_rpcs.sql', 'utf8')))
  await query(qualify(readFileSync('supabase/migrations/20260908090000_take_expire_and_grant_unique.sql', 'utf8')))
  if (process.env.PADDLE_REFUND_TEST_BASELINE !== 'true') {
    await query(qualify(readFileSync('supabase/migrations/20260909130000_fix_refund_expiry.sql', 'utf8')))
  }
  await query(`insert into ${schema}.workspaces(id) values ($1)`, [ws])
  await query('savepoint fixture_start')
}, 30000)
beforeEach(async () => { await query('rollback to savepoint fixture_start') })
afterAll(async () => {
  await query('rollback').finally(() => client.end())
})

async function insert(kind: string, delta: number, grant: string | null = null, extra: { id?: string; expired?: boolean; transaction?: string; reason?: string } = {}) {
  const isGrant = kind.startsWith('grant_')
  await query(`insert into ${schema}.take_ledger
    (id, workspace_id, kind, delta, grant_id, expires_at, ref_kind, ref_id, reason)
    values ($1,$2,$3,$4,$5,case when $6::boolean is null then null when $6 then now()-interval '1 day' else now()+interval '1 day' end,$7,$8,$9)`,
  [extra.id ?? randomUUID(), ws, kind, delta, grant, extra.expired ?? null,
    isGrant ? 'paddle_transaction' : kind === 'refund_revoke' ? 'paddle_adjustment' : null,
    isGrant ? extra.transaction ?? txn : randomUUID(), extra.reason ?? null])
}
async function setup(linked: boolean, used = 0, refunded = 16, expired = true) {
  await insert('grant_plan', 16, null, { id: grantId, expired })
  if (used) await insert('hold', -used, grantId)
  if (refunded) await insert('refund_revoke', -refunded, linked ? grantId : null, { reason: `paddle refund of ${txn} (${Math.round(refunded / 16 * 100)}%)` })
}
async function balance() {
  const rows = (await query(`select * from ${schema}.take_ledger where workspace_id=$1`, [ws])).rows.map((r) => ({
    ...r, expires_at: r.expires_at?.toISOString() ?? null, created_at: r.created_at.toISOString(),
  })) as LedgerRow[]
  const result = (await query(`select ${schema}.take_hold($1,1,$2,true) as result`, [ws, randomUUID()])).rows[0].result
  return { app: takeBreakdown(rows).total, db: result.balance, ok: result.ok }
}
async function expire() { return (await query(`select ${schema}.take_expire_due() as result`)).rows[0].result }

describe.each([true, false])('DB도 신규·기존 환불을 같은 기준으로 계산한다 (연결: %s)', (linked) => {
  // 왜: 실제 구매 허용 함수가 화면과 다른 음수를 보면 새 구매분 사용까지 막힌다.
  it('환불로 이미 회수한 Take는 원래 만료일에 다시 차감하지 않는다', async () => {
    await setup(linked)
    expect(await balance()).toEqual({ app: 0, db: 0, ok: false })
    expect(await expire()).toEqual({ lots: 0, takes: 0 })
  })
  // 왜: 만료와 무관하게 사용분 채무는 유지해야 한다.
  it('환불 전에 이미 사용한 Take의 부족분은 기존 방침대로 음수로 남긴다', async () => {
    await setup(linked, 6)
    expect(await balance()).toEqual({ app: -6, db: -6, ok: false })
    expect(await expire()).toEqual({ lots: 0, takes: 0 })
  })
  // 왜: 먼저 만료한 미사용분을 환불이 또 회수하면 가짜 채무가 생긴다.
  it('만료 정산 뒤 환불해도 실제 사용분의 부족액만 남는다', async () => {
    await setup(linked, 6, 0)
    expect(await expire()).toEqual({ lots: 1, takes: 10 })
    await insert('refund_revoke', -16, linked ? grantId : null, { reason: `paddle refund of ${txn} (100%)` })
    expect(await balance()).toEqual({ app: -6, db: -6, ok: false })
    await insert('hold_release', 6, grantId)
    expect(await balance()).toEqual({ app: 0, db: 0, ok: false })
    expect(await expire()).toEqual({ lots: 0, takes: 0 })
  })
  // 왜: 부분 환불 후 원래 남은 수량만 한 번 만료해야 한다.
  it('부분 환불 후 남은 Take는 한 번만 만료된다', async () => {
    await setup(linked, 6, 8)
    expect(await balance()).toEqual({ app: 0, db: 0, ok: false })
    expect(await expire()).toEqual({ lots: 1, takes: 2 })
    expect(await expire()).toEqual({ lots: 0, takes: 0 })
    expect(await balance()).toEqual({ app: 0, db: 0, ok: false })
  })
  // 왜: 회수된 기존 lot에서 예약하면 추후 만료·반환 때 새 구매분이 사라질 수 있다.
  it('전액 환불 뒤 새로 산 Take만 사용을 위해 예약한다', async () => {
    await setup(linked, 0, 16, false)
    const newGrant = randomUUID()
    await insert('grant_purchase', 100, null, { id: newGrant, transaction: 'txn_new' })
    expect(await balance()).toEqual({ app: 100, db: 100, ok: true })
    const held = (await query(`select grant_id from ${schema}.take_ledger where kind='hold'`)).rows
    expect(held).toEqual([{ grant_id: newGrant }])
  })
})

// 왜: 환불이 없는 정상 만료·생성 실패 반환 경로도 유지해야 한다.
it('환불 없이 만료한 뒤 생성 실패로 돌아온 Take도 한 번만 만료된다', async () => {
  await setup(true, 6, 0)
  expect(await expire()).toEqual({ lots: 1, takes: 10 })
  await insert('hold_release', 6, grantId)
  expect(await expire()).toEqual({ lots: 1, takes: 6 })
  expect(await expire()).toEqual({ lots: 0, takes: 0 })
  expect(await balance()).toEqual({ app: 0, db: 0, ok: false })
})

// 왜: 구형 사유를 근거 없이 추측해 회수 기록을 다른 지급분에 연결하면 안 된다.
it('출처를 확인하지 못한 기존 회수 기록은 DB에서도 임의로 연결하지 않는다', async () => {
  await setup(false, 0, 0)
  await insert('refund_revoke', -16, null, { reason: 'unknown refund source' })
  expect(await balance()).toEqual({ app: -16, db: -16, ok: false })
})

// 왜: 지급 종류별 유일 제약만으로는 같은 거래에 서로 다른 종류의 지급분이 생기는 것을 막지 못한다.
it('원 지급분이 여러 개면 DB에서도 첫 지급분을 임의로 고르지 않는다', async () => {
  await setup(false)
  await insert('grant_purchase', 50, null, { expired: true })
  expect(await balance()).toEqual({ app: -16, db: -16, ok: false })
})

// 왜: 같은 결제 번호가 들어 있어도 다른 워크스페이스의 지급분은 환불 출처로 사용하면 안 된다.
it('다른 워크스페이스의 지급분은 기존 환불의 출처로 연결하지 않는다', async () => {
  const otherWorkspace = randomUUID()
  await query(`insert into ${schema}.workspaces(id) values ($1)`, [otherWorkspace])
  await query(`insert into ${schema}.take_ledger(workspace_id,kind,delta,ref_kind,ref_id) values ($1,'grant_plan',16,'paddle_transaction',$2)`, [otherWorkspace, txn])
  await insert('refund_revoke', -16, null, { reason: `paddle refund of ${txn} (100%)` })
  expect(await balance()).toEqual({ app: -16, db: -16, ok: false })
})

// 왜: 새 서버용 함수가 사용자에게 열리면 다른 고객의 잔액이 노출될 수 있다.
it('잔액 연결 계산은 일반 방문자와 로그인 고객이 직접 실행할 수 없다', async () => {
  const permissions = (await query(`select
    has_function_privilege('anon',$1,'execute') as anon,
    has_function_privilege('authenticated',$1,'execute') as authenticated,
    has_function_privilege('service_role',$1,'execute') as service_role`, [`${schema}.take_resolved_ledger(uuid)`])).rows[0]
  expect(permissions).toEqual({ anon: false, authenticated: false, service_role: true })
})
